import { LIST_IDS } from '@common/constants'

/**
 * 备份导入时「把文件里的列表并到本地已有列表上」这段纯逻辑（票 08 契约 2）。
 *
 * 抽出来是为了能写回归用例（旧备份必须仍能导入），组件 `BackupBlock.vue` 只负责取数 / 落库。
 *
 * **试听列表（`LIST_IDS.DEFAULT`）在这里被跳过**：
 * - 旧备份的 `playList` 里它是**第 0 项**（更老的格式甚至没有 `id`，只有位置），旧实现按位置
 *   `shift()` 把它当成 `defaultList` 写回库里；票 08 已把这条列表从数据层删除，所以这里**跳过**——
 *   不写进任何列表，尤其**不并进「我的收藏」**（避免把试听过的歌混进真收藏）。
 * - 新备份（票 08 之后导出）本来就不含它，第 0 项是「我的收藏」，按 id 匹配不会误伤。
 *
 * `id` 缺失的第 0 项也一起跳过：那是老格式「第 0 项 = 试听列表」的形态，留着会被当成一条
 * 没有 id 的自建列表塞进库。
 */

/** 备份文件里的一条列表（旧格式可能没有 id / locationUpdateTime，`list` 的元素形态也随格式而异） */
export interface ImportedListInfo {
  id?: string
  name: string
  source?: LX.OnlineSource
  sourceListId?: string
  locationUpdateTime?: number | null
  list: any[]
}

/** 本地已有的一条列表（`BackupBlock.vue` 的 `getAllLists()`：`[loveList, ...userLists]`） */
export interface LocalListInfo {
  id?: string
  name: string
  list: LX.Music.MusicInfo[]
  source?: LX.OnlineSource
  sourceListId?: string
  locationUpdateTime?: number | null
}

export interface MergedListData {
  loveList: LX.Music.MusicInfo[]
  userList: LocalListInfo[]
}

/**
 * 把导入的列表并进本地列表（就地改 `localLists`，调用方每次都会新取一份，不用复制）。
 *
 * @param localLists `getAllLists()` 的结果：**第 0 项是「我的收藏」**，其后都是自建列表
 * @param importedLists 备份文件里的列表数组
 * @param mapMusic 把文件里的歌曲整形成当前格式（旧格式走 `toNewMusicInfo`，新格式走 `fixNewMusicInfoQuality`）
 * @returns 可直接交给 `overwriteListFull` 的 `{ loveList, userList }`
 */
export const mergeImportedLists = (
  localLists: LocalListInfo[],
  importedLists: ImportedListInfo[],
  mapMusic: (list: any[]) => LX.Music.MusicInfo[],
): MergedListData => {
  for (const [index, list] of importedLists.entries()) {
    // 试听列表：按 id 认（旧备份里它在第 0 项）；没有 id 的第 0 项是更老格式里的同一条，一并跳过
    if (list.id == LIST_IDS.DEFAULT || (index === 0 && list.id == null)) continue
    try {
      const targetList = localLists.find(l => l.id == list.id)
      if (targetList) {
        targetList.list = mapMusic(list.list)
      } else {
        localLists.push({
          id: list.id,
          name: list.name,
          list: mapMusic(list.list),
          source: list.source,
          sourceListId: list.sourceListId,
          locationUpdateTime: list.locationUpdateTime ?? null,
        })
      }
    } catch (err) {
      console.log(err)
    }
  }

  const [loveList, ...userList] = localLists
  return {
    // `localLists` 至少有一项（`getAllLists()` 总会放「我的收藏」）；仍留个兜底，避免取数失败时空指针
    loveList: loveList ? loveList.list : [],
    userList,
  }
}
