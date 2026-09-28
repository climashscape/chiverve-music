import { describe, expect, it, vi } from 'vitest'
import { runCheck, DETAIL_SONG_NUM, type CheckDeps } from './check'
import type { FetchedSong, SingerFetch } from './diff'

/**
 * 一轮检查的编排（票 04/05 的接缝①：注入假 tx 与假存储，不碰网络也不碰库）。
 *
 * 钉的是五条**外部行为**：
 *   1. 首次见到歌手（没有基线行）→ 建基线 + **补齐它的最新一簇**（要补查拿 num:10）；
 *   2. 只对「最新一首相对基线有变化」的歌手补查（常规轮通常 0–3 位，别变成 604 次补查）；
 *   3. 局部失败（`ok: false`）**不推进那些歌手的基线**——这样失败会在下一轮自然补上；
 *   4. **存量补齐**（`isBackfilled` 为 false）：本轮对全体歌手补查并补档，且只在整轮全成功时写标记；
 *   5. 基线每轮整批重写（`updatedAt` = 上次跑通的时间），条目只在有新东西时写。
 */

const buildSong = (mid: string, albumMid = 'alb_default'): FetchedSong => ({
  song: { songmid: mid, name: `歌_${mid}`, singer: '歌手', source: 'tx', albumMid, albumName: '专辑', interval: null, types: [], _types: {}, strMediaMid: mid, songId: 1, songType: 0, img: '', typeUrl: {} },
  publishTime: '2026-09-20',
})

const buildFetched = (mid: string, songs: FetchedSong[]): SingerFetch => ({ mid, ok: true, songs })
const failedFetch = (mid: string): SingerFetch => ({ mid, ok: false, songs: [] })

const baselineOf = (mid: string, latestSongId: string | null): LX.FollowFeed.Baseline => ({
  singerMid: mid,
  latestSongId,
  latestSongTime: latestSongId ? '2026-09-01' : null,
  updatedAt: 1,
})

/**
 * 造一份假依赖；每个方法都是 spy，断言只看它们收到什么。
 *
 * `isBackfilled` 默认 **true**（存量补齐已完成）——绝大多数用例测的是日常增量轮；
 * 测首次/补齐的用例显式传 `isBackfilled: async () => false`。
 */
const buildDeps = (over: Partial<CheckDeps> & { scan?: SingerFetch[], detail?: SingerFetch[] } = {}) => {
  const getFollowedSingers = vi.fn(async() => [{ mid: 'm1', name: '歌手一' }])
  const getLatestSongs = vi.fn(async(mids: string[], num: number) => {
    return num === 1 ? over.scan ?? [] : over.detail ?? []
  })
  const saveBaseline = vi.fn(async(_rows: LX.FollowFeed.BaselineInput[]) => undefined)
  const addItems = vi.fn(async(_items: LX.FollowFeed.ItemInput[]) => undefined)
  const loadBaseline = vi.fn(async() => [] as LX.FollowFeed.Baseline[])
  const isBackfilled = vi.fn(async() => true)
  const markBackfilled = vi.fn(async() => undefined)
  return {
    getFollowedSingers: over.getFollowedSingers ?? getFollowedSingers,
    getLatestSongs: over.getLatestSongs ?? getLatestSongs,
    loadBaseline: over.loadBaseline ?? loadBaseline,
    saveBaseline: over.saveBaseline ?? saveBaseline,
    addItems: over.addItems ?? addItems,
    isBackfilled: over.isBackfilled ?? isBackfilled,
    markBackfilled: over.markBackfilled ?? markBackfilled,
    _spies: { getFollowedSingers, getLatestSongs, saveBaseline, addItems, loadBaseline, isBackfilled, markBackfilled },
  }
}

