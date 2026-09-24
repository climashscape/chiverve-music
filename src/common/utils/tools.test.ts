import { describe, expect, it } from 'vitest'
import { formatMusicName, toNewMusicInfo, toOldMusicInfo } from './tools'

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

/**
 * `formatMusicName` 的语义契约（设置页重构票 07：下载命名从三选一枚举改成自由模板串，
 * `download.fileNameTemplate` 就是喂给它的模板）。三个老预设的渲染结果必须与改造前逐字符一致，
 * 其余边界按下面钉住 —— 它同时服务下载落盘与四处「复制歌名」。
 */
describe('formatMusicName（下载命名模板）', () => {
  it('三个老预设的渲染结果与改造前一致', () => {
    expect(formatMusicName('歌名 - 歌手', '富士山下', '陈奕迅')).toBe('富士山下 - 陈奕迅')
    expect(formatMusicName('歌手 - 歌名', '富士山下', '陈奕迅')).toBe('陈奕迅 - 富士山下')
    expect(formatMusicName('歌名', '富士山下', '陈奕迅')).toBe('富士山下')
  })

  it('不含占位词的模板原样输出（字面量模板）', () => {
    expect(formatMusicName('my_music', '富士山下', '陈奕迅')).toBe('my_music')
  })

  it('重复的占位词全部替换', () => {
    expect(formatMusicName('歌名_歌名_歌手_歌手', '富士山下', '陈奕迅')).toBe('富士山下_富士山下_陈奕迅_陈奕迅')
  })

  it('一趟替换：艺术家名里含「歌名」时不会被二次替换', () => {
    // 分两趟 `replace('歌手',…).replace('歌名',…)` 的写法会把刚填进去的艺术家名又替掉一次
    expect(formatMusicName('歌手 - 歌名', '富士山下', '歌名手')).toBe('歌名手 - 富士山下')
  })

  it('只认两个占位词，花括号写法按字面保留', () => {
    expect(formatMusicName('{歌名} - {歌手}', '富士山下', '陈奕迅')).toBe('{富士山下} - {陈奕迅}')
  })
})
