import music from '@renderer/utils/musicSdk'
import {
  addFollowFeedItems,
  getFollowFeedBaseline,
  isFollowFeedBackfilled,
  markFollowFeedBackfilled,
  saveFollowFeedBaseline,
} from '@renderer/utils/ipc'
import { backfillItemsOf, diffSinger, newSongIdOf, type SingerFetch } from './diff'

/**
 * 关注动态的**一轮检查**（票 04/05 的编排那一半）。
 *
 * 依赖全部走 `CheckDeps` 注入：默认实现打真的 tx 与 IPC，测试注入假的——
 * 这样「哪些歌手被补查、失败时基线推不推进」这类行为不用起应用、也不打真接口就能钉住。
 *
 * 成本（实测口径见 spec）：一轮 = 1 个关注列表请求 + ⌈604/30⌉ = 21 个扫描请求；
 * 只有「最新一首相对基线有变化」的歌手才会走补查（每轮通常 0–3 位）。
 */

/**
 * 补查时每位歌手取几首。
 *
 * 10 是「够枚举一次多首发布」的取值：同一发布日的多发、以及一张专辑新上架的那批曲目
 * （补查拿到的顺序与扫描同源），都会落在这 10 条里。取不到的部分不会被补报（基线标记已前移），
 * 这是**刻意的**代价：宁可少报，也不要每次把 20 首的窗口全拉回来。
 */
export const DETAIL_SONG_NUM = 10

export interface CheckRunResult {
  /** 本轮**成功覆盖**的歌手数（只有这些人的基线被推进） */
  scanned: number
  /** 本轮写进库的条目数（不含补齐的「最新更新」，那个看 `backfilled`） */
  newItems: number
  /** 走了补查的歌手数 */
  detailed: number
  /** 本轮是否跑了**存量补齐**（一次性：把 604 位歌手的最新一簇全部采集后写库） */
  backfilled: boolean
}

export interface CheckDeps {
  getFollowedSingers: () => Promise<Array<{ mid: string, name: string }>>
  getLatestSongs: (mids: string[], num: number) => Promise<SingerFetch[]>
  loadBaseline: () => Promise<LX.FollowFeed.Baseline[]>
  saveBaseline: (rows: LX.FollowFeed.BaselineInput[]) => Promise<unknown>
  addItems: (items: LX.FollowFeed.ItemInput[]) => Promise<unknown>
  /** 存量补齐是否已完成（一次性标记，存在 db_info 里） */
  isBackfilled: () => Promise<boolean>
  markBackfilled: () => Promise<unknown>
}

export const defaultCheckDeps: CheckDeps = {
  getFollowedSingers: () => music.tx.singer.getFollowedSingers(),
  getLatestSongs: (mids, num) => music.tx.singer.getLatestSongs(mids, num),
  loadBaseline: () => getFollowFeedBaseline(),
  saveBaseline: rows => saveFollowFeedBaseline(rows),
  addItems: items => addFollowFeedItems(items),
  isBackfilled: () => isFollowFeedBackfilled(),
  markBackfilled: () => markFollowFeedBackfilled(),
}

/**
 * 跑一轮。**失败会向上抛**（关注列表拿不到 = 整轮没意义），由调用方决定怎么记与怎么退避。
 *
 * 四条刻意的行为：
 *   1. **基线的推进以「该歌手本轮成功取到数据」为条件**（`entry.ok`）——局部失败下一轮自然补上，
 *      不需要重试队列；
 *   2. **首次见到某位歌手时（`baseline == null`）把它的「最新一簇」报出来**
 *      （`backfillItemsOf`，2026-09-28 用户拍板取代首次全静默）——否则新关注/存量库
 *      永远看不到最近的更新；因此首次歌手也要补查（`num: 10`）才够聚合一张专辑；
 *   3. **存量补齐**（`isBackfilled` 为 false 时）：对**全部**关注歌手做一次最新一簇采集，
 *      一次性把 604 位的最新更新都写进库，之后写标记不再跑。总量不上心——`ITEM_KEEP`
 *      （100 条）在写入侧兜底，超出的按「先删已读、再删写入最早」清掉；
 *   4. 基线**每轮都整批重写**（哪怕没有变化）：`updatedAt` 于是等于「上次成功检查的时间」，
 *      这正是页面顶部要显示的那个数——它表示「这一轮跑通了」，不是「这一轮有新东西」。
 */
