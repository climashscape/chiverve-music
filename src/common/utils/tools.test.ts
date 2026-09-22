import { describe, expect, it } from 'vitest'
import { toNewMusicInfo, toOldMusicInfo } from './tools'

/**
 * 老式（musicSdk 内部平铺字段）与新式（UI/store，平台字段进 meta）两种歌曲模型的
 * 往返转换。字段清单来自 AGENTS.md §2.6 的两套数据模型表；这里用一份「像 tx 真实
 * 返回」的老式对象做往返，钉住跨层不丢字段这条硬要求（转换函数在
 * `common/utils/tools.ts:3-100`）。
 */

/** 老式在线歌曲对象：字段与 `tx/utils/song.js` 的 createSong 输出同形 */
const oldOnline = {
  source: 'tx',
  name: '富士山下',
  singer: '陈奕迅',
  songmid: '0039MnYb0qxYhV',
  songId: 1234567,
  interval: '04:19',
  albumName: 'What s Going On...?',
  albumId: '002fRO0N4FftzY',
  albumMid: '002fRO0N4FftzY',
  strMediaMid: '0039MnYb0qxYhV',
  img: 'https://y.gtimg.cn/music/photo_new/T002R500x500M000002fRO0N4FftzY.jpg',
  songType: 0,
  types: [
    { type: '128k', size: '3.96M' },
    { type: '320k', size: '9.90M' },
  ],
  _types: {
    '128k': { size: '3.96M' },
    '320k': { size: '9.90M' },
  },
}

describe('toNewMusicInfo / toOldMusicInfo（tx 在线歌曲）', () => {
  it('id 由 source 与 songmid 拼成，平台字段落到 meta 的约定位置', () => {
    const newInfo = toNewMusicInfo(oldOnline)

    expect(newInfo.id).toBe(`tx_${oldOnline.songmid}`)
    expect(newInfo.name).toBe(oldOnline.name)
    expect(newInfo.singer).toBe(oldOnline.singer)
    expect(newInfo.source).toBe('tx')
    expect(newInfo.interval).toBe(oldOnline.interval)

    // meta 的字段映射是本文件要钉的核心：songId 存的是 mid（不是数字 id）；
    // 数字 songId 放 meta.id；封面存 meta.picUrl（来自老式的 img）
    expect(newInfo.meta.songId).toBe(oldOnline.songmid)
    expect(newInfo.meta.id).toBe(oldOnline.songId)
    expect(newInfo.meta.albumName).toBe(oldOnline.albumName)
    expect(newInfo.meta.picUrl).toBe(oldOnline.img)
    expect(newInfo.meta.albumMid).toBe(oldOnline.albumMid)
    expect(newInfo.meta.strMediaMid).toBe(oldOnline.strMediaMid)
    expect(newInfo.meta.songType).toBe(oldOnline.songType)
    expect(newInfo.meta.qualitys).toEqual(oldOnline.types)
    expect(newInfo.meta._qualitys).toEqual(oldOnline._types)
  })

  it('往返转换后关键字段一一还原', () => {
    const roundTrip = toOldMusicInfo(toNewMusicInfo(oldOnline))

    expect(roundTrip.source).toBe(oldOnline.source)
    expect(roundTrip.name).toBe(oldOnline.name)
    expect(roundTrip.singer).toBe(oldOnline.singer)
    expect(roundTrip.songmid).toBe(oldOnline.songmid)
    expect(roundTrip.songId).toBe(oldOnline.songId)
    expect(roundTrip.interval).toBe(oldOnline.interval)
    expect(roundTrip.albumName).toBe(oldOnline.albumName)
    expect(roundTrip.albumId).toBe(oldOnline.albumId)
    expect(roundTrip.albumMid).toBe(oldOnline.albumMid)
    expect(roundTrip.strMediaMid).toBe(oldOnline.strMediaMid)
    expect(roundTrip.img).toBe(oldOnline.img)
    expect(roundTrip.songType).toBe(oldOnline.songType)
    expect(roundTrip.types).toEqual(oldOnline.types)
    expect(roundTrip._types).toEqual(oldOnline._types)
  })

  it('本地歌曲走另一条分支：filePath/ext 进 meta，回程补空 albumId 与空音质表', () => {
    const oldLocal = {
      source: 'local',
      name: 'local-song.mp3',
      singer: '未知歌手',
      songmid: '/home/user/Music/local-song.mp3',
      interval: '03:00',
    }
    const newInfo = toNewMusicInfo(oldLocal)
    expect(newInfo.source).toBe('local')
    expect(newInfo.meta.songId).toBe(oldLocal.songmid)
    // 没给 filePath 时回退到 songmid，ext 从 filePath 后缀推
    expect((newInfo.meta as LX.Music.MusicInfoMeta_local).filePath).toBe(oldLocal.songmid)
    expect((newInfo.meta as LX.Music.MusicInfoMeta_local).ext).toBe('mp3')

    const roundTrip = toOldMusicInfo(newInfo)
    expect(roundTrip.filePath).toBe(oldLocal.songmid)
    expect(roundTrip.ext).toBe('mp3')
    // 本地没有音质概念，回程填成空表（在线分支才有 types/_types）
    expect(roundTrip.albumId).toBe('')
    expect(roundTrip.types).toEqual([])
    expect(roundTrip._types).toEqual({})
  })
})
