import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestMsg } from '@renderer/utils/message'
import { appSetting } from '@renderer/store/setting'
import { handleGetOnlineMusicUrl } from './utils'

/**
 * 「取不出流就静默用网易云顶替」的接缝（`handleGetOnlineMusicUrl`）的钉子。
 *
 * 这里钉的是**失败语义不变**：兜底成功时返回原歌曲对象（界面因此看不出换过源）并如实上报 128k；
 * 兜底失败时抛**原**错误，所以失效曲登记、提示、自动跳过全都不受影响。
 * 另外钉住两类**不该兜底**的失败：用户切歌（取消请求）与限流。
 */

const { txGetMusicUrl, getFallbackMusicUrl } = vi.hoisted(() => ({
  txGetMusicUrl: vi.fn(),
  getFallbackMusicUrl: vi.fn(),
}))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { getMusicUrl: txGetMusicUrl } },
  supportQuality: {},
}))
vi.mock('./wyFallback', () => ({
  getFallbackMusicUrl,
  WY_FALLBACK_QUALITY: '128k',
}))

const musicInfo = {
  id: 'tx__song1',
  source: 'tx',
  name: '晴天',
  singer: '周杰伦',
  interval: '04:29',
  meta: {
    songId: 'song1',
    albumId: '1',
    albumName: '叶惠美',
    picUrl: '',
    qualitys: {},
    _qualitys: { '128k': true },
  },
} as unknown as LX.Music.MusicInfoOnline

const reply = (url: string, type: LX.Quality = '320k') => ({ promise: Promise.resolve({ url, type }), cancelHttp: vi.fn() })
const fail = (message: string) => ({ promise: Promise.reject(new Error(message)), cancelHttp: vi.fn() })

describe('handleGetOnlineMusicUrl：取流失败时的网易云兜底', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 只改第一项（取流前 await 的就是它）：整体重新赋值会撞 lint 的 no-floating-promises
    window.lx.apiInitPromise[0] = Promise.resolve(true)
    appSetting['player.wyFallback'] = true
    appSetting['player.playQuality'] = '128k'
  })

  it('主源成功：原样返回，不碰兜底', async() => {
    txGetMusicUrl.mockReturnValue(reply('http://qq/a.mp3', '320k'))

    await expect(handleGetOnlineMusicUrl({ musicInfo, isRefresh: false })).resolves.toEqual({
      musicInfo,
      url: 'http://qq/a.mp3',
      quality: '320k',
      isFromCache: false,
    })
    expect(getFallbackMusicUrl).not.toHaveBeenCalled()
  })

  it('主源失败 + 兜底成功：返回兜底直链、档位如实报 128k、歌曲对象不变', async() => {
    txGetMusicUrl.mockReturnValue(fail(requestMsg.noPermission))
    getFallbackMusicUrl.mockResolvedValue('http://m801.music.126.net/a.mp3')

    const result = await handleGetOnlineMusicUrl({ musicInfo, isRefresh: false })

    expect(result.url).toBe('http://m801.music.126.net/a.mp3')
    // 档位必须如实：URL 缓存的 key 是 `${id}_${type}`，报错档位会把 128k 的直链存进别的档位
    expect(result.quality).toBe('128k')
    // 同一个对象 → 来源标签 / 歌词 / 封面都不变，用户看不出换过源
    expect(result.musicInfo).toBe(musicInfo)
    expect(result.isFromCache).toBe(false)
  })

  it('兜底也拿不到：抛**原**错误（失效曲登记与提示的判据照旧成立）', async() => {
    txGetMusicUrl.mockReturnValue(fail(requestMsg.noPlayableUrl))
    getFallbackMusicUrl.mockResolvedValue(null)

    await expect(handleGetOnlineMusicUrl({ musicInfo, isRefresh: false })).rejects.toThrow(requestMsg.noPlayableUrl)
  })

  it('用户切歌（取消请求）不试兜底', async() => {
    txGetMusicUrl.mockReturnValue(fail(requestMsg.cancelRequest))

    await expect(handleGetOnlineMusicUrl({ musicInfo, isRefresh: false })).rejects.toThrow(requestMsg.cancelRequest)
    expect(getFallbackMusicUrl).not.toHaveBeenCalled()
  })

  it('限流（服务器繁忙）不试兜底', async() => {
    txGetMusicUrl.mockReturnValue(fail(requestMsg.tooManyRequests))

    await expect(handleGetOnlineMusicUrl({ musicInfo, isRefresh: false })).rejects.toThrow(requestMsg.tooManyRequests)
    expect(getFallbackMusicUrl).not.toHaveBeenCalled()
  })

  it('开关关掉：不试兜底，抛原错误', async() => {
    appSetting['player.wyFallback'] = false
    txGetMusicUrl.mockReturnValue(fail(requestMsg.noPermission))

    await expect(handleGetOnlineMusicUrl({ musicInfo, isRefresh: false })).rejects.toThrow(requestMsg.noPermission)
    expect(getFallbackMusicUrl).not.toHaveBeenCalled()
  })

  it('fallbackFirst（播放失败重试用尽）：先走兜底并直接返回，不再请求主源', async() => {
    getFallbackMusicUrl.mockResolvedValue('http://m801.music.126.net/b.mp3')

    const result = await handleGetOnlineMusicUrl({ musicInfo, isRefresh: true, fallbackFirst: true })

    expect(result.url).toBe('http://m801.music.126.net/b.mp3')
    expect(result.quality).toBe('128k')
    expect(txGetMusicUrl).not.toHaveBeenCalled()
  })

  it('fallbackFirst 但兜底也没成：回落到主源（最后一次机会，之后按原失败路径走）', async() => {
    getFallbackMusicUrl.mockResolvedValue(null)
    txGetMusicUrl.mockReturnValue(reply('http://qq/retry.mp3', '128k'))

    await expect(handleGetOnlineMusicUrl({ musicInfo, isRefresh: true, fallbackFirst: true })).resolves.toMatchObject({
      url: 'http://qq/retry.mp3',
      quality: '128k',
    })
  })
})
