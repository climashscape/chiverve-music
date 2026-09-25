// export const sql = `
//   CREATE TABLE "db_info" (
//     "id" INTEGER NOT NULL UNIQUE,
//     "field_name" TEXT,
//     "field_value" TEXT,
//     PRIMARY KEY("id" AUTOINCREMENT)
//   );

//   CREATE TABLE "my_list" (
//     "id" TEXT NOT NULL,
//     "name" TEXT NOT NULL,
//     "source" TEXT,
//     "sourceListId" TEXT,
//     "position" INTEGER NOT NULL,
//     "locationUpdateTime" INTEGER,
//     PRIMARY KEY("id")
//   );

//   CREATE TABLE "my_list_music_info" (
//     "id" TEXT NOT NULL,
//     "listId" TEXT NOT NULL,
//     "name" TEXT NOT NULL,
//     "singer" TEXT NOT NULL,
//     "source" TEXT NOT NULL,
//     "interval" TEXT,
//     "meta" TEXT NOT NULL,
//     UNIQUE("id","listId")
//   );
//   CREATE INDEX "index_my_list_music_info" ON "my_list_music_info" (
//     "id",
//     "listId"
//   );

//   CREATE TABLE "my_list_music_info_order" (
//     "listId" TEXT NOT NULL,
//     "musicInfoId" TEXT NOT NULL,
//     "order" INTEGER NOT NULL
//   );
//   CREATE INDEX "index_my_list_music_info_order" ON "my_list_music_info_order" (
//     "listId",
//     "musicInfoId"
//   );

//   CREATE TABLE "music_info_other_source" (
//     "source_id" TEXT NOT NULL,
//     "id" TEXT NOT NULL,
//     "source" TEXT NOT NULL,
//     "name" TEXT NOT NULL,
//     "singer" TEXT NOT NULL,
//     "meta" TEXT NOT NULL,
//     "order" INTEGER NOT NULL,
//     UNIQUE("source_id","id")
//   );
//   CREATE INDEX "index_music_info_other_source" ON "music_info_other_source" (
//     "source_id",
//     "id"
//   );

//   -- TODO  "meta" TEXT NOT NULL,
//   CREATE TABLE "lyric" (
//     "id" TEXT NOT NULL,
//     "source" TEXT NOT NULL,
//     "type" TEXT NOT NULL,
//     "text" TEXT NOT NULL
//   );

//   CREATE TABLE "music_url" (
//     "id" TEXT NOT NULL,
//     "url" TEXT NOT NULL
//   );

//   CREATE TABLE "download_list" (
//     "id" TEXT NOT NULL,
//     "isComplate" INTEGER NOT NULL,
//     "status" TEXT NOT NULL,
//     "statusText" TEXT NOT NULL,
//     "progress_downloaded" INTEGER NOT NULL,
//     "progress_total" INTEGER NOT NULL,
//     "url" TEXT,
//     "quality" TEXT NOT NULL,
//     "ext" TEXT NOT NULL,
//     "fileName" TEXT NOT NULL,
//     "filePath" TEXT NOT NULL,
//     "musicInfo" TEXT NOT NULL,
//     "position" INTEGER NOT NULL,
//     PRIMARY KEY("id")
//   );
// `

// export const tables = [
//   'table_db_info',
//   'table_my_list',
//   'table_my_list_music_info',
//   'index_index_my_list_music_info',
//   'table_my_list_music_info_order',
//   'index_index_my_list_music_info_order',
//   'table_music_info_other_source',
//   'index_index_music_info_other_source',
//   'table_lyric',
//   'table_music_url',
//   'table_download_list',
// ]

type Tables = 'db_info'
| 'my_list'
| 'my_list_music_info'
| 'index_my_list_music_info'
| 'my_list_music_info_order'
| 'index_my_list_music_info_order'
| 'music_info_other_source'
| 'index_music_info_other_source'
| 'lyric'
| 'music_url'
| 'download_list'
| 'dislike_list'

