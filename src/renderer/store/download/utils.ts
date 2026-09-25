import { appSetting } from '@renderer/store/setting'
import { loveList, userLists } from '@renderer/store/list/listManage'
import { filterFileName } from '@common/utils/common'
import { clipFileNameLength } from '@common/utils/tools'
import { joinPath } from '@common/utils/nodejs'

export const buildSavePath = (musicInfo: LX.Download.ListItem) => {
  let savePath = appSetting['download.savePath']
  if (appSetting['download.isSavePathGroupByListName']) {
    let dirName: string | undefined
    const listId = musicInfo.metadata.listId
    switch (listId) {
      case loveList.id:
        dirName = window.i18n.t(loveList.name)
        break
      default:
        dirName = userLists.find(list => list.id === listId)?.name
        break
    }
    // 来源列表认不出来（例如搜索、排行榜直接下载，或旧任务的 `listId` 是已删除的试听列表
    // `default`）时**不再套子目录**：以前这里回退成「试听列表」这个名字，而那条列表已随
    // ADR-0006 / 票 08 退场，拿它的名字做目录名会把已删除的概念又印在磁盘上。
    if (dirName) dirName = filterFileName(dirName)
    if (dirName) savePath = joinPath(savePath, clipFileNameLength(dirName))
  }
  return savePath
}
