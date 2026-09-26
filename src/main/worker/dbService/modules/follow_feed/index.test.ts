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
    followFeedItemsAdd([
      buildItem({ itemId: 'tx_s_a', name: '旧歌', publishTime: '2026-08-01' }),
      buildItem({ itemId: 'tx_s_b', name: '新歌', publishTime: '2026-09-10' }),
      buildItem({ itemId: 'tx_s_c', name: '不新不旧', publishTime: '2026-08-20' }),
    ])
    expect(followFeedItemsGet().map(item => item.name)).toEqual(['新歌', '不新不旧', '旧歌'])
  })

  it('同 (kind, itemId) 重复写入只留一条（同一首歌不会被报两次）', () => {
    const before = followFeedItemsGet().length
    followFeedItemsAdd([buildItem({ itemId: 'tx_s_b', name: '新歌（重复上报）', publishTime: '2026-09-10' })])
    const after = followFeedItemsGet()
    expect(after).toHaveLength(before)
    // 首条内容不被后来者覆盖：去重是「忽略重复」而不是「用新值替换」
    expect(after.find(item => item.itemId == 'tx_s_b')!.name).toBe('新歌')
  })

  it('歌曲 id 不同则各占一行（专辑行与歌曲行互不干扰，kind 不同也算不同条目）', () => {
    followFeedItemsAdd([
      buildItem({ itemId: 'alb_z', kind: 'album', name: '新专', trackCount: 12, music: null }),
      buildItem({ itemId: 'tx_s_d', kind: 'song', name: '专辑里的一首', publishTime: '2026-09-11' }),
    ])
    const items = followFeedItemsGet()
    expect(items.find(item => item.itemId == 'alb_z')!.kind).toBe('album')
    expect(items.find(item => item.itemId == 'alb_z')!.trackCount).toBe(12)
    // 专辑行没有可播放载荷
    expect(items.find(item => item.itemId == 'alb_z')!.music).toBe(null)
  })

  it('歌曲行的 music 载荷能原样读回（播放队列靠它，不能在中转里丢）', () => {
    const payload = JSON.stringify({ id: 'tx_s_e', name: '带载荷', singer: '歌手乙', source: 'tx', interval: '03:00', meta: { songId: 's_e' } })
    followFeedItemsAdd([buildItem({ itemId: 'tx_s_e', name: '带载荷', publishTime: '2026-09-12', music: payload })])
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

describe('保留 100 条：优先删最旧的已读，未读在 100 条内不许被删', () => {
  it('110 条（90 已读 + 20 未读）→ 剩 100，删掉的是最旧的 10 条已读，未读 20 条全在', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'prune-mixed-'))
    expect(init(dir)).not.toBeNull()

    // 90 条已读：先写，再整体标记已读
    const readItems = Array.from({ length: 90 }, (_, index) => buildItem({
      itemId: `tx_read_${index}`,
      name: `已读${index}`,
      publishTime: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    }))
    followFeedItemsAdd(readItems)
    followFeedMarkAllRead()
    expect(followFeedUnreadCount()).toBe(0)

    // 20 条未读
    const unreadItems = Array.from({ length: 20 }, (_, index) => buildItem({
      itemId: `tx_unread_${index}`,
      name: `未读${index}`,
      publishTime: '2026-09-20',
    }))
    followFeedItemsAdd(unreadItems)

    const items = followFeedItemsGet()
    expect(items).toHaveLength(100)
    expect(followFeedUnreadCount()).toBe(20)
    // 未读一条都没少
    expect(items.filter(item => item.read === 0)).toHaveLength(20)
    // 被删的是**最旧的已读**（插入最早的那批）
    const names = new Set(items.map(item => item.name))
    expect(names.has('已读0')).toBe(false)
    expect(names.has('已读9')).toBe(false)
    expect(names.has('已读10')).toBe(true)
  })

  it('110 条全是未读（没有已读可删）→ 只能删最旧的未读，剩 100', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'prune-unread-'))
    expect(init(dir)).not.toBeNull()

    followFeedItemsAdd(Array.from({ length: 110 }, (_, index) => buildItem({
      itemId: `tx_all_unread_${index}`,
      name: `未读${index}`,
      publishTime: '2026-09-21',
    })))

    const items = followFeedItemsGet()
    expect(items).toHaveLength(100)
    expect(followFeedUnreadCount()).toBe(100)
    const names = new Set(items.map(item => item.name))
    expect(names.has('未读0')).toBe(false)
    expect(names.has('未读9')).toBe(false)
    expect(names.has('未读10')).toBe(true)
  })

  it('未满 100 条时一条都不删', () => {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'prune-none-'))
    expect(init(dir)).not.toBeNull()

    followFeedItemsAdd(Array.from({ length: 99 }, (_, index) => buildItem({
      itemId: `tx_keep_${index}`,
      name: `保留${index}`,
    })))
    expect(followFeedItemsGet()).toHaveLength(99)
  })
})
