import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMusicUrl } from './online'

/**
 * `core/music/online.ts` 的 `getMusicUrl` 刷新路径收口（票 03b 同类）。
 *
 * 刷新取流（`isRefresh`）时要先删掉缓存里那条已知打不开的 URL；删缓存走 IPC，**它失败
 * 不该拦住这次取流**：原来的写法是裸 `await removeMusicUrl(...)`，IPC 一拒绝就整条
 * `getMusicUrl` 拒绝——上层会把「缓存没删掉」误记成「取流失败」，新流也不会发起。
 *
 * 这里钉住：删缓存失败时新流照常取到、调用方拿到 URL，且没有未处理的 rejection。
 */

const {
  getStoreMusicUrl,
  removeMusicUrl,
  saveMusicUrl,
  handleGetOnlineMusicUrl,
  getPlayQuality,
  isUnavailableError,
} = vi.hoisted(() => ({
  getStoreMusicUrl: vi.fn(),
  removeMusicUrl: vi.fn(),
  saveMusicUrl: vi.fn(),
  handleGetOnlineMusicUrl: vi.fn(),
  getPlayQuality: vi.fn(),
  isUnavailableError: vi.fn(),
}))

vi.mock('@renderer/utils/ipc', () => ({
  getMusicUrl: getStoreMusicUrl,
  removeMusicUrl,
  saveMusicUrl,
  saveLyric: vi.fn(),
}))
vi.mock('./utils', () => ({
  getPlayQuality,
  handleGetOnlineMusicUrl,
  handleGetOnlineLyricInfo: vi.fn(),
  handleGetOnlinePicUrl: vi.fn(),
  getCachedLyricInfo: vi.fn(),
  buildLyricInfo: vi.fn(),
}))
vi.mock('./unavailable', () => ({
  clearUnavailable: vi.fn(),
  isUnavailableError,
  markUnavailable: vi.fn(),
}))
vi.mock('@renderer/store/list/action', () => ({ updateListMusics: vi.fn() }))

const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

const musicInfo = {
  id: 'tx__song1',
  source: 'tx',
  name: '歌',
  singer: '手',
  meta: {},
} as unknown as LX.Music.MusicInfoOnline

describe('core/music/online 刷新取流时删缓存失败的收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStoreMusicUrl.mockResolvedValue('http://cached/old.mp3')
    removeMusicUrl.mockRejectedValue(new Error('IPC 拒绝'))
    handleGetOnlineMusicUrl.mockResolvedValue({ url: 'http://new/320.mp3', quality: '320k' })
    saveMusicUrl.mockResolvedValue(undefined)
    getPlayQuality.mockReturnValue('320k')
    isUnavailableError.mockReturnValue(false)
  })

  it('删缓存失败 → 新流照常取到，且没有未处理的 rejection', async() => {
    const unhandled = trackUnhandledRejection()

    const url = await getMusicUrl({ musicInfo, isRefresh: true })
    await new Promise(resolve => setTimeout(resolve, 0))
    unhandled.stop()

    expect(removeMusicUrl).toHaveBeenCalledWith(['tx__song1_320k'])
    expect(handleGetOnlineMusicUrl).toHaveBeenCalledTimes(1)
    expect(url).toBe('http://new/320.mp3')
    expect(unhandled.reasons).toEqual([])
  })

  it('不刷新时仍直接用缓存，不触发删缓存', async() => {
    const unhandled = trackUnhandledRejection()

    const url = await getMusicUrl({ musicInfo, isRefresh: false })
    await new Promise(resolve => setTimeout(resolve, 0))
    unhandled.stop()

    expect(url).toBe('http://cached/old.mp3')
    expect(removeMusicUrl).not.toHaveBeenCalled()
    expect(handleGetOnlineMusicUrl).not.toHaveBeenCalled()
    expect(unhandled.reasons).toEqual([])
  })
})
