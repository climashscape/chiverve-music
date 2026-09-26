import { beforeEach, describe, expect, it, vi } from 'vitest'
import singer, { clearFollowSingerCache, FOLLOW_FEED_BATCH_SIZE } from './singer'

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

const { getFollowSingers, httpFetch } = vi.hoisted(() => ({ getFollowSingers: vi.fn(), httpFetch: vi.fn() }))

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
vi.mock('../../request', () => ({ httpFetch }))
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

/**
 * 关注动态的**批量取歌**（票 04 的数据层那一半）。
 *
 * 这一处是三张票都依赖的缝：一轮扫描 604 位歌手必须压成 21 个请求——`GetSingerSongList` 一次只问
 * 一位歌手，靠的是 `musicu.fcg` 的 body 顶层能放多个 `req_N` 模块（`getInfo` 就是一次发三个）。
 * 协议上限是硬的：30 个 module 全成，**31 个整个请求被拒**（顶层 `code=500000`），所以分块粒度
 * 与 `ok` 的语义都要被钉住——调用方靠 `ok` 决定「这位歌手的基线能不能推进」。
 */

/** 一个「整包成功」的响应体：请求体里每个 `req_N` 都回一个模块节点（一条歌） */
const okBody = (options: { body: Record<string, any> }) => {
  const body: Record<string, any> = { code: 0 }
  for (const key of Object.keys(options.body).filter(key => key.startsWith('req_'))) {
    const mid = options.body[key]?.param?.singerMid
    body[key] = {
      code: 0,
      data: { songList: [{ songInfo: { mid: `s_${mid}`, title: `歌_${mid}`, time_public: '2026-09-20', singer: [], file: {} } }] },
    }
  }
  return body
}

/**
 * `httpFetch` 的契约是**同步返回** `{ promise, cancelHttp }`（needle 的形状），调用方写的是
 * `await httpFetch(...).promise` ——所以桩**不能**写成 `async`（那样返回的是 Promise，
 * `.promise` 会是 undefined，现象是 `Cannot read properties of undefined (reading 'statusCode')`）。
 */
const respondFetch = (bodyOf: (options: { body: Record<string, any> }) => Record<string, any>) => {
  httpFetch.mockImplementation((_url: string, options: { body: Record<string, any> }) => ({
    promise: Promise.resolve({ statusCode: 200, body: bodyOf(options) }),
  }))
}

const mids = (count: number, prefix = 'm') => Array.from({ length: count }, (_, index) => `${prefix}${index}`)

describe('tx/singer 的关注动态批量取歌：分块与请求体', () => {
  it('604 位 → 21 个请求；每请求 ≤ 30 个 module，req_N 与 mid 一一对应', async() => {
    respondFetch(okBody)

    const result = await singer.getLatestSongs(mids(604), 1)

    expect(FOLLOW_FEED_BATCH_SIZE).toBe(30)
    expect(httpFetch).toHaveBeenCalledTimes(21)
    // 请求体里除了 30 个 `req_N` 还有 `comm`，所以按前缀数
    expect(Object.keys(httpFetch.mock.calls[0][1].body).filter(key => key.startsWith('req_')).length).toBe(30)
    expect(httpFetch.mock.calls[0][1].body.req_0.param.singerMid).toBe('m0')
    expect(httpFetch.mock.calls[0][1].body.req_29.param.singerMid).toBe('m29')
    expect(httpFetch.mock.calls[1][1].body.req_0.param.singerMid).toBe('m30')
    // 最后一块是余数：604 = 20×30 + 4
    expect(Object.keys(httpFetch.mock.calls[20][1].body).filter(key => key.startsWith('req_')).length).toBe(4)
    expect(httpFetch.mock.calls[20][1].body.req_3.param.singerMid).toBe('m603')
    expect(result).toHaveLength(604)
    expect(result.every(entry => entry.ok && entry.songs.length == 1)).toBe(true)
  })

  it('参数是 `order: 0`（发布时间倒序），不是歌手页歌曲 tab 用的 `order: 1`（热度序）', async() => {
    respondFetch(okBody)

    await singer.getLatestSongs(['m1'], 10)

    expect(httpFetch.mock.calls[0][1].body.req_0).toMatchObject({
      module: 'musichall.song_list_server',
      method: 'GetSingerSongList',
      param: { singerMid: 'm1', order: 0, begin: 0, num: 10 },
    })
  })

  it('条目带上发布时间（`time_public`）——`createSong` 不带这个字段，条目行要显示它', async() => {
    respondFetch(okBody)

    const [entry] = await singer.getLatestSongs(['m1'], 1)

    expect(entry.songs[0].publishTime).toBe('2026-09-20')
    expect((entry.songs[0].song as { mid?: string }).mid).toBe('s_m1')
  })

  it('整包被拒（顶层 code != 0）→ 这一块歌手全 `ok: false`，别的块不受影响', async() => {
    // 第一块整包失败（探针实测的形状：31 个 module 会回 code=500000）
    respondFetch(options => options.body.req_0?.param?.singerMid.startsWith('x') ? okBody(options) : { code: 500000 })

    const result = await singer.getLatestSongs([...mids(30), ...mids(30, 'x')], 1)

    expect(result.slice(0, 30).every(entry => !entry.ok && entry.songs.length == 0)).toBe(true)
    expect(result.slice(30).every(entry => entry.ok)).toBe(true)
  })

  it('某个模块节点自己报错 → 只有那一位歌手 `ok: false`（同块其它人正常）', async() => {
    respondFetch(options => ({ ...okBody(options), req_1: { code: 10006 } }))

    const result = await singer.getLatestSongs(['m0', 'm1'], 1)

    expect(result[0]).toMatchObject({ mid: 'm0', ok: true })
    expect(result[1]).toMatchObject({ mid: 'm1', ok: false, songs: [] })
  })

  it('空列表 → 一个请求都不打', async() => {
    await singer.getLatestSongs([], 1)
    expect(httpFetch).not.toHaveBeenCalled()
  })
})
