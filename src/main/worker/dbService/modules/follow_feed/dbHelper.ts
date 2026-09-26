import { getDB } from '../../db'
import {
  createBaselineQueryStatement,
  createBaselineUpsertStatement,
  createItemCountStatement,
  createItemInsertStatement,
  createItemPruneStatement,
  createItemQueryStatement,
  createMarkAllReadStatement,
  createSummaryStatement,
  createUnreadCountStatement,
} from './statements'

/**
 * 条目保留上限（用户拍板：只保留最近 100 条）。
 *
 * 按 604 位关注歌手估算，一年也就几百条，所以 100 条约等于「最近一两个月的动态」。
 * 清理只删**最旧的已读**，未读在 100 条内不会被删——见 `createItemPruneStatement` 的注释。
 */
export const ITEM_KEEP = 100

/** 读全部基线（一位关注歌手一行） */
export const queryBaselineAll = () => {
  return createBaselineQueryStatement().all() as LX.FollowFeed.Baseline[]
}

/**
 * 批量写基线（一轮扫描的结果）。
 *
 * 整批共用一个 `updatedAt`（同 `music_url` 的 `createdAt` 口径）：它记的是「这轮什么时候跑的」，
 * 逐行取 `Date.now()` 只会让同一轮的行差出几毫秒，没有意义。
 *
 * 三个写函数都**不是 `async`**（同 `modules/music_url/dbHelper`）：better-sqlite3 的事务是同步跑完的，
 * 这里没有一处 `await` 可等——标 async 只会让调用方以为它需要等。
 */
export const saveBaseline = (rows: LX.FollowFeed.BaselineInput[]) => {
  const db = getDB()
  const statement = createBaselineUpsertStatement()
  const updatedAt = Date.now()
  db.transaction((rows: LX.FollowFeed.BaselineInput[]) => {
    for (const row of rows) statement.run({ ...row, updatedAt })
  })(rows)
}

/** 读时间线（按发布时间倒序，见 statements 的排序说明） */
export const queryItems = () => {
  return createItemQueryStatement().all() as LX.FollowFeed.Item[]
}

/**
 * 批量写条目 + 按上限清理，**整段一个事务**。
 *
 * 为什么要包事务：写入与清理是一个整体契约——只写不清理会让表无界增长，
 * 只清理不写会删掉不该删的行。中途失败时宁可整批不生效（下一轮检查会重新发现这些条目，
 * 因为基线也没推进）。
 */
export const insertItems = (items: LX.FollowFeed.ItemInput[]) => {
  const db = getDB()
  const insertStatement = createItemInsertStatement()
  const countStatement = createItemCountStatement()
  const pruneStatement = createItemPruneStatement()
  const foundAt = Date.now()
  db.transaction((items: LX.FollowFeed.ItemInput[]) => {
    for (const item of items) insertStatement.run({ ...item, foundAt, read: 0 })
    const total = (countStatement.get() as { count: number }).count
    if (total > ITEM_KEEP) pruneStatement.run({ excess: total - ITEM_KEEP })
  })(items)
}

/** 监控数 + 上次成功覆盖时间（页面顶部的两个数） */
export const querySummary = () => {
  const row = createSummaryStatement().get() as { monitoredCount: number, lastSuccessAt: number | null }
  return { monitoredCount: row.monitoredCount, lastSuccessAt: row.lastSuccessAt }
}

/** 未读条目数（左栏角标） */
export const queryUnreadCount = () => {
  return (createUnreadCountStatement().get() as { count: number }).count
}

/** 全部标为已读 */
export const markAllRead = () => {
  createMarkAllReadStatement().run()
}
