import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { getDB, init } from '../../db'
import {
  followFeedBaselineAll,
  followFeedBaselineSave,
  followFeedItemsAdd,
  followFeedItemsGet,
  followFeedMarkAllRead,
  followFeedSummary,
  followFeedUnreadCount,
  followFeedWindowCutoff,
} from './index'

/**
 * 关注动态持久化域的用例（票 02）。
 *
 * 钉的是**外部行为**：写进去能读回来、去重靠 `(kind,itemId)`、时间线按发布时间倒序、
 * 未读计数与「进入即全部已读」、以及**保留 100 条时优先删最旧的已读**——
 * 最后一条是角标数字能否说实话的关键（清掉未读会让角标无故变小）。
 *
 * 用真库跑（better-sqlite3 + `db.ts` 的 `init`）：这些行为都由真实 SQL 决定，
 * 桩掉 SQL 就等于什么都没验。桩只去掉打包后才用到的 `nativeBinding` 路径提示（同 migrate.test.ts）。
 */
vi.mock('better-sqlite3', async(importOriginal) => {
  const actual = await importOriginal<{ default: typeof Database }>()
  const RealDatabase = actual.default
  const DatabaseWithoutNativeBinding = new Proxy(RealDatabase, {
    construct: (target, args) => {
      const [filename, options] = args as [string, Record<string, unknown> | undefined]
      const nextOptions: Record<string, unknown> = { ...options }
      delete nextOptions.nativeBinding
      return Reflect.construct(target, [filename, nextOptions])
    },
  })
  return { ...actual, default: DatabaseWithoutNativeBinding }
})

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chiverve-follow-feed-'))

afterAll(() => {
  try {
    getDB()?.close()
  } catch {}
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

/** 条目写入助手：只暴露本用例关心的字段，其余给稳定缺省值 */
const buildItem = (over: Partial<LX.FollowFeed.ItemInput> = {}): LX.FollowFeed.ItemInput => ({
  kind: 'song',
  singerMid: 'mid_a',
  singerName: '歌手甲',
  itemId: 'tx_song_1',
  name: '某首歌',
  albumMid: 'alb_1',
  albumName: '某张专',
  trackCount: null,
  publishTime: '2026-09-01',
  music: null,
  ...over,
})

describe('基线：按歌手一行，重复写是更新不是新增', () => {
  beforeAll(() => {
    expect(init(fs.mkdtempSync(path.join(tmpRoot, 'baseline-')))).not.toBeNull()
  })

  it('写进去能逐字段读回来', () => {
    followFeedBaselineSave([
      { singerMid: 'mid_one', latestSongId: 'tx_s1', latestSongTime: '2026-09-20' },
    ])
    const rows = followFeedBaselineAll()
    expect(rows).toHaveLength(1)
    expect(rows[0].singerMid).toBe('mid_one')
    expect(rows[0].latestSongId).toBe('tx_s1')
    expect(rows[0].latestSongTime).toBe('2026-09-20')
    expect(typeof rows[0].updatedAt).toBe('number')
  })

  it('同一歌手再写一次是原地更新（行数不增、值被覆盖）', () => {
    followFeedBaselineSave([
      { singerMid: 'mid_one', latestSongId: 'tx_s2', latestSongTime: '2026-09-25' },
    ])
    const rows = followFeedBaselineAll()
    expect(rows).toHaveLength(1)
    expect(rows[0].latestSongId).toBe('tx_s2')
  })

  it('一次写多位歌手（一轮扫描的批量写）', () => {
    followFeedBaselineSave([
      { singerMid: 'mid_two', latestSongId: null, latestSongTime: null },
      { singerMid: 'mid_three', latestSongId: 'tx_s9', latestSongTime: '2026-08-01' },
    ])
    expect(followFeedBaselineAll().map(row => row.singerMid).sort()).toEqual(['mid_one', 'mid_three', 'mid_two'])
  })

  it('汇总（页面顶部）：监控数 = 基线行数，最近成功时间 = 基线里最大的 updatedAt', () => {
    const summary = followFeedSummary()
    expect(summary.monitoredCount).toBe(followFeedBaselineAll().length)
    const maxUpdatedAt = Math.max(...followFeedBaselineAll().map(row => row.updatedAt))
    expect(summary.lastSuccessAt).toBe(maxUpdatedAt)
  })

  it('空库时汇总给出「0 位 + 从未成功」（页面显示「从未检查」，不是假时间）', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'summary-empty-'))
    expect(init(dir)).not.toBeNull()
    expect(followFeedSummary()).toEqual({ monitoredCount: 0, lastSuccessAt: null })
  })
})

