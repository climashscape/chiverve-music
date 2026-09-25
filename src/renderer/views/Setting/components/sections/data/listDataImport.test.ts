import { describe, expect, it } from 'vitest'
import { filterMusicList, toNewMusicInfo, fixNewMusicInfoQuality } from '@common/utils/tools'
import { mergeImportedLists, type ImportedListInfo, type LocalListInfo } from './listDataImport'

/**
 * 备份导入的回归用例（票 08 契约 2：**旧备份必须仍能导入**，且第 0 项那份试听列表被跳过）。
 *
 * 为什么要有它：导入的「按位置前移」是这次改造里最容易再被写错的一处——旧备份的第 0 项是试听列表、
 * 新备份的第 0 项是「我的收藏」，按位置 `shift()` 的旧写法在新格式下会把收藏的歌当成试听列表丢掉，
 * 而"按 id 认 + 跳过 default"这条口径靠这段用例钉住。纯函数，不碰 window / IPC。
 */

const mapOldMusic = (musicList: any[]) => filterMusicList(musicList.map(m => toNewMusicInfo(m)))
const mapNewMusic = (musicList: any[]) => filterMusicList(musicList).map(m => fixNewMusicInfoQuality(m))

/** 旧格式（playList）里的一首歌 */
const oldMusic = (songmid: string) => ({
  source: 'tx',
  songmid,
  name: `song_${songmid}`,
  singer: 'singer',
  interval: '03:00',
  albumName: 'album',
  types: [],
  _types: {},
  strMediaMid: songmid,
})

/** 新格式（playList_v2）里的一首歌 */
const newMusic = (id: string): LX.Music.MusicInfo => ({
  id: `tx_${id}`,
  name: `song_${id}`,
  singer: 'singer',
  source: 'tx',
  interval: '03:00',
  meta: {
    songId: id,
    albumName: 'album',
    qualitys: [],
    _qualitys: {},
    strMediaMid: id,
  },
})

/** `getAllLists()` 的结果：第 0 项是「我的收藏」，其后是自建列表 */
const localLists = (): LocalListInfo[] => [
  { id: 'love', name: 'list__name_love', list: [newMusic('old_love')] },
  { id: 'userlist_a', name: '原有列表 A', list: [newMusic('a1')] },
]

describe('mergeImportedLists：旧备份（第 0 项是试听列表）', () => {
  it('跳过试听列表、不并进收藏，收藏与自建列表照常导入', () => {
    const imported: ImportedListInfo[] = [
      { id: 'default', name: 'list__name_default', list: [oldMusic('d1'), oldMusic('d2'), oldMusic('d3')] },
      { id: 'love', name: 'list__name_love', list: [oldMusic('l1')] },
      { id: 'userlist_b', name: '导入的新列表', list: [oldMusic('b1')] },
    ]

    const { loveList, userList } = mergeImportedLists(localLists(), imported, mapOldMusic)

    // 收藏：只拿到备份里那份 love 的内容（1 首），试听列表那 3 首一首都没混进来
    expect(loveList).toHaveLength(1)
    expect(loveList.map(m => m.name)).toEqual(['song_l1'])
    // 自建列表：原有 A 没被这次导入碰到，备份里的 B 追加在后面；没有 default 这一条
    expect(userList.map(list => list.id)).toEqual(['userlist_a', 'userlist_b'])
    expect(userList[0].list.map(m => m.name)).toEqual(['song_a1'])
    expect(userList[1].list.map(m => m.name)).toEqual(['song_b1'])
    expect(userList.some(list => list.id == 'default')).toBe(false)
  })

  it('第 0 项没有 id（更老格式）：一并跳过，收藏仍按 id 认出来', () => {
    // 无 id 的第 0 项 = 老格式里的试听列表
    const legacyNoIdEntry: ImportedListInfo = { name: '试听列表', list: [oldMusic('d1')] }
    const imported: ImportedListInfo[] = [
      legacyNoIdEntry,
      { id: 'love', name: 'list__name_love', list: [oldMusic('l1'), oldMusic('l2')] },
    ]

    const { loveList, userList } = mergeImportedLists(localLists(), imported, mapOldMusic)

    expect(loveList.map(m => m.name)).toEqual(['song_l1', 'song_l2'])
    expect(userList.map(list => list.id)).toEqual(['userlist_a'])
  })

  it('备份里的自建列表与本地 id 撞车时覆盖本地那一条，而不是新增', () => {
    const imported: ImportedListInfo[] = [
      { id: 'default', name: 'list__name_default', list: [oldMusic('d1')] },
      { id: 'love', name: 'list__name_love', list: [] },
      { id: 'userlist_a', name: '原有列表 A', list: [oldMusic('a9')] },
    ]

    const { userList } = mergeImportedLists(localLists(), imported, mapOldMusic)

    expect(userList.map(list => list.id)).toEqual(['userlist_a'])
    expect(userList[0].list.map(m => m.name)).toEqual(['song_a9'])
  })
})

describe('mergeImportedLists：新备份（第 0 项就是收藏）', () => {
  it('不该把第 0 项当成试听列表丢掉（按 id 认，不按位置）', () => {
    const imported: ImportedListInfo[] = [
      { id: 'love', name: 'list__name_love', list: [newMusic('l1'), newMusic('l2')] },
      { id: 'userlist_c', name: '导入的新列表 C', list: [newMusic('c1')] },
    ]

    const { loveList, userList } = mergeImportedLists(localLists(), imported, mapNewMusic)

    expect(loveList.map(m => m.name)).toEqual(['song_l1', 'song_l2'])
    expect(userList.map(list => list.id)).toEqual(['userlist_a', 'userlist_c'])
    expect(userList[0].list.map(m => m.name)).toEqual(['song_a1'])
  })
})
