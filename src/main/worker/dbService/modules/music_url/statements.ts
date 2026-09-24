import { getDB } from '../../db'

/**
 * 创建歌曲url查询语句
 * @returns 查询语句
 */
export const createQueryStatement = () => {
  const db = getDB()
  return db.prepare<[string]>(`
    SELECT "url"
    FROM "main"."music_url"
    WHERE "id"=?
    `)
}

/**
 * 创建歌曲url插入语句
 * @returns 插入语句
 */
export const createInsertStatement = () => {
  const db = getDB()
  return db.prepare<[LX.DBService.MusicUrlRow]>(`
    INSERT INTO "main"."music_url" ("id", "url", "created_at")
    VALUES (@id, @url, @createdAt)`)
}

/**
 * 创建歌曲url清空语句
 * @returns 清空语句
 */
export const createClearStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    DELETE FROM "main"."music_url"
  `)
}

/**
 * 创建歌曲url删除语句
 * @returns 删除语句
 */
export const createDeleteStatement = () => {
  const db = getDB()
  return db.prepare<[string]>(`
    DELETE FROM "main"."music_url"
    WHERE "id"=?
  `)
}

/**
 * 创建歌曲url更新语句
 * @returns 更新语句
 */
export const createUpdateStatement = () => {
  const db = getDB()
  return db.prepare<[LX.DBService.MusicUrlInfo]>(`
    UPDATE "main"."music_url"
    SET "url"=@url
    WHERE "id"=@id`)
}

/**
 * 创建数量统计语句
 * @returns 统计语句
 */
export const createCountStatement = () => {
  const db = getDB()
  return db.prepare<[]>('SELECT COUNT(*) as count FROM "main"."music_url"')
}

/**
 * 创建回收用的取行语句（设置页重构票 08）——挑行逻辑（纯函数）在 `recycle.ts`。
 *
 * 三件刻意如此的事：
 * 1. **只取挑行需要的三列，不取 `url` 本身**：判定只用 id / 时间 / 占用，URL 字符串可能有几万条，
 *    整表读进 worker 白花内存（回收要在大表上也跑得动）。
 * 2. `bytes` 用 `LENGTH("id") + LENGTH("url")` 近似占用。SQLite 的 `LENGTH` 对 TEXT 返回**字符数**，
 *    id 与 URL 都是 ASCII，等价于字节数。它是**乐观估计**（不含页 / 索引开销与数据库自身大小），
 *    只用于和 `cache.maxSizeMB` 比大小。
 * 3. **顺序就是回收顺序**（`created_at ASC, rowid ASC`）：旧的先删；`created_at` 相同的行按 rowid
 *    （插入次序；`insertMusicUrl` 是「先删同 id 再插」，重写过的行 rowid 也会刷新）定先后。
 *    `recycle.ts` 的 `selectMusicUrlRecycle` 依赖这个顺序（它不重排），别改这里的 ORDER BY。
 *
 * `created_at = 0` 是加列之前写的历史行（未知时间），排在最前 → 最先被回收（口径见 `recycle.ts`）。
 */
export const createRecycleQueryStatement = () => {
  const db = getDB()
  return db.prepare<[]>(`
    SELECT
      "id",
      "created_at" AS "createdAt",
      LENGTH("id") + LENGTH("url") AS "bytes"
    FROM "main"."music_url"
    ORDER BY "created_at" ASC, rowid ASC
  `)
}
