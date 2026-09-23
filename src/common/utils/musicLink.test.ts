import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canJumpToAlbum, canJumpToSinger, canShareMusic, clearSingerCache, getAlbumMid, getSongMid, normalizeSingers, resolveSingers } from './musicLink'

/**
 * 钉住 ui-polish 工单 02 的共用判定与歌手解析的契约。
 *
 * 期望值的来源：新式歌曲对象的字段由 `tools.ts` 的 `toNewMusicInfo` 决定——
 * `meta.songId` 是 songmid（`tools.ts:5`），`meta.albumMid` 是专辑 mid（`tools.ts:38`），
 * 而本地源对象的 `meta.songId` 是**文件路径**（`tools.ts:5` 的注释），所以判定必须排除 local。
 * 歌手的 mid 不在歌曲对象里，要按需取歌曲详情的 `track_info.singer[]`（工单 02 的实现要点）。
 */

// 形状同 `toNewMusicInfo` 产出的在线对象（tx）
const onlineMusic = {
  id: 'tx_0039MnYb0qxYhV',
  name: '某首歌',
  singer: '某歌手',
  source: 'tx',
  interval: '03:55',
  meta: {
    songId: '0039MnYb0qxYhV',
    id: 123456,
    albumMid: '002fRO0N4FftzY',
    albumName: '某张专辑',
    picUrl: '',
    qualitys: [],
    _qualitys: {},
  },
} as unknown as LX.Music.MusicInfo

// 形状同本地的 `toNewMusicInfo` 分支：meta.songId 存的是文件路径
const localMusic = {
  id: 'local_/home/me/music/a.flac',
  name: '本地歌',
  singer: '本地歌手',
  source: 'local',
  interval: '04:00',
  meta: {
    songId: '/home/me/music/a.flac',
    filePath: '/home/me/music/a.flac',
    ext: 'flac',
  },
} as unknown as LX.Music.MusicInfo

describe('mid 提取与可跳判定', () => {
  it('在线歌曲能拿到 songmid 与 albumMid，三种跳转都可用', () => {
    expect(getSongMid(onlineMusic)).toBe('0039MnYb0qxYhV')
    expect(getAlbumMid(onlineMusic)).toBe('002fRO0N4FftzY')
    expect(canJumpToSinger(onlineMusic)).toBe(true)
    expect(canJumpToAlbum(onlineMusic)).toBe(true)
    expect(canShareMusic(onlineMusic)).toBe(true)
  })

  it('本地文件一律不可跳（meta.songId 是文件路径，不能当 mid 用）', () => {
    expect(getSongMid(localMusic)).toBe('')
    expect(getAlbumMid(localMusic)).toBe('')
    expect(canJumpToSinger(localMusic)).toBe(false)
    expect(canJumpToAlbum(localMusic)).toBe(false)
    expect(canShareMusic(localMusic)).toBe(false)
  })

  it('缺 albumMid 时只有专辑不可跳', () => {
    const noAlbum = { ...onlineMusic, meta: { ...onlineMusic.meta, albumMid: undefined } } as unknown as LX.Music.MusicInfo
    expect(canJumpToAlbum(noAlbum)).toBe(false)
    expect(canJumpToSinger(noAlbum)).toBe(true)
  })
})

describe('normalizeSingers', () => {
  it('保留有 mid 的项、丢掉没有 mid 的、并把字段统一成字符串', () => {
    expect(normalizeSingers([
      { mid: 123, name: 'A' },
      { mid: '', name: '没 mid' },
      { name: '缺 mid 字段' },
      null,
    ])).toEqual([{ mid: '123', name: 'A' }])
    expect(normalizeSingers(undefined)).toEqual([])
  })
})

describe('resolveSingers', () => {
  beforeEach(() => {
    clearSingerCache()
  })

  it('对象里已有歌手 mid 时不发请求', async() => {
    const fetchSingers = vi.fn()
    const withSingers = {
      ...onlineMusic,
      meta: { ...onlineMusic.meta, singers: [{ mid: '001', name: '甲' }, { mid: '002', name: '乙' }] },
    } as unknown as LX.Music.MusicInfo

    expect(await resolveSingers(withSingers, fetchSingers)).toEqual([{ mid: '001', name: '甲' }, { mid: '002', name: '乙' }])
    expect(fetchSingers).not.toHaveBeenCalled()
  })

  it('没有 mid 时取详情，同一位歌手第二次不再发请求（缓存）', async() => {
    const fetchSingers = vi.fn(async() => [{ mid: '001', name: '甲' }])

    expect(await resolveSingers(onlineMusic, fetchSingers)).toEqual([{ mid: '001', name: '甲' }])
    expect(await resolveSingers(onlineMusic, fetchSingers)).toEqual([{ mid: '001', name: '甲' }])
    expect(fetchSingers).toHaveBeenCalledTimes(1)
    expect(fetchSingers).toHaveBeenCalledWith('0039MnYb0qxYhV', onlineMusic)
  })

  it('取不到时返回空数组且不抛（失败不留缓存，再点一次能重试）', async() => {
    const fetchSingers = vi.fn(async() => { throw new Error('boom') })

    expect(await resolveSingers(onlineMusic, fetchSingers)).toEqual([])
    expect(await resolveSingers(onlineMusic, fetchSingers)).toEqual([])
    expect(fetchSingers).toHaveBeenCalledTimes(2)
  })

  it('本地文件不请求，直接返回空', async() => {
    const fetchSingers = vi.fn()
    expect(await resolveSingers(localMusic, fetchSingers)).toEqual([])
    expect(fetchSingers).not.toHaveBeenCalled()
  })
})
