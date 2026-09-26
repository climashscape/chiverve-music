import { beforeEach, describe, expect, it, vi } from 'vitest'
import singer, { clearFollowSingerCache } from './singer'

/**
 * 歌手页「关注态」（读侧，票 02 的读侧那一半）的钉子（node project）。
 *
 * 判据通道 = **全量关注列表 + mid 集合成员判定**（会话内缓存），不是搜索接口的 `concern_status`
 * ——为什么换通道写在 `singer.js` 的 `getFollowState` 注释里（2026-09-26 真机实测：匿名搜恒为 0、
 * 按名搜有漏、搜索模块一压就空）。这里钉的是**三态契约**与**缓存的边界**：
 *
 *   1. `true` = mid 在集合里；`false` = 列表拿到了但 mid 不在里面。
 *   2. **取不到 → `null`，绝不退化成 `false`**（未登录、请求失败）。界面把「不知道」画成
 *      「未关注」就是在撒谎，所以这一条是两个测试：未登录 / 网络错误都必须是 `null`。
 *   3. 一次 `Size=1000` 拿满（本账号 604 人实测 `HasMore=false` 一趟回来）；`HasMore=true`
 *      时才继续翻页（`From` 按页长累加）。
 *   4. 缓存是**会话级**：第二次问不再打接口；并发问只打一次；失败**不留缓存**（下次可重试）；
 *      写侧（关注 / 取关）成功后用 `clearFollowSingerCache()` 作废。
 *
 * 真实接口不在测试里打（本机约定：不伪造凭证、不打真接口）。
 */

const { getFollowSingers } = vi.hoisted(() => ({ getFollowSingers: vi.fn() }))

// `./user` 是整个模块被替掉：这一票不碰账号接口本身的取数（那有它自己的测试）
vi.mock('./user', () => ({ default: { getFollowSingers } }))

/** 一条关注列表行（`user.getFollowSingers` 的形状：卡片里 `id` 就是歌手 mid）。 */
const row = (mid: string) => ({ id: mid, name: `歌手${mid}`, img: '', desc: '', fans: 0, source: 'tx' })

/** 一页响应（`user.getFollowSingers` 的返回形状）。 */
const page = (mids: string[], hasMore = false, total = mids.length) => ({
  list: mids.map(row), total, page: 1, limit: 1000, source: 'tx', hasMore,
})

/** 让 `getFollowSingers` 按页码依次给响应。 */
const respondWith = (...pages: unknown[]) => {
  pages.forEach((p, i) => getFollowSingers.mockImplementationOnce(async() => {
    if (p instanceof Error) throw p
    return p
  }))
}

// `singer.js` 顶层还 import 了 `../../request` / `../../index` / `./utils/song`：
// 前者拉 needle + `@renderer/store`，后者顶层就碰 `document`——node 环境里都要挡掉
// （`singer.js` 的这一票只测 getFollowState，那些模块不参与）
vi.mock('../../request', () => ({ httpFetch: vi.fn() }))
vi.mock('../../index', async() => {
  const common = await import('@common/utils/common')
  return { ...common, decodeName: (str: unknown) => str }
})
// 别名那条是另一个模块 id（同 songDetail.test.ts 的注释），不挡它 node 环境会被 document 打死
vi.mock('@renderer/utils', async() => {
  const common = await import('@common/utils/common')
  return { ...common, decodeName: (str: unknown) => str }
})
vi.mock('./utils/song', () => ({ createSong: (raw: unknown) => raw }))

beforeEach(() => {
  // 用 reset（不是 clear）：`respondWith` 排的是 once 队列，残留的队列会漏进下一个用例
  vi.resetAllMocks()
  clearFollowSingerCache()
})

describe('tx/singer 的关注态：三态判据', () => {
  it('mid 在关注列表里 → true；不在 → false', async() => {
    respondWith(page(['m1', 'm2', 'm3']))

    await expect(singer.getFollowState('m2')).resolves.toBe(true)
    await expect(singer.getFollowState('m9')).resolves.toBe(false)
  })

  it('未登录（数据层抛「QQ 音乐未登录」）→ null，**不是 false**', async() => {
    respondWith(new Error('QQ 音乐未登录'))

    await expect(singer.getFollowState('m2')).resolves.toBe(null)
  })

  it('请求失败（网络 / 接口变了）→ null，**不是 false**', async() => {
    respondWith(new Error('socket hang up'))

    await expect(singer.getFollowState('m2')).resolves.toBe(null)
  })

  it('空 mid → null，且一次接口都不打（路由没带 mid 的兜底）', async() => {
    await expect(singer.getFollowState('')).resolves.toBe(null)
    await expect(singer.getFollowState(undefined as unknown as string)).resolves.toBe(null)
    expect(getFollowSingers).not.toHaveBeenCalled()
  })
})

describe('tx/singer 的关注态：全量拉取与分页', () => {
  it('一次 Size=1000 拿满（HasMore=false 就停），mid 按字符串比对', async() => {
    respondWith(page(['m1', 'm2']))

    await expect(singer.getFollowState('m1')).resolves.toBe(true)
    expect(getFollowSingers).toHaveBeenCalledTimes(1)
    expect(getFollowSingers).toHaveBeenCalledWith(1, 1000)
  })

  it('HasMore=true 时继续翻页，两页的 mid 都在判定集合里', async() => {
    respondWith(page(['m1'], true, 2), page(['m2'], false, 2))

    await expect(singer.getFollowState('m2')).resolves.toBe(true)
    await expect(singer.getFollowState('m5')).resolves.toBe(false)
    expect(getFollowSingers.mock.calls).toEqual([[1, 1000], [2, 1000]])
  })

  it('服务端忽略游标（又给同一页空页/无新条目）时不会死循环', async() => {
    // total 报 3 但每页都只回 1 条同样的人 → 靠 `!res.list.length` 之外的两条判据收住
    respondWith(page(['m1'], true, 3), page([], true, 3))

    await expect(singer.getFollowState('m1')).resolves.toBe(true)
    expect(getFollowSingers).toHaveBeenCalledTimes(2)
  })
})

describe('tx/singer 的关注态：会话缓存', () => {
  it('第二次问不再打接口（同一轮会话共用一份关注列表）', async() => {
    respondWith(page(['m1']))

    await singer.getFollowState('m1')
    await singer.getFollowState('m2')

    expect(getFollowSingers).toHaveBeenCalledTimes(1)
  })

  it('并发问只打一次（单飞；歌手页与页头信息本来就是并行发的）', async() => {
    respondWith(page(['m1']))

    const [a, b] = await Promise.all([singer.getFollowState('m1'), singer.getFollowState('m2')])

    expect(a).toBe(true)
    expect(b).toBe(false)
    expect(getFollowSingers).toHaveBeenCalledTimes(1)
  })

  it('失败不留缓存：下一次问会重试（与 useSinger 的 loadedMid「失败不写」同一条纪律）', async() => {
    respondWith(new Error('boom'), page(['m1']))

    await expect(singer.getFollowState('m1')).resolves.toBe(null)
    await expect(singer.getFollowState('m1')).resolves.toBe(true)
    expect(getFollowSingers).toHaveBeenCalledTimes(2)
  })

  it('clearFollowSingerCache()（写侧成功后调）会让下一次问重新拉', async() => {
    respondWith(page(['m1']), page(['m1', 'm2']))

    await expect(singer.getFollowState('m2')).resolves.toBe(false)
    clearFollowSingerCache()
    await expect(singer.getFollowState('m2')).resolves.toBe(true)
    expect(getFollowSingers).toHaveBeenCalledTimes(2)
  })
})
