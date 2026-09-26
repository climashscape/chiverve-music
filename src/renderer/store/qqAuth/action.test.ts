import { beforeEach, describe, expect, it, vi } from 'vitest'
import { favAlbumIds, favLists, favPlaylistIds, favSongIds, favSongIdsLoaded, isInited, labels } from '@renderer/store/user/state'
import { status } from './state'
import { logout, refreshQrcode } from './action'

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
