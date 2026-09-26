import { getDB } from '../../db'

/**
 * 关注动态的语句集（`follow_feed_baseline` / `follow_feed_item`）。
 *
 * 列名一律 `snake_case`（建表时如此，见 `tables.ts`），出库时 `AS "camelCase"` 对齐
 * `LX.FollowFeed.*` 的字段名——这样上层拿到的对象可以直接用，不用再手工映射一遍。
 */

/** 读全部基线（一位关注歌手一行；604 位量级，一轮检查读一次） */
export const createBaselineQueryStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    SELECT
      "singer_mid" AS "singerMid",
      "latest_song_id" AS "latestSongId",
      "latest_song_time" AS "latestSongTime",
      "updated_at" AS "updatedAt"
    FROM "main"."follow_feed_baseline"
  `)
}

/**
 * 写一行基线（存在即整行覆盖）。
 *
 * 用 `INSERT OR REPLACE` 而不是 `UPDATE` + 补 `INSERT`：一个歌手永远只有一行，
 * 而调用方（一轮扫描的批量写）不该关心它是新增还是更新。
 */
export const createBaselineUpsertStatement = () => {
  const db = getDB()
  return db.prepare<[LX.FollowFeed.Baseline]>(`
    INSERT OR REPLACE INTO "main"."follow_feed_baseline"
      ("singer_mid", "latest_song_id", "latest_song_time", "updated_at")
    VALUES (@singerMid, @latestSongId, @latestSongTime, @updatedAt)
  `)
}

/**
 * 读时间线（全部条目）。
 *
 * 排序即页面顺序：**发布时间倒序**（时间线的基准，不是发现时间），同日则后发现的在前，
 * 再同则后写入的在前（`id` 自增）——三层排序让顺序完全确定，不会因 SQLite 的行序漂移。
 * 容量由 `ITEM_KEEP` 在写入侧兜住，所以这里不需要 `LIMIT`。
 */
export const createItemQueryStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    SELECT
      "id" AS "id",
      "kind" AS "kind",
      "singer_mid" AS "singerMid",
      "singer_name" AS "singerName",
      "item_id" AS "itemId",
      "name" AS "name",
      "album_mid" AS "albumMid",
      "album_name" AS "albumName",
      "track_count" AS "trackCount",
      "publish_time" AS "publishTime",
      "found_at" AS "foundAt",
      "read" AS "read",
      "music" AS "music"
    FROM "main"."follow_feed_item"
    ORDER BY "publish_time" DESC, "found_at" DESC, "id" DESC
  `)
}

/**
 * 写一条条目。
 *
 * `INSERT OR IGNORE` 撞上 `UNIQUE("kind","item_id")` 时**安静跳过**：去重是「同一首歌 /
 * 同一张专辑只报一次」，而且**不用新值覆盖旧值**（首报时那句话是当时的实况，
 * 后续重复上报不该把名字之类的字段改掉）。`foundAt` / `read` 由 dbHelper 统一填。
 */
export const createItemInsertStatement = () => {
  const db = getDB()
  return db.prepare<[Omit<LX.FollowFeed.Item, 'id'>]>(`
    INSERT OR IGNORE INTO "main"."follow_feed_item"
      ("kind", "singer_mid", "singer_name", "item_id", "name", "album_mid", "album_name",
       "track_count", "publish_time", "found_at", "read", "music")
    VALUES (@kind, @singerMid, @singerName, @itemId, @name, @albumMid, @albumName,
       @trackCount, @publishTime, @foundAt, @read, @music)
  `)
}

/** 条目总行数（保留策略的判据） */
export const createItemCountStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    SELECT COUNT(*) AS "count"
    FROM "main"."follow_feed_item"
  `)
}

/**
 * 按保留上限删掉最旧的条目。
 *
 * `ORDER BY "read" DESC, "id" ASC` 是**保留策略的全部要害**：已读（1）排在未读（0）前面，
 * 所以先删最旧的已读、最后才动未读。这样清理**不会让左栏角标数字莫名变小**——
 * 只有当未读本身就超过上限时，才会按最旧先删（否则表会无界增长）。
 */
export const createItemPruneStatement = () => {
  const db = getDB()
  return db.prepare<[{ excess: number }]>(`
    DELETE FROM "main"."follow_feed_item"
    WHERE "id" IN (
      SELECT "id" FROM "main"."follow_feed_item"
      ORDER BY "read" DESC, "id" ASC
      LIMIT @excess
    )
  `)
}

/**
 * 页面要的汇总（监控数 + 最近一次成功覆盖的时间）。
 *
 * 单独一条聚合语句而不是「把 604 行基线全传给渲染侧再算」：页面只需要两个数，
 * 传行既浪费带宽又让页面依赖基线的内部形状。`MAX(updated_at)` 就是「上次成功检查」——
 * 基线只在该歌手本轮**成功取到数据**时才推进（见 `dbHelper.saveBaseline`），所以它天然
 * 只反映成功的那次；失败原因只存在内存里（重启即清，重启后会马上再跑一轮）。
 */
export const createSummaryStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    SELECT
      COUNT(*) AS "monitoredCount",
      MAX("updated_at") AS "lastSuccessAt"
    FROM "main"."follow_feed_baseline"
  `)
}

/** 未读条目数 = 左栏角标的数字 */
export const createUnreadCountStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    SELECT COUNT(*) AS "count"
    FROM "main"."follow_feed_item"
    WHERE "read" = 0
  `)
}

/** 「进入页面即全部标为已读」的写入口 */
export const createMarkAllReadStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    UPDATE "main"."follow_feed_item"
    SET "read" = 1
    WHERE "read" = 0
  `)
}
