import { beforeEach, describe, expect, it, vi } from 'vitest'
import { status } from '@renderer/store/qqAuth/state'
import { totalTextOf, useUserList } from './useUserList'

const { getFans, getFollowUsers, getFriends } = vi.hoisted(() => ({
  getFans: vi.fn(),
  getFollowUsers: vi.fn(),
  getFriends: vi.fn(),
}))

// 数据层换成桩：这里只钉 `useUserList` 自己的分派 / 状态落点 / 分页，真接口不在测试里打（本机约定）
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { user: { getFans, getFollowUsers, getFriends } } },
}))

/**
 * `/friends` 三个 Tab 的取数接缝（dom project，`views/**` 白名单里）。
 *
 * 钉住四件事——都是「界面会直接露出错值」的地方：
 *   1. 三个 kind 分别调**哪个方法**（关注 ≠ 关注的歌手；好友走的是另一个模块）；
 *   2. 成功 / 空 / 失败 / 未登录**四种状态的文案落点**（`noItemLabel` 与 `needLogin` 分开）；
 *   3. 分页：`loadMore` 追加且 page 递增；`hasMore=false` 时**不发请求**（防重复拉）；
 *   4. `totalTextOf`：好友那口 `total=null` → 空串（界面整行不渲染），不是「共 0 位」。
 *
 * 文案断言用 key 本身：dom setup 的 `window.i18n.t` 桩就是 `key => key`（见 `test/setup/dom.ts`）。
 */
const user = (id: string) => ({
  id,
  name: id,
  img: '',
  desc: '',
  fans: 0,
  isFollow: false,
  isFollowed: false,
  source: 'tx' as LX.OnlineSource,
})

const page = (count: number, total: number | null, hasMore: boolean, offset = 0) => ({
  list: Array.from({ length: count }, (_, i) => user(`u${offset + i + 1}`)),
  total,
  page: 1,
  limit: 30,
  hasMore,
})

beforeEach(() => {
  vi.clearAllMocks()
  status.isLogin = false
  getFans.mockResolvedValue(page(2, 12, false))
  getFollowUsers.mockResolvedValue(page(1, 9, true))
  getFriends.mockResolvedValue(page(0, null, false))
})

describe('friends 的 useUserList：分派到正确的方法', () => {
  it('follow → getFollowUsers；fans → getFans；friend → getFriends', async() => {
    await useUserList('follow').loadFirst()
    expect(getFollowUsers).toHaveBeenCalledWith(1)
    expect(getFans).not.toHaveBeenCalled()

    await useUserList('fans').loadFirst()
    expect(getFans).toHaveBeenCalledWith(1)

    await useUserList('friend').loadFirst()
    expect(getFriends).toHaveBeenCalledWith(1)
  })
})

describe('friends 的 useUserList：四种状态的落点', () => {
  it('成功：列表 + total + hasMore，文案清空', async() => {
    const { state, loadFirst } = useUserList('fans')

    await loadFirst()

    expect(state.list.map(item => item.id)).toEqual(['u1', 'u2'])
    expect(state.total).toBe(12)
    expect(state.hasMore).toBe(false)
    expect(state.noItemLabel).toBe('')
    expect(state.needLogin).toBe(false)
  })

  it('成功但为空：落 `no_item`（不是「加载中」）', async() => {
    getFans.mockResolvedValue(page(0, 0, false))
    const { state, loadFirst } = useUserList('fans')

    await loadFirst()

    expect(state.list).toEqual([])
    expect(state.noItemLabel).toBe('no_item')
  })

  it('取数失败：清空 + `list__load_failed`，且**不抛**（弱依赖）', async() => {
    getFans.mockRejectedValue(new Error('boom'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { state, loadFirst } = useUserList('fans')

    await loadFirst()

    expect(state.noItemLabel).toBe('list__load_failed')
    expect(state.list).toEqual([])
    expect(state.total).toBeNull()
    expect(state.needLogin).toBe(false)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('未登录：走 `needLogin` 引导态，**不是**失败文案', async() => {
    getFans.mockRejectedValue(new Error('QQ 音乐未登录'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { state, loadFirst } = useUserList('fans')

    await loadFirst()

    expect(state.needLogin).toBe(true)
    expect(state.noItemLabel).toBe('')
    expect(state.list).toEqual([])
    log.mockRestore()
  })

  it('登录后再拉一次：引导态解除', async() => {
    getFans.mockRejectedValueOnce(new Error('QQ 音乐未登录'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { state, loadFirst } = useUserList('fans')

    await loadFirst()
    expect(state.needLogin).toBe(true)

    await loadFirst()
    expect(state.needLogin).toBe(false)
    expect(state.list).toHaveLength(2)
    log.mockRestore()
  })
})

describe('friends 的 useUserList：分页', () => {
  it('loadMore 追加下一页并递增 page（不覆盖已加载的行）', async() => {
    getFollowUsers
      .mockResolvedValueOnce(page(2, 4, true, 0))
      .mockResolvedValueOnce(page(2, 4, false, 2))
    const { state, loadFirst, loadMore } = useUserList('follow')

    await loadFirst()
    expect(state.page).toBe(1)

    await loadMore()

    expect(getFollowUsers).toHaveBeenLastCalledWith(2)
    expect(state.list.map(item => item.id)).toEqual(['u1', 'u2', 'u3', 'u4'])
    expect(state.page).toBe(2)
    expect(state.hasMore).toBe(false)
  })

  it('hasMore=false 时 loadMore 不发请求（防重复拉同一页）', async() => {
    getFollowUsers.mockResolvedValue(page(2, 2, false))
    const { loadFirst, loadMore } = useUserList('follow')

    await loadFirst()
    await loadMore()

    expect(getFollowUsers).toHaveBeenCalledTimes(1)
  })

  it('加载更多失败：**保留已加载的行**，只挂失败文案', async() => {
    getFollowUsers
      .mockResolvedValueOnce(page(2, 4, true, 0))
      .mockRejectedValueOnce(new Error('boom'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { state, loadFirst, loadMore } = useUserList('follow')

    await loadFirst()
    await loadMore()

    expect(state.list).toHaveLength(2)
    expect(state.page).toBe(1)
    expect(state.noItemLabel).toBe('list__load_failed')
    log.mockRestore()
  })
})

describe('friends 的 totalTextOf（好友那口没有总数）', () => {
  it('有 total → 「共 N 位」文案', async() => {
    const { state, loadFirst } = useUserList('fans')
    await loadFirst()

    expect(totalTextOf(state)).toBe('friends__total')
  })

  it('total 为 null（好友）→ 空串，界面整行不渲染', async() => {
    const { state, loadFirst } = useUserList('friend')
    await loadFirst()

    expect(state.total).toBeNull()
    expect(totalTextOf(state)).toBe('')
  })
})

/**
 * 放在文件末尾：这条会把 `status.isLogin` 翻成 true，可能顺带触发**前面用例留下的实例**
 * 的 watch（它们都停在引导态）。那些实例的断言已经跑完，所以无影响；但也别往后面再加用例。
 */
describe('friends 的 useUserList：登录成功后自动重拉', () => {
  it('从「请先登录」直接出列表，不必切走再切回', async() => {
    getFans.mockRejectedValueOnce(new Error('QQ 音乐未登录'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { state, loadFirst } = useUserList('fans')

    await loadFirst()
    expect(state.needLogin).toBe(true)

    status.isLogin = true
    await vi.waitFor(() => { expect(state.list).toHaveLength(2) })

    expect(state.needLogin).toBe(false)
    status.isLogin = false
    log.mockRestore()
  })
})