export const runCheck = async(deps: CheckDeps = defaultCheckDeps): Promise<CheckRunResult> => {
  const singers = await deps.getFollowedSingers()
  if (!singers.length) return { scanned: 0, newItems: 0, detailed: 0, backfilled: false }

  const baselineRows = await deps.loadBaseline()
  const baselineMap = new Map(baselineRows.map(row => [row.singerMid, row]))
  const nameMap = new Map(singers.map(singer => [singer.mid, singer.name]))

  // 存量补齐：标记不存在时这一轮做全量采集（一次性；标记只在整轮全成功时写，见收尾）
  const doBackfill = !(await deps.isBackfilled())

  // 第一遍：每人只取「最新一首」——604 位歌手压成 21 个请求
  const scan = await deps.getLatestSongs(singers.map(singer => singer.mid), 1)

  // 只对「最新一首与基线标记不同」的歌手补查。
  // `latestSongId == null` 的（此前没有任何作品的歌手）也要补：他现在可能一次发了一整张专。
  // 首次的（没有基线行）与新关注同理——要拿最新一簇，也得补查；补齐轮则全员补。
  const detailMids: string[] = []
  for (const entry of scan) {
    if (!entry.ok || !entry.songs.length) continue
    const row = baselineMap.get(entry.mid)
    if (doBackfill) { detailMids.push(entry.mid); continue }
    if (row == null) { detailMids.push(entry.mid); continue }
    if (row.latestSongId != null && newSongIdOf(entry.songs[0].song) === row.latestSongId) continue
    detailMids.push(entry.mid)
  }
  const detailMap = new Map<string, SingerFetch>()
  if (detailMids.length) {
    for (const entry of await deps.getLatestSongs(detailMids, DETAIL_SONG_NUM)) detailMap.set(entry.mid, entry)
  }

  const baselines: LX.FollowFeed.BaselineInput[] = []
  const items: LX.FollowFeed.ItemInput[] = []
  /** 补齐池（首次歌手 / 存量补齐）：最新一簇，写入侧按 `ITEM_KEEP` 兜底总量 */
  const backfill: LX.FollowFeed.ItemInput[] = []
  for (const entry of scan) {
    // 没取到的歌手：基线不动（下一轮自然补上）
    if (!entry.ok) continue
    const detail = detailMap.get(entry.mid)
    // 补查失败时**退化成扫描拿到的那首**：至少把最新一首报出来，基线的标记也停在它上面
    const songs = detail?.ok && detail.songs.length ? detail.songs : entry.songs
    const singer = { mid: entry.mid, name: nameMap.get(entry.mid) ?? '' }
    const row = baselineMap.get(entry.mid)
    const diff = diffSinger(singer, songs, row)
    baselines.push(diff.baseline)
    if (doBackfill || row == null) backfill.push(...backfillItemsOf(singer, songs))
    items.push(...diff.items)
  }

  // 写入顺序：补档在前且按发布时间**升序**——`insertItems` 的容量清理按 (已读优先, id 升序) 删，
  // 于是超量时先丢「时间最旧的补档」；本轮真增量（items）排在后面不会被误删
  backfill.sort((a, b) => (a.publishTime < b.publishTime ? -1 : 1))
  const toAdd = [...backfill, ...items]
  if (baselines.length) await deps.saveBaseline(baselines)
  if (toAdd.length) await deps.addItems(toAdd)
  // 标记只在**每位歌手本轮都成功**时写：有 ok:false 的话这些人的最新更新还没进库，
  // 下一轮要再来一遍（标记没写 = 重跑，不会漏）
  const backfilled = doBackfill && scan.every(entry => entry.ok)
  if (backfilled) await deps.markBackfilled()
  return { scanned: baselines.length, newItems: items.length, detailed: detailMids.length, backfilled }
}
