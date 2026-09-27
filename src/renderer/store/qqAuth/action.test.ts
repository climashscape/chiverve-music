import { beforeEach, describe, expect, it, vi } from 'vitest'
import { favAlbumIds, favLists, favPlaylistIds, favSongIds, favSongIdsLoaded, isInited, labels } from '@renderer/store/user/state'
import { status } from './state'
import { initQQAuth, logout, refreshQrcode } from './action'

/**
 * 登录 / 登出对**账号中心缓存**的处置（2026-09-26 审查）。
 *
 * 真机症状：未登录时进过任一页（`initUserCenter` 把 `isInited` 置 true）→ 登录后不再取数；
 * 换号后 `favSongIds` 还是上一个人的（该移除的又收藏一遍）。
 *
 * 修法是在这两条路径上复位会话缓存。这里只钉**行为**（缓存清空、`isInited` 放开），
 * 不关心实现放在哪个函数里；登录成功那半条走真实二维码轮询链路（假定时器）。
 *
 * 只桩掉最外层的 IPC（登录流程本身在主进程），store 与状态写回都是真的。
 */

const ipc = vi.hoisted(() => ({
  getQQAuthStatus: vi.fn(),
  getQQLoginQrcode: vi.fn(),
  checkQQLogin: vi.fn(),
  cancelQQLogin: vi.fn(),
  logoutQQ: vi.fn(),
  refreshQQCredential: vi.fn(),
  onQQAuthStatusChange: vi.fn(),
}))

vi.mock('@renderer/utils/ipc', () => ipc)
// 数据层的关注列表缓存（`tx/singer.js` 的 `followedSingers`）不带账号维度 → 换号必须作废。
// 这一层只用一个探针替掉，避免把真 tx 链（needle / store）拉进本用例
const singerCache = vi.hoisted(() => ({ clearFollowSingerCache: vi.fn() }))
vi.mock('@renderer/utils/musicSdk/tx/singer', () => singerCache)
// user/action 顶层会 import 真 SDK（本用例不碰取数，换成空壳避免连带初始化）
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { user: {}, songList: {} } },
}))

const AUTH_STATUS = {
  isLogin: false,
  musicidMasked: null,
  expiresAt: null,
  expiresInSeconds: null,
  lastRefreshError: null,
}

const seedUserCenter = () => {
  favLists.splice(0, favLists.length, { id: 'p1' } as any)
  favSongIds.push('1')
  favSongIdsLoaded.value = true
  favAlbumIds.push('mid1')
  favPlaylistIds.push('tid1')
  labels.favLists = 'list__load_failed'
  isInited.value = true
}

const clearUserCenter = () => {
  for (const list of [favLists, favSongIds, favAlbumIds, favPlaylistIds]) list.splice(0, list.length)
  favSongIdsLoaded.value = false
  labels.favLists = ''
  isInited.value = false
}

beforeEach(() => {
  vi.clearAllMocks()
  clearUserCenter()
  Object.assign(status, AUTH_STATUS)
})

describe('store/qqAuth/action 的登录态切换：账号中心缓存必须跟着复位', () => {
  it('登出 → 列表 / 收藏态 / 文案 / isInited 全清（换号后不会拿上一个人的收藏态）', async() => {
    seedUserCenter()
    ipc.logoutQQ.mockResolvedValue({ ...AUTH_STATUS, isLogin: false })

    await logout()

    expect(status.isLogin).toBe(false)
    expect(favLists).toHaveLength(0)
    expect(favSongIds).toHaveLength(0)
    expect(favSongIdsLoaded.value).toBe(false)
    expect(favAlbumIds).toHaveLength(0)
    expect(favPlaylistIds).toHaveLength(0)
    expect(labels.favLists).toBe('')
    expect(isInited.value).toBe(false)
  })

  it('扫码登录成功 → 复位（未登录期间进过页面、isInited 被置过 true 也照样放开）', async() => {
    vi.useFakeTimers()
    try {
      seedUserCenter()
      ipc.getQQLoginQrcode.mockResolvedValue({ dataUrl: 'data:image/png;base64,x', createdAt: 1 })
      ipc.checkQQLogin.mockResolvedValue({ event: 'DONE', status: { ...AUTH_STATUS, isLogin: true } })

      await refreshQrcode()
      await vi.advanceTimersByTimeAsync(2000)

      expect(status.isLogin).toBe(true)
      expect(isInited.value).toBe(false)
      expect(favSongIds).toHaveLength(0)
      expect(favSongIdsLoaded.value).toBe(false)
      expect(favLists).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * 数据层的关注列表缓存也要在换号时作废（2026-09-27 登记并修的那处边界）。
 *
 * 真机症状的形状：`tx/singer.js` 的 `followedSingers` 是**会话级、不带账号维度**的缓存，
 * 换号后它还留着上一个账号的关注集合 → 新账号在歌手页会看到别人的关注态
 * （界面那份关注态表另有 `watch(status.isLogin)` 兜，两层合起来才盖住「页面上没挂关注键时换号」）。
 *
 * 钉两条：**身份真的变了才清**（主进程刷新凭证成功/失败也会推状态变更，那种情况清缓存只是白打列表请求）；
 * 登录、登出、换号三种变化都要清。
 */
describe('store/qqAuth/action 的登录态切换：数据层关注列表缓存作废', () => {
  it('身份变化才清缓存；只刷新凭证（身份未变）不清', async() => {
    ipc.getQQAuthStatus.mockResolvedValue({ ...AUTH_STATUS, isLogin: true, musicidMasked: '***0001' })

    await initQQAuth()
    const notify = ipc.onQQAuthStatusChange.mock.calls.at(-1)?.[0] as ((payload: { params: unknown }) => void) | undefined
    expect(typeof notify).toBe('function')

    // ① 只刷新凭证成功/失败：身份没变 → 不清
    notify!({ params: { ...AUTH_STATUS, isLogin: true, musicidMasked: '***0001', lastRefreshError: 'boom' } })
    expect(singerCache.clearFollowSingerCache).not.toHaveBeenCalled()

    // ② 登出：身份变了 → 清
    notify!({ params: { ...AUTH_STATUS, isLogin: false, musicidMasked: null } })
    expect(singerCache.clearFollowSingerCache).toHaveBeenCalledTimes(1)

    // ③ 换号：登录态没变、账号变了 → 也清（这条就是原来漏掉的窗口）
    notify!({ params: { ...AUTH_STATUS, isLogin: true, musicidMasked: '***0002' } })
    expect(singerCache.clearFollowSingerCache).toHaveBeenCalledTimes(2)
  })
})
