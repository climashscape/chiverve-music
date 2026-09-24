import { getDB } from '../../db'
import {
  createQueryStatement,
  createInsertStatement,
  createDeleteStatement,
  // createUpdateStatement,
  createClearStatement,
  createCountStatement,
  createRecycleQueryStatement,
} from './statements'

/**
 * 查询歌曲url
 * @param id 歌曲id
 * @returns url
 */
export const queryMusicUrl = (id: string) => {
  const queryStatement = createQueryStatement()
  return (queryStatement.get(id) as { url: string } | null)?.url ?? null
}

/**
 * 批量插入歌曲url
 * @param urlInfo 列表
 */
export const insertMusicUrl = (urlInfo: LX.DBService.MusicUrlInfo[]) => {
  const db = getDB()
  const insertStatement = createInsertStatement()
  const deleteStatement = createDeleteStatement()
  // 时间戳在这里统一打（渲染侧只传 id + url）：取值流的**写入时刻**，回收时按它判过期 / 比新旧。
  // 一次批量插入里的多条共用一个时间值——它们本来就是同一次取流写进来的。
  const createdAt = Date.now()
  db.transaction((urlInfo: LX.DBService.MusicUrlInfo[]) => {
    for (const info of urlInfo) {
      deleteStatement.run(info.id)
      insertStatement.run({ id: info.id, url: info.url, createdAt })
    }
  })(urlInfo)
}

/**
 * 批量删除歌曲url
 * @param ids 列表
 */
export const deleteMusicUrl = (ids: string[]) => {
  const db = getDB()
  const deleteStatement = createDeleteStatement()
  db.transaction((ids: string[]) => {
    for (const id of ids) deleteStatement.run(id)
  })(ids)
}

/**
 * 批量更新歌曲url
 * @param urlInfo 列表
 */
// export const updateMusicUrl = (urlInfo: LX.DBService.MusicUrlInfo[]) => {
//   const db = getDB()
//   const updateStatement = createUpdateStatement()
//   db.transaction((urlInfo: LX.DBService.MusicUrlInfo[]) => {
//     for (const info of urlInfo) updateStatement.run(info)
//   })(urlInfo)
// }

/**
 * 清空歌曲url
 */
export const clearMusicUrl = () => {
  const clearStatement = createClearStatement()
  clearStatement.run()
}

/**
 * 统计歌曲信息数量
 */
export const countMusicUrl = () => {
  const countStatement = createCountStatement()
  return (countStatement.get() as { count: number }).count
}

/**
 * 取整张缓存表的「挑行视图」（由旧到新，只含 id / 写入时间 / 近似占用）
 * @returns 行列表，交给 `recycle.ts` 的纯函数挑该删哪些
 */
export const queryMusicUrlCacheRows = (): LX.DBService.MusicUrlCacheRow[] => {
  return createRecycleQueryStatement().all() as LX.DBService.MusicUrlCacheRow[]
}
