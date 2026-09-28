import { getDB } from '../../db'
import {
  createBaselineQueryStatement,
  createBaselineUpsertStatement,
  createItemInsertStatement,
  createItemPruneStatement,
  createItemQueryStatement,
  createKvInsertStatement,
  createKvQueryStatement,
  createKvUpsertStatement,
  createMarkAllReadStatement,
  createSummaryStatement,
  createUnreadCountStatement,
} from './statements'

/**
 * 展示窗口：**本周 + 上一周**（2026-09-28 用户拍板，取代原来的「最近 100 条」容量上限）。
 *
 * 窗口的边界 = 上周一（周一为一周起点）。清理发生在写入侧：每轮写入后把 `publish_time`
 * 早于上周一的条目删掉——发布日期更早的旧作即使被收录/释放进列表（补齐候选里常见）
 * 也不会出现在动态里。条数不设上限，窗口内的条目全保留。
 */

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

/** 上周一的日期（`YYYY-MM-DD`）——展示窗口的下界：`publish_time` 早于它的条目出窗 */
export const lastMondayDate = (): string => {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7)
  const month = String(monday.getMonth() + 1).padStart(2, '0')
  const day = String(monday.getDate()).padStart(2, '0')
  return `${monday.getFullYear()}-${month}-${day}`
}

/**
 * 批量写条目 + 清掉窗口外（发布时间早于上周一）的条目，**整段一个事务**。
 *
 * 为什么要包事务：写入与清理是一个整体契约——只写不清理会让表无界增长，
 * 只清理不写会删掉不该删的行。中途失败时宁可整批不生效（下一轮检查会重新发现这些条目，
 * 因为基线也没推进）。
 */
export const insertItems = (items: LX.FollowFeed.ItemInput[]) => {
  const db = getDB()
  const insertStatement = createItemInsertStatement()
  const pruneStatement = createItemPruneStatement()
  const foundAt = Date.now()
  const cutoff = lastMondayDate()
  db.transaction((items: LX.FollowFeed.ItemInput[]) => {
    for (const item of items) insertStatement.run({ ...item, foundAt, read: 0 })
    pruneStatement.run({ cutoff })
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

/** 存量补齐的一次性标记键（`db_info` 的 kv） */
const BACKFILL_FLAG = 'follow_feed_backfilled'

/** 存量补齐是否已完成：「每位歌手最新一簇」的全量采集只跑一次 */
export const isBackfilled = (): boolean => {
  const row = createKvQueryStatement().get(BACKFILL_FLAG) as { value: string } | undefined
  return row != null && row.value !== ''
}

/** 标记存量补齐已完成（值记完成时刻的毫秒时间戳，方便排查） */
export const markBackfilled = () => {
  const value = String(Date.now())
  const result = createKvUpsertStatement().run({ name: BACKFILL_FLAG, value })
  if (result.changes === 0) createKvInsertStatement().run({ name: BACKFILL_FLAG, value })
}
