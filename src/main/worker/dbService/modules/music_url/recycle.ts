/**
 * URL 缓存（`music_url` 表）的回收策略（设置页重构票 08）。
 *
 * **本文件是纯逻辑**（零 import）：只决定「哪些行该删」与「删完还剩多少」，不碰数据库——
 * 取行 / 删行在 `index.ts` 的 `musicUrlRecycle` 里做（走 `dbHelper` 的语句封装，主进程绝不直连数据库）。
 * 单测见同目录 `recycle.test.ts`。
 *
 * ## 只删 `music_url` 一张表
 * 回收只作用于在线取流的 URL 缓存。列表 / 我喜欢 / 歌单 / 备份在 `my_list*` 等表，已下载的音频文件在磁盘上，
 * 本模块的语句里只出现 `music_url`，不可能碰到它们。
 *
 * ## 删掉一行不会影响播放
 * 播放器手里是**取流那一刻拿到的 URL 字符串**（已 src 到 audio 元素），表里这行只是「下次少取一次流」的缓存；
 * 删掉后下一次播放重新走一遍取流。所以回收对播放是安全的，唯一要防的是「删掉正在播的那条，白跑一次取流」，
 * 由 `keepIdPrefix` 兜（见下）。触发时机见 `main/utils/index.ts` 的 `recycleMusicUrlCache`（启动时）
 * 与设置页的「立即回收」。
 *
 * ## 「0 = 不自动清」约定在哪
 * 两个阈值（`cache.musicUrlKeepDays` 天 / `cache.maxSizeMB` MB）的默认值都在 `@common/defaultSetting`
 * 里写 0；两个都是 0 时 `index.ts` 的 `musicUrlRecycle` 直接返回、**连库都不读**——所以默认配置下
 * 启动时的回收是零开销，缓存只增不减，行为与改造前完全一致。
 *
 * ## 挑选口径
 * - **保留天数**：`createdAt < now - keepDays 天` 才算过期；**恰好等于截止时刻的行保留**。
 *   `createdAt = 0`（加列之前写的行，见 `tables.ts` / `migrate.ts`）天然小于任何截止时刻，按「最旧」先删：
 *   这反过来的口径（0 = 永不过期）会让开启保留天数后老缓存永远清不掉、容量上限也压不下去，
 *   而「时间未知的老缓存」恰恰是最该回收的那批。代价是升级后第一次回收会清掉加列前的整批缓存，
 *   顶多下次播放重新取流。
 * - **容量上限**：从最旧的一端继续删，直到剩余占用**不超过**上限（恰好等于上限不算超）。
 * - `keepIdPrefix`（正在播放那首歌的缓存 key 前缀，形如 `${musicInfo.id}_`，含各档位）命中的行
 *   **一条都不删**，但它们**照样计入占用**——占用口径是「这张表实际占多少」，不是「可删的占多少」。
 *   副作用：保留项本身就超上限时压不到上限内（删光别的行就停手）。这比删掉正在播的那条 URL 要好。
 */

/** 一天的毫秒数（保留天数的换算口径） */
const MS_PER_DAY = 24 * 60 * 60 * 1000
/** 1 MB 的字节数（阈值单位是 MB，比大小按字节） */
const BYTES_PER_MB = 1024 * 1024

/**
 * 单批删除的行数。
 *
 * 为什么分批而不是一条 `DELETE ... WHERE ...` 删完：better-sqlite3 是同步 API，worker 又是单线程——
 * 一条大语句执行期间，worker 的消息循环被占住，渲染侧每一次缓存读写（取流命中、换歌写入）都得排队。
 * 500 行一批时单批是毫秒级（一行几十到几百字符），几万行也只是几十个短事务；再大（如 5000）
 * 单次事务变长，用户点「立即回收」时能感觉到取流卡顿。批大小只影响耗时分布，不影响最终结果
 * （挑行一次性算完，见 `selectMusicUrlRecycle`）。
 */
export const MUSIC_URL_RECYCLE_BATCH_SIZE = 500

/** 挑行的结果：要删的 id（顺序 = 由旧到新）与删前 / 删后的近似总占用 */
export interface MusicUrlRecycleSelection {
  /** 该删的 id（按「由旧到新」排列；同一 id 不会重复） */
  ids: string[]
  /** 挑行前全表的近似占用（字符数，见 `statements.ts` 的 `createRecycleQueryStatement`） */
  bytesBefore: number
  /** 按 `ids` 删完之后的近似占用（含保留项，不含 SQLite 的页 / 索引开销，是乐观估计） */
  bytesAfter: number
}

/**
 * **纯函数**：从缓存的「挑行视图」里挑出该删哪些行（回收行为的唯一判据，单测见 `recycle.test.ts`）。
 *
 * 输入契约：`rows` 必须**由旧到新**（`createRecycleQueryStatement` 的 `ORDER BY created_at ASC, rowid ASC`
 * 就是这个序）。函数不重排——重排会丢掉同毫秒写入时的插入次序（rowid）信息。
 *
 * `now` 可注入（缺省取当前时间），让「恰好等于阈值」这类边界能在测试里钉死。
 */
export const selectMusicUrlRecycle = (
  rows: readonly LX.DBService.MusicUrlCacheRow[],
  options: LX.Music.MusicUrlRecycleOptions & { now?: number },
): MusicUrlRecycleSelection => {
  const { keepDays, maxSizeMB, keepIdPrefix = null, now = Date.now() } = options
  const ids = new Set<string>()
  let bytesBefore = 0
  for (const row of rows) bytesBefore += row.bytes
  let bytesAfter = bytesBefore

  // 保留项：正在播放那首歌的各档位缓存 key，一条都不删（但照样计入占用）
  const isKept = (row: LX.DBService.MusicUrlCacheRow) => !!keepIdPrefix && row.id.startsWith(keepIdPrefix)

  if (keepDays > 0) {
    const expireBefore = now - keepDays * MS_PER_DAY
    for (const row of rows) {
      // rows 由旧到新：碰到第一条没过期的，后面的都不用看了
      if (row.createdAt >= expireBefore) break
      if (isKept(row)) continue
      ids.add(row.id)
      bytesAfter -= row.bytes
    }
  }

  if (maxSizeMB > 0) {
    const maxBytes = maxSizeMB * BYTES_PER_MB
    for (const row of rows) {
      if (bytesAfter <= maxBytes) break
      // 已被上面的过期规则选中的行不重复扣减（同一个 id 只删一次）
      if (ids.has(row.id) || isKept(row)) continue
      ids.add(row.id)
      bytesAfter -= row.bytes
    }
  }

  return { ids: [...ids], bytesBefore, bytesAfter }
}