describe('首次运行（存量补齐）：建基线 + 每位歌手的最新一簇，并写一次性标记', () => {
  it('没有基线行且未补档 → 基线全写 + 最新一簇入库（同专聚合）+ 写标记', async() => {
    const deps = buildDeps({
      isBackfilled: vi.fn(async() => false),
      loadBaseline: vi.fn(async() => []),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }, { mid: 'm2', name: '歌手二' }]),
      scan: [buildFetched('m1', [buildSong('s1')]), buildFetched('m2', [buildSong('s2')])],
      detail: [
        buildFetched('m1', [buildSong('s1', 'alb_a'), buildSong('s1b', 'alb_a')]),
        buildFetched('m2', [buildSong('s2', 'alb_b')]),
      ],
    })

    const result = await runCheck(deps)

    expect(result).toEqual({ scanned: 2, newItems: 0, detailed: 2, backfilled: true })
    expect(deps._spies.saveBaseline.mock.calls[0][0]).toEqual([
      { singerMid: 'm1', latestSongId: 'tx_s1', latestSongTime: '2026-09-20' },
      { singerMid: 'm2', latestSongId: 'tx_s2', latestSongTime: '2026-09-20' },
    ])
    // 补齐条目：m1 同专辑两条 → 一行新专；m2 单曲行（聚合规则与增量同源）
    expect(deps._spies.addItems).toHaveBeenCalledTimes(1)
    const added = deps._spies.addItems.mock.calls[0][0]
    expect(added).toHaveLength(2)
    expect(added[0]).toMatchObject({ kind: 'album', itemId: 'alb_a', trackCount: 2 })
    expect(added[1]).toMatchObject({ kind: 'song', itemId: 'tx_s2' })
    expect(deps._spies.markBackfilled).toHaveBeenCalledTimes(1)
  })

  it('首次运行要发两轮请求（扫描 + 补查）——最新一簇需要 num:10，不能只有首首', async() => {
    const deps = buildDeps({
      isBackfilled: vi.fn(async() => false),
      loadBaseline: vi.fn(async() => []),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }]),
      scan: [buildFetched('m1', [buildSong('s1')])],
      detail: [buildFetched('m1', [buildSong('s1')])],
    })

    await runCheck(deps)

    expect(deps._spies.getLatestSongs).toHaveBeenCalledTimes(2)
    expect(deps._spies.getLatestSongs.mock.calls[1][0]).toEqual(['m1'])
    expect(deps._spies.getLatestSongs.mock.calls[1][1]).toBe(DETAIL_SONG_NUM)
  })

  it('有歌手本轮失败 → **不写标记**（下一轮重来，别把没补到的人永久漏掉）', async() => {
    const deps = buildDeps({
      isBackfilled: vi.fn(async() => false),
      loadBaseline: vi.fn(async() => []),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }, { mid: 'm2', name: '歌手二' }]),
      scan: [buildFetched('m1', [buildSong('s1')]), failedFetch('m2')],
      detail: [buildFetched('m1', [buildSong('s1')])],
    })

    const result = await runCheck(deps)

    expect(result.backfilled).toBe(false)
    expect(deps._spies.markBackfilled).not.toHaveBeenCalled()
  })

  it('已补档的库：新关注的歌手（没有基线行）也补最新一簇，但不重跑存量补齐', async() => {
    const deps = buildDeps({
      // isBackfilled 默认 true
      loadBaseline: vi.fn(async() => [baselineOf('m0', 'tx_x')]),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm0', name: '老歌手' }, { mid: 'm1', name: '新关注' }]),
      scan: [buildFetched('m0', [buildSong('x')]), buildFetched('m1', [buildSong('s1', 'alb_a'), buildSong('s1b', 'alb_a')])],
      detail: [buildFetched('m1', [buildSong('s1', 'alb_a'), buildSong('s1b', 'alb_a')])],
    })

    const result = await runCheck(deps)

    expect(result.backfilled).toBe(false)
    expect(deps._spies.markBackfilled).not.toHaveBeenCalled()
    // 老歌手最新一首就是标记（没变化）→ 不补查；新关注的进补查名单
    expect(deps._spies.getLatestSongs.mock.calls[1][0]).toEqual(['m1'])
    expect(deps._spies.addItems.mock.calls[0][0]).toHaveLength(1)
    expect(deps._spies.addItems.mock.calls[0][0][0]).toMatchObject({ kind: 'album', itemId: 'alb_a' })
  })
})