const tables = new Map<Tables, string>()


tables.set('db_info', `
  CREATE TABLE "db_info" (
    "id" INTEGER NOT NULL UNIQUE,
    "field_name" TEXT,
    "field_value" TEXT,
    PRIMARY KEY("id" AUTOINCREMENT)
  );
`)
tables.set('my_list', `
  CREATE TABLE "my_list" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "sourceListId" TEXT,
    "position" INTEGER NOT NULL,
    "locationUpdateTime" INTEGER,
    PRIMARY KEY("id")
  );
`)
tables.set('my_list_music_info', `
  CREATE TABLE "my_list_music_info" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "singer" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "interval" TEXT,
    "meta" TEXT NOT NULL,
    UNIQUE("id","listId")
  );
`)
tables.set('index_my_list_music_info', `
  CREATE INDEX "index_my_list_music_info" ON "my_list_music_info" (
    "id",
    "listId"
  );
`)
tables.set('my_list_music_info_order', `
  CREATE TABLE "my_list_music_info_order" (
    "listId" TEXT NOT NULL,
    "musicInfoId" TEXT NOT NULL,
    "order" INTEGER NOT NULL
  );
`)
tables.set('index_my_list_music_info_order', `
  CREATE INDEX "index_my_list_music_info_order" ON "my_list_music_info_order" (
    "listId",
    "musicInfoId"
  );
`)
tables.set('music_info_other_source', `
  CREATE TABLE "music_info_other_source" (
    "source_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "singer" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    UNIQUE("source_id","id")
  );
`)
tables.set('index_music_info_other_source', `
  CREATE INDEX "index_music_info_other_source" ON "music_info_other_source" (
    "source_id",
    "id"
  );
`)
tables.set('lyric', `
  -- TODO  "meta" TEXT NOT NULL,
  CREATE TABLE "lyric" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL
  );
`)
tables.set('music_url', `
  CREATE TABLE "music_url" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" INTEGER NOT NULL
  );
`)
tables.set('download_list', `
  CREATE TABLE "download_list" (
    "id" TEXT NOT NULL,
    "isComplate" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "statusText" TEXT NOT NULL,
    "progress_downloaded" INTEGER NOT NULL,
    "progress_total" INTEGER NOT NULL,
    "url" TEXT,
    "quality" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "musicInfo" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    PRIMARY KEY("id")
  );
`)
tables.set('dislike_list', `
  CREATE TABLE "dislike_list" (
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" TEXT
  );
`)

export default tables

/**
 * 数据库版本。改动**必须**同步三处，缺一即出事：
 * 1. 上面 `tables` 里对应的建表 SQL（`verifyDB.ts` 拿它逐字符比对——正常化空白 / 分号 / 注释后整串相等）；
 * 2. `migrate.ts` 里对应的版本分支（旧库要先升到同一结构才通过校验）；
 * 3. 在一份**真旧库**上实测 `dbService.init` 返回 `true`（AGENTS §2.4）。
 *
 * ⚠️ 校验不过时 `db.init` 返回 `null`，`main/app.ts` 会把用户库改名备份后**重建空库**（数据丢失）。
 *
 * 版本历史（每项 = 一个**起始版本**的库在迁移时补了什么；`migrate.ts` 的 `case` 与之对应，
 * 迁移跑完版本号一律写成上面的 `DB_VERSION`）：
 * - 起始 `'1'`：补 `dislike_list` 表（上游 v2.4.0 的默认版本号出错遗留）；
 * - 起始 `'2'`：`music_url` 加 `created_at`（设置页重构票 08：URL 缓存回收的时间依据，0 = 加列之前写的行）；
 * - 起始 `'3'`：删掉「试听列表」（`LIST_IDS.DEFAULT`）在库里的全部数据行（票 08：数据层删除，
 *   真删、不迁进「我的收藏」；表结构不变，只是清行）。
 */
export const DB_VERSION = '4'