describe('条目：去重、排序、未读、载荷', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(tmpRoot, 'items-'))
    expect(init(dir)).not.toBeNull()
  })

  it('按发布时间倒序读回（同日则后发现的在前）', () => {
    const cutoff = followFeedWindowCutoff()
    followFeedItemsAdd([
      buildItem({ itemId: 'tx_s_a', name: '旧歌', publishTime: shiftDate(cutoff, 1) }),
      buildItem({ itemId: 'tx_s_b', name: '新歌', publishTime: shiftDate(cutoff, 13) }),
      buildItem({ itemId: 'tx_s_c', name: '不新不旧', publishTime: shiftDate(cutoff, 7) }),
    ])
    expect(followFeedItemsGet().map(item => item.name)).toEqual(['新歌', '不新不旧', '旧歌'])
  })

  it('同 (kind, itemId) 重复写入只留一条（同一首歌不会被报两次）', () => {
    const before = followFeedItemsGet().length
    followFeedItemsAdd([buildItem({ itemId: 'tx_s_b', name: '新歌（重复上报）', publishTime: shiftDate(followFeedWindowCutoff(), 13) })])
    const after = followFeedItemsGet()
    expect(after).toHaveLength(before)
    // 首条内容不被后来者覆盖：去重是「忽略重复」而不是「用新值替换」
    expect(after.find(item => item.itemId == 'tx_s_b')!.name).toBe('新歌')
  })

  it('歌曲 id 不同则各占一行（专辑行与歌曲行互不干扰，kind 不同也算不同条目）', () => {
    followFeedItemsAdd([
      buildItem({ itemId: 'alb_z', kind: 'album', name: '新专', trackCount: 12, music: null, publishTime: shiftDate(followFeedWindowCutoff(), 5) }),
      buildItem({ itemId: 'tx_s_d', kind: 'song', name: '专辑里的一首', publishTime: shiftDate(followFeedWindowCutoff(), 6) }),
    ])
    const items = followFeedItemsGet()
    expect(items.find(item => item.itemId == 'alb_z')!.kind).toBe('album')
    expect(items.find(item => item.itemId == 'alb_z')!.trackCount).toBe(12)
    // 专辑行没有可播放载荷
    expect(items.find(item => item.itemId == 'alb_z')!.music).toBe(null)
  })

  it('歌曲行的 music 载荷能原样读回（播放队列靠它，不能在中转里丢）', () => {
    const payload = JSON.stringify({ id: 'tx_s_e', name: '带载荷', singer: '歌手乙', source: 'tx', interval: '03:00', meta: { songId: 's_e' } })
    followFeedItemsAdd([buildItem({ itemId: 'tx_s_e', name: '带载荷', publishTime: shiftDate(followFeedWindowCutoff(), 8), music: payload })])
    expect(followFeedItemsGet().find(item => item.itemId == 'tx_s_e')!.music).toBe(payload)
  })

  it('新写入的条目一律未读，未读数 = 未读条目数', () => {
    expect(followFeedUnreadCount()).toBe(followFeedItemsGet().length)
  })

  it('「全部标为已读」把未读数清零，条目本身一条不少', () => {
    const before = followFeedItemsGet().length
    followFeedMarkAllRead()
    expect(followFeedUnreadCount()).toBe(0)
    expect(followFeedItemsGet()).toHaveLength(before)
    expect(followFeedItemsGet().every(item => item.read === 1)).toBe(true)
  })
})

/** 日期加减（`YYYY-MM-DD`），造窗口内/外的测试数据用 */
const shiftDate = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

describe('展示窗口：只保留本周与上一周（发布时间早于上周一的清掉，条数不设上限）', () => {
  it('本周 / 上周的条目全留，上周一之前的清掉', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'window-basic-'))
    expect(init(dir)).not.toBeNull()

    const cutoff = followFeedWindowCutoff()
    followFeedItemsAdd([
      buildItem({ itemId: 'tx_this_week', name: '本周', publishTime: shiftDate(cutoff, 13) }),
      buildItem({ itemId: 'tx_last_week', name: '上周', publishTime: cutoff }),
      buildItem({ itemId: 'tx_before_window', name: '上上周', publishTime: shiftDate(cutoff, -1) }),
      buildItem({ itemId: 'tx_ancient', name: '更早', publishTime: '2026-01-01' }),
    ])

    const items = followFeedItemsGet()
    expect(items.map(item => item.itemId).sort()).toEqual(['tx_last_week', 'tx_this_week'])
  })

  it('窗口内的条数不设上限（120 条全留）', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'window-no-limit-'))
    expect(init(dir)).not.toBeNull()

    const cutoff = followFeedWindowCutoff()
    followFeedItemsAdd(Array.from({ length: 120 }, (_, index) => buildItem({
      itemId: `tx_in_window_${index}`,
      name: `窗内${index}`,
      publishTime: shiftDate(cutoff, index % 14),
    })))

    expect(followFeedItemsGet()).toHaveLength(120)
  })

  it('发布时间缺失（空串）的条目视同早于窗口，一并出窗', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'window-empty-time-'))
    expect(init(dir)).not.toBeNull()

    const cutoff = followFeedWindowCutoff()
    followFeedItemsAdd([
      buildItem({ itemId: 'tx_has_time', name: '有日期', publishTime: shiftDate(cutoff, 3) }),
      buildItem({ itemId: 'tx_no_time', name: '没日期', publishTime: '' }),
    ])

    expect(followFeedItemsGet().map(item => item.itemId)).toEqual(['tx_has_time'])
  })
})