describe('补查：只对「最新一首变了」的歌手发第二次请求', () => {
  it('最新一首与基线标记不同 → 该歌手进补查名单，且补查取 10 首', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => [baselineOf('m1', 'tx_old')]),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }]),
      scan: [buildFetched('m1', [buildSong('s_new')])],
      detail: [buildFetched('m1', [
        buildSong('s_new', 'alb_x'),
        buildSong('s_new2', 'alb_x'),
      ])],
    })

    const result = await runCheck(deps)

    expect(result.detailed).toBe(1)
    expect(deps._spies.getLatestSongs).toHaveBeenCalledTimes(2)
    expect(deps._spies.getLatestSongs.mock.calls[1][0]).toEqual(['m1'])
    expect(deps._spies.getLatestSongs.mock.calls[1][1]).toBe(DETAIL_SONG_NUM)
    // 补查拿到的两条同专 → 一行新专
    expect(deps._spies.addItems.mock.calls[0][0]).toHaveLength(1)
    expect(deps._spies.addItems.mock.calls[0][0][0]).toMatchObject({ kind: 'album', itemId: 'alb_x', trackCount: 2 })
  })

  it('最新一首就是基线标记（没变化）→ **不补查、不写条目**，但基线照样整批重写', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => [baselineOf('m1', 'tx_s1')]),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }]),
      scan: [buildFetched('m1', [buildSong('s1')])],
    })

    const result = await runCheck(deps)

    expect(result).toEqual({ scanned: 1, newItems: 0, detailed: 0, backfilled: false })
    expect(deps._spies.getLatestSongs).toHaveBeenCalledTimes(1)
    expect(deps._spies.addItems).not.toHaveBeenCalled()
    // 重写基线让「上次成功检查」的时间往前走——它表示这一轮跑通了，不是「有新东西」
    expect(deps._spies.saveBaseline).toHaveBeenCalledTimes(1)
  })

  it('基线标记为 null（此前没有作品的歌手）→ 也算有变化，要补查', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => [baselineOf('m1', null)]),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }]),
      scan: [buildFetched('m1', [buildSong('s1')])],
      // 两张不同的专辑：否则会被当成「一张新专」合并成一行
      detail: [buildFetched('m1', [buildSong('s1', 'alb_a'), buildSong('s2', 'alb_b')])],
    })

    const result = await runCheck(deps)

    expect(result.detailed).toBe(1)
    expect(result.newItems).toBe(2)
  })
})

describe('局部失败：不让失败的歌手推进基线', () => {
  it('整块失败的歌手不进基线写入，也不进补查名单（下一轮自然补上）', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => [baselineOf('m1', 'tx_old'), baselineOf('m2', 'tx_s2')]),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }, { mid: 'm2', name: '歌手二' }]),
      scan: [failedFetch('m1'), buildFetched('m2', [buildSong('s2')])],
    })

    const result = await runCheck(deps)

    expect(result.scanned).toBe(1)
    expect(deps._spies.saveBaseline.mock.calls[0][0].map((row: LX.FollowFeed.BaselineInput) => row.singerMid)).toEqual(['m2'])
    // 第二次请求是 m2 的补查？不——m2 的最新一首就是它的基线标记（没有变化），所以只有那一次扫描
    expect(deps._spies.getLatestSongs).toHaveBeenCalledTimes(1)
  })

  it('某位歌手一条歌都没有（`ok` 但空列表）→ 基线仍写（标记为 null），不产条目', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => []),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }]),
      scan: [buildFetched('m1', [])],
    })

    const result = await runCheck(deps)

    expect(result).toEqual({ scanned: 1, newItems: 0, detailed: 0, backfilled: false })
    expect(deps._spies.saveBaseline.mock.calls[0][0]).toEqual([{ singerMid: 'm1', latestSongId: null, latestSongTime: null }])
  })

  it('补查失败 → 退化成扫描那一首（判新仍成立，但基线只推到它）', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => [baselineOf('m1', 'tx_old')]),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }]),
      scan: [buildFetched('m1', [buildSong('s_new')])],
      detail: [failedFetch('m1')],
    })

    const result = await runCheck(deps)

    expect(result.newItems).toBe(1)
    expect(deps._spies.addItems.mock.calls[0][0][0]).toMatchObject({ kind: 'song', itemId: 'tx_s_new' })
    expect(deps._spies.saveBaseline.mock.calls[0][0][0].latestSongId).toBe('tx_s_new')
  })
})

describe('整轮的前置失败与空名单', () => {
  it('关注列表拿不到 → 向上抛（调用方据此记失败与退避），一次扫描都不发', async() => {
    const deps = buildDeps({
      getFollowedSingers: vi.fn(async() => { throw new Error('QQ 音乐未登录') }),
    })

    await expect(runCheck(deps)).rejects.toThrow('QQ 音乐未登录')
    expect(deps._spies.getLatestSongs).not.toHaveBeenCalled()
  })

  it('关注列表为空（谁都没关注）→ 不打扫描、不写库', async() => {
    const deps = buildDeps({ getFollowedSingers: vi.fn(async() => []) })

    const result = await runCheck(deps)

    expect(result).toEqual({ scanned: 0, newItems: 0, detailed: 0, backfilled: false })
    expect(deps._spies.getLatestSongs).not.toHaveBeenCalled()
    expect(deps._spies.saveBaseline).not.toHaveBeenCalled()
  })
})
