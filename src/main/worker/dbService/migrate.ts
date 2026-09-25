import type Database from 'better-sqlite3'
import { LIST_IDS } from '@common/constants'
import tables, { DB_VERSION } from './tables'
import { deleteUserLists } from './modules/list/dbHelper'

// const migrateV1 = (db: Database.Database) => {
//   const sql = `
//     DROP TABLE "main"."download_list";

//     CREATE TABLE "download_list" (
//       "id" TEXT NOT NULL,
//       "isComplate" INTEGER NOT NULL,
//       "status" TEXT NOT NULL,
//       "statusText" TEXT NOT NULL,
//       "progress_downloaded" INTEGER NOT NULL,
//       "progress_total" INTEGER NOT NULL,
//       "url" TEXT,
//       "quality" TEXT NOT NULL,
//       "ext" TEXT NOT NULL,
//       "fileName" TEXT NOT NULL,
//       "filePath" TEXT NOT NULL,
//       "musicInfo" TEXT NOT NULL,
//       "position" INTEGER NOT NULL,
//       PRIMARY KEY("id")
//     );
//   `
//   db.exec(sql)
//   db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({ name: 'version', value: '2' })
// }

const migrateV1 = (db: Database.Database) => {
  // 修复 v2.4.0 的默认数据库版本号不对的问题
  const existsTable = db.prepare('SELECT name FROM "main".sqlite_master WHERE type=\'table\' AND name=\'dislike_list\';').get()
  if (!existsTable) {
    const sql = tables.get('dislike_list')!
    db.exec(sql)
  }
}

/**
 * v2 → v3：`music_url` 加 `created_at`（URL 缓存回收策略的时间依据，设置页重构票 08）。
 *
 * 四个刻意的做法：
 * 1. **重建表，列定义取自 `tables.get('music_url')` 的原样文本**（不是手写 `ALTER TABLE ADD COLUMN`）：
 *    `verifyDB` 是拿这张表在 `sqlite_master` 里的整串 SQL 与 `tables` 的文本比对的，重建能保证两边
 *    逐字符同源；手写 ALTER 是把列定义拼到原文末尾，差一个空格 / 引号 / 默认值就校验不过 →
 *    `db.init` 返回 `null` → 用户库被改名备份后**重建空库**。本文件的 `migrateV1` 也是这个套路。
 * 2. **整段进事务**：4 条语句（改名 / 建新表 / 搬数据 / 删旧表）中间失败会留下半迁移状态——
 *    事务回滚后旧表原样还在、版本号不动，下次启动重试；不回滚就可能只剩一张空表。
 * 3. **`created_at` 一律写 0**（老行没有时间信息）：回收时把 0 当**最旧**处理（见
 *    `modules/music_url/recycle.ts` 的口径），所以升级后第一次回收会把加列之前的缓存整批清掉，
 *    代价只是下次播放重新取流。
 * 4. **列已存在时也照样重建**：只对名字判存在（不比对定义），半迁移状态（列在但定义不同，
 *    如带 DEFAULT）会被这次重建**归一化**成 `tables.ts` 的定义，而不是被跳过。
 */
const migrateV2 = (db: Database.Database) => {
  const hasCreatedAt = (db.pragma('table_info("music_url")') as Array<{ name: string }>)
    .some(column => column.name == 'created_at')
  const createdAtExpr = hasCreatedAt ? '"created_at"' : '0'
  db.transaction(() => {
    db.exec(`
      ALTER TABLE "music_url" RENAME TO "music_url_v2";
      ${tables.get('music_url')!}
      INSERT INTO "music_url" ("id", "url", "created_at")
        SELECT "id", "url", ${createdAtExpr} FROM "music_url_v2";
      DROP TABLE "music_url_v2";
    `)
  })()
}

/**
 * v3 → v4：删掉「试听列表」（`LIST_IDS.DEFAULT`）在库里的全部数据行（票 08 契约 1：**真删旧行**）。
 *
 * 四个刻意的做法：
 * 1. **走 `dbHelper` 的列表删除路径**（`deleteUserLists`，即 `list_remove` 事件那条路径）：它把
 *    `my_list` / `my_list_music_info` / `my_list_music_info_order` 三张表一次清干净，将来这条数据链
 *    多了别的表也不用回来改这里。`db` 参数只为与其它迁移函数对齐签名——`dbHelper` 取的是
 *    `getDB()`，而 `init` 在调 `migrateData(db)` 之前已经把同一个实例赋进去了。
 * 2. **不做任何搬运**：用户已明确接受「早版本里点过的歌不再找得回来」，所以既不迁进「我的收藏」，
 *    也不留备份行——库里、同步载荷、备份导出都不再有这个概念。
 * 3. **表结构一个字不动**：只是清行，所以 `tables.ts` 的建表 SQL / `verifyDB` 的逐字符校验不受影响，
 *    版本号抬一档只是为了让这次清行**有记录**（跑过就不再跑）。
 * 4. **幂等**：行不存在时 DELETE 影响 0 行；即便版本号被回写成 '3'（例如从旧备份还原了 config），
 *    重跑也只是再清一次。
 */
const migrateV3 = (db: Database.Database) => {
  deleteUserLists([LIST_IDS.DEFAULT])
}

export default (db: Database.Database) => {
  // PRAGMA user_version = x
  // console.log(db.prepare('PRAGMA user_version').get().user_version)
  // https://github.com/WiseLibs/better-sqlite3/issues/668#issuecomment-1145285728
  const version = (db.prepare<[string]>('SELECT "field_value" FROM "main"."db_info" WHERE "field_name" = ?').get('version') as { field_value: string }).field_value
  switch (version) {
    case '1':
      migrateV1(db)
      // '1' 的库要连做后面每一版迁移：版本号直接写成 DB_VERSION 会漏掉 v2 的加列 → 校验不过 → 重建空库
      migrateV2(db)
      migrateV3(db)
      db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({ name: 'version', value: DB_VERSION })
      break
    case '2':
      migrateV2(db)
      migrateV3(db)
      db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({ name: 'version', value: DB_VERSION })
      break
    case '3':
      migrateV3(db)
      db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({ name: 'version', value: DB_VERSION })
      break
  }
}
