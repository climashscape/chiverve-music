import { describe, expect, it, vi } from 'vitest'
import { runCheck, DETAIL_SONG_NUM, type CheckDeps } from './check'
import type { FetchedSong, SingerFetch } from './diff'

/**
 * 一轮检查的编排（票 04/05 的接缝①：注入假 tx 与假存储，不碰网络也不碰库）。
 *
 * 钉的是四条**外部行为**：
 *   1. 首次静默：没有基线行时不产条目、且**不补查**（604 位歌手的第一轮只要 21 个请求）；
 *   2. 只对「最新一首相对基线有变化」的歌手补查（一轮通常 0–3 位，别变成 604 次补查）；
 *   3. 局部失败（`ok: false`）**不推进那些歌手的基线**——这样失败会在下一轮自然补上；
 *   4. 基线每轮整批重写（`updatedAt` = 上次跑通的时间），条目只在有新东西时写。
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

/** 造一份假依赖；每个方法都是 spy，断言只看它们收到什么 */
const buildDeps = (over: Partial<CheckDeps> & { scan?: SingerFetch[], detail?: SingerFetch[] } = {}) => {
  const getFollowedSingers = vi.fn(async() => [{ mid: 'm1', name: '歌手一' }])
  const getLatestSongs = vi.fn(async(mids: string[], num: number) => {
    return num === 1 ? over.scan ?? [] : over.detail ?? []
  })
  const saveBaseline = vi.fn(async(_rows: LX.FollowFeed.BaselineInput[]) => undefined)
  const addItems = vi.fn(async(_items: LX.FollowFeed.ItemInput[]) => undefined)
  const loadBaseline = vi.fn(async() => [] as LX.FollowFeed.Baseline[])
  return {
    getFollowedSingers: over.getFollowedSingers ?? getFollowedSingers,
    getLatestSongs: over.getLatestSongs ?? getLatestSongs,
    loadBaseline: over.loadBaseline ?? loadBaseline,
    saveBaseline: over.saveBaseline ?? saveBaseline,
    addItems: over.addItems ?? addItems,
    _spies: { getFollowedSingers, getLatestSongs, saveBaseline, addItems, loadBaseline },
  }
}

describe('首次运行：静默建基线、不补查、不产条目', () => {
  it('没有基线行 → 只写基线（每位一行），条目一条都不写', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => []),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }, { mid: 'm2', name: '歌手二' }]),
      scan: [buildFetched('m1', [buildSong('s1')]), buildFetched('m2', [buildSong('s2')])],
    })

    const result = await runCheck(deps)

    expect(result).toEqual({ scanned: 2, newItems: 0, detailed: 0 })
    expect(deps._spies.saveBaseline).toHaveBeenCalledTimes(1)
    expect(deps._spies.saveBaseline.mock.calls[0][0]).toEqual([
      { singerMid: 'm1', latestSongId: 'tx_s1', latestSongTime: '2026-09-20' },
      { singerMid: 'm2', latestSongId: 'tx_s2', latestSongTime: '2026-09-20' },
    ])
    expect(deps._spies.addItems).not.toHaveBeenCalled()
  })

  it('首次的运行**只发一轮扫描**（没有第二次「补查」请求）', async() => {
    const deps = buildDeps({
      loadBaseline: vi.fn(async() => []),
      getFollowedSingers: vi.fn(async() => [{ mid: 'm1', name: '歌手一' }]),
      scan: [buildFetched('m1', [buildSong('s1')])],
    })

    await runCheck(deps)

    expect(deps._spies.getLatestSongs).toHaveBeenCalledTimes(1)
    expect(deps._spies.getLatestSongs.mock.calls[0][1]).toBe(1)
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

    expect(result).toEqual({ scanned: 1, newItems: 0, detailed: 0 })
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

    expect(result).toEqual({ scanned: 1, newItems: 0, detailed: 0 })
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

    expect(result).toEqual({ scanned: 0, newItems: 0, detailed: 0 })
    expect(deps._spies.getLatestSongs).not.toHaveBeenCalled()
    expect(deps._spies.saveBaseline).not.toHaveBeenCalled()
  })
})
