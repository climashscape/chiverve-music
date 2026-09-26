import music from '@renderer/utils/musicSdk'
import { addFollowFeedItems, getFollowFeedBaseline, saveFollowFeedBaseline } from '@renderer/utils/ipc'
import { diffSinger, newSongIdOf, type SingerFetch } from './diff'

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
  /** 本轮写进库的条目数 */
  newItems: number
  /** 走了补查的歌手数 */
  detailed: number
}

export interface CheckDeps {
  getFollowedSingers: () => Promise<Array<{ mid: string, name: string }>>
  getLatestSongs: (mids: string[], num: number) => Promise<SingerFetch[]>
  loadBaseline: () => Promise<LX.FollowFeed.Baseline[]>
  saveBaseline: (rows: LX.FollowFeed.BaselineInput[]) => Promise<unknown>
  addItems: (items: LX.FollowFeed.ItemInput[]) => Promise<unknown>
}

export const defaultCheckDeps: CheckDeps = {
  getFollowedSingers: () => music.tx.singer.getFollowedSingers(),
  getLatestSongs: (mids, num) => music.tx.singer.getLatestSongs(mids, num),
  loadBaseline: () => getFollowFeedBaseline(),
  saveBaseline: rows => saveFollowFeedBaseline(rows),
  addItems: items => addFollowFeedItems(items),
}

/**
 * 跑一轮。**失败会向上抛**（关注列表拿不到 = 整轮没意义），由调用方决定怎么记与怎么退避。
 *
 * 三条刻意的行为：
 *   1. **基线的推进以「该歌手本轮成功取到数据」为条件**（`entry.ok`）——局部失败下一轮自然补上，
 *      不需要重试队列；
 *   2. **首次见到某位歌手时只建基线、不标它需要补查**（首次静默：604 位歌手的第一轮因此只要 21 个
 *      请求，且一条条目都不产生）；
 *   3. 基线**每轮都整批重写**（哪怕没有变化）：`updatedAt` 于是等于「上次成功检查的时间」，
 *      这正是页面顶部要显示的那个数——它表示「这一轮跑通了」，不是「这一轮有新东西」。
 */
export const runCheck = async(deps: CheckDeps = defaultCheckDeps): Promise<CheckRunResult> => {
  const singers = await deps.getFollowedSingers()
  if (!singers.length) return { scanned: 0, newItems: 0, detailed: 0 }

  const baselineRows = await deps.loadBaseline()
  const baselineMap = new Map(baselineRows.map(row => [row.singerMid, row]))
  const nameMap = new Map(singers.map(singer => [singer.mid, singer.name]))

  // 第一遍：每人只取「最新一首」——604 位歌手压成 21 个请求
  const scan = await deps.getLatestSongs(singers.map(singer => singer.mid), 1)

  // 只对「最新一首与基线标记不同」的歌手补查。
  // `latestSongId == null` 的（此前没有任何作品的歌手）也要补：他现在可能一次发了一整张专。
  const detailMids: string[] = []
  for (const entry of scan) {
    if (!entry.ok || !entry.songs.length) continue
    const row = baselineMap.get(entry.mid)
    if (row == null) continue
    if (row.latestSongId != null && newSongIdOf(entry.songs[0].song) === row.latestSongId) continue
    detailMids.push(entry.mid)
  }
  const detailMap = new Map<string, SingerFetch>()
  if (detailMids.length) {
    for (const entry of await deps.getLatestSongs(detailMids, DETAIL_SONG_NUM)) detailMap.set(entry.mid, entry)
  }

  const baselines: LX.FollowFeed.BaselineInput[] = []
  const items: LX.FollowFeed.ItemInput[] = []
  for (const entry of scan) {
    // 没取到的歌手：基线不动（下一轮自然补上）
    if (!entry.ok) continue
    const detail = detailMap.get(entry.mid)
    // 补查失败时**退化成扫描拿到的那首**：至少把最新一首报出来，基线的标记也停在它上面
    const songs = detail?.ok && detail.songs.length ? detail.songs : entry.songs
    const diff = diffSinger({ mid: entry.mid, name: nameMap.get(entry.mid) ?? '' }, songs, baselineMap.get(entry.mid))
    baselines.push(diff.baseline)
    items.push(...diff.items)
  }

  if (baselines.length) await deps.saveBaseline(baselines)
  if (items.length) await deps.addItems(items)
  return { scanned: baselines.length, newItems: items.length, detailed: detailMids.length }
}
