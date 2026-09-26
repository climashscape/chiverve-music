import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFallbackMusicUrl, WY_FALLBACK_QUALITY } from './index'

/**
 * 兜底编排（`./index.ts`）的钉子。
 *
 * 它决定「要不要把这首歌交给网易云」，两条底线：
 * ①**只在严格匹配上才出手**（匹配错歌比不播更糟）；
 * ②失败一律返回 `null`，绝不把异常抛给播放链路。
 * 另外钉住会话内缓存：同一首歌反复失败是常态，不能每次都重搜一遍。
 */

const { searchMusic, wyGetMusicUrl } = vi.hoisted(() => ({
  searchMusic: vi.fn(),
  wyGetMusicUrl: vi.fn(),
}))
vi.mock('./api', () => ({ searchMusic, getMusicUrl: wyGetMusicUrl }))
// 兜底的成功/失败都要写 electron-log（写 `<userData>/logs/main.log`）。测试里换成桩：否则**跑一次测试
// 就会往真机日志里塞几行 [wy-fallback]**，把「这个功能在真机上有没有触发」这条判据搅浑。
vi.mock('@common/utils', async(importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, log: { info: vi.fn(), warn: vi.fn() } }
})

const musicInfo = (id: string) => ({
  id,
  source: 'tx',
  name: '晴天',
  singer: '周杰伦',
  interval: '04:29',
  meta: {},
} as unknown as LX.Music.MusicInfoOnline)

const candidate = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: '晴天',
  singer: '周杰伦',
  albumName: '叶惠美',
  duration: 269,
  ...over,
})

describe('getFallbackMusicUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchMusic.mockResolvedValue([])
    wyGetMusicUrl.mockResolvedValue(null)
  })

  it('兜底档位固定 128k（匿名能取到的那一档，上报给 URL 缓存要如实）', () => {
    expect(WY_FALLBACK_QUALITY).toBe('128k')
  })

  it('严格匹配上 → 返回该候选的直链', async() => {
    searchMusic.mockResolvedValue([candidate(1330348068)])
    wyGetMusicUrl.mockResolvedValue('http://m801.music.126.net/a.mp3')

    await expect(getFallbackMusicUrl(musicInfo('tx__a1'))).resolves.toBe('http://m801.music.126.net/a.mp3')
    expect(wyGetMusicUrl).toHaveBeenCalledWith(1330348068)
  })

  it('搜到但没有严格匹配（翻唱 / 别的版本）→ null，且不请求任何直链', async() => {
    searchMusic.mockResolvedValue([
      candidate(1, { name: '晴天 (深情版)', singer: 'Lucky小爱' }),
      candidate(2, { name: '晴天 (原唱 周杰伦)', singer: 'RyaVocal' }),
    ])

    await expect(getFallbackMusicUrl(musicInfo('tx__a2'))).resolves.toBeNull()
    expect(wyGetMusicUrl).not.toHaveBeenCalled()
  })

  it('搜不到 → null（不抛异常）', async() => {
    await expect(getFallbackMusicUrl(musicInfo('tx__a3'))).resolves.toBeNull()
  })

  it('多个严格匹配时逐个试：第一个拿不到直链就试下一个', async() => {
    searchMusic.mockResolvedValue([candidate(11), candidate(12)])
    wyGetMusicUrl.mockResolvedValueOnce(null).mockResolvedValueOnce('http://wy/b.mp3')

    await expect(getFallbackMusicUrl(musicInfo('tx__a4'))).resolves.toBe('http://wy/b.mp3')
    expect(wyGetMusicUrl).toHaveBeenCalledTimes(2)
  })

  it('同一首歌第二次调用不再重搜（失败过的也缓存，避免重试风暴）', async() => {
    searchMusic.mockResolvedValue([candidate(21)])

    await getFallbackMusicUrl(musicInfo('tx__a5'))
    await getFallbackMusicUrl(musicInfo('tx__a5'))

    expect(searchMusic).toHaveBeenCalledTimes(1)
  })

  it('并发的同一首歌只搜一次（预加载与播放会同时问到同一首）', async() => {
    searchMusic.mockResolvedValue([candidate(31)])

    await Promise.all([
      getFallbackMusicUrl(musicInfo('tx__a6')),
      getFallbackMusicUrl(musicInfo('tx__a6')),
    ])

    expect(searchMusic).toHaveBeenCalledTimes(1)
  })
})
