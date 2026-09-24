import { describe, expect, it } from 'vitest'
import { MUSIC_URL_RECYCLE_BATCH_SIZE, selectMusicUrlRecycle } from './recycle'

/**
 * URL 缓存回收的「挑行」判定（设置页重构票 08）。
 *
 * 被测的是纯函数：喂进「由旧到新」的行 + 两个阈值，断言该删哪些 id、剩余占用是多少。
 * 不碰数据库（取行 / 删行在 `index.ts`，靠真机与旧库实测兜）。
 *
 * 边界清单（工单要求）：0 天 / 0 MB（= 不回收）、恰好等于阈值、全部过期、空表；
 * 另外钉了 `keepIdPrefix`（正在播放那首歌不删）、同一行不重复删、以及 0 时间戳（老库行）的口径。
 * `now` 一律注入，免得跑起来时「两条日期差一天」这类断言受真实时间影响。
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

/** 造一行挑行视图：id / 写入时间 / 近似占用 */
const row = (id: string, createdAt: number, bytes: number): LX.DBService.MusicUrlCacheRow => ({ id, createdAt, bytes })

/** 由旧到新排好的行（与 `createRecycleQueryStatement` 的 ORDER BY 同序） */
const rowsOf = (...rows: Array<[string, number, number]>) =>
  rows.map(([id, createdAt, bytes]) => row(id, createdAt, bytes)).sort((a, b) => a.createdAt - b.createdAt)

describe('两个阈值都是 0（默认）= 不回收', () => {
  const rows = rowsOf(
    ['a_128k', NOW - 100 * DAY, 100],
    ['b_128k', NOW, 200],
  )

  it('不删任何行，占用原样返回', () => {
    const result = selectMusicUrlRecycle(rows, { keepDays: 0, maxSizeMB: 0, now: NOW })
    expect(result.ids).toEqual([])
    expect(result.bytesBefore).toBe(300)
    expect(result.bytesAfter).toBe(300)
  })

  it('负数 / NaN / undefined 也当「不回收」，不误删', () => {
    for (const keepDays of [-1, -100, Number.NaN]) {
      const result = selectMusicUrlRecycle(rows, { keepDays, maxSizeMB: 0, now: NOW })
      expect(result.ids, `keepDays=${keepDays}`).toEqual([])
    }
    for (const maxSizeMB of [-1, Number.NaN]) {
      const result = selectMusicUrlRecycle(rows, { keepDays: 0, maxSizeMB, now: NOW })
      expect(result.ids, `maxSizeMB=${maxSizeMB}`).toEqual([])
    }
  })
})

describe('保留天数（cache.musicUrlKeepDays）', () => {
  it('只删过期的；**恰好等于截止时刻的行保留**（边界）', () => {
    const expireBefore = NOW - 1 * DAY
    const rows = rowsOf(
      ['old_128k', expireBefore - 1, 100], // 过期 1ms → 删
      ['exact_128k', expireBefore, 100], // 恰好等于截止时刻 → 留
      ['fresh_128k', NOW, 100], // 没过期 → 留
    )
    const result = selectMusicUrlRecycle(rows, { keepDays: 1, maxSizeMB: 0, now: NOW })
    expect(result.ids).toEqual(['old_128k'])
    expect(result.bytesBefore).toBe(300)
    expect(result.bytesAfter).toBe(200)
  })

  it('0 时间戳（老库加列之前写的行）当最旧，先被删', () => {
    const rows = rowsOf(
      ['legacy_128k', 0, 100],
      ['fresh_128k', NOW, 100],
    )
    const result = selectMusicUrlRecycle(rows, { keepDays: 1, maxSizeMB: 0, now: NOW })
    expect(result.ids).toEqual(['legacy_128k'])
  })

  it('全部过期 → 全删，剩余占用 0', () => {
    const rows = rowsOf(
      ['a_128k', NOW - 10 * DAY, 100],
      ['b_128k', NOW - 9 * DAY, 200],
      ['c_128k', NOW - 8 * DAY, 300],
    )
    const result = selectMusicUrlRecycle(rows, { keepDays: 1, maxSizeMB: 0, now: NOW })
    expect(result.ids).toEqual(['a_128k', 'b_128k', 'c_128k'])
    expect(result.bytesAfter).toBe(0)
  })

  it('空表 → 什么都不删', () => {
    const result = selectMusicUrlRecycle([], { keepDays: 1, maxSizeMB: 1, now: NOW })
    expect(result).toEqual({ ids: [], bytesBefore: 0, bytesAfter: 0 })
  })
})

describe('容量上限（cache.maxSizeMB）', () => {
  /** 1 MB = 1048576 字节；用「整 MB」造数据，断言好读 */
  const MB = 1024 * 1024
  /** 每条 1 MB 的行，写入时间递增（由旧到新） */
  const rowsOfMb = (count: number) => Array.from({ length: count }, (_, index) => row(`m${index}_128k`, NOW - (count - index) * DAY, MB))

  it('从最旧的一端删到不超过上限（**恰好等于上限不算超**，边界）', () => {
    const rows = rowsOfMb(3)
    // 上限正好 2 MB：删 1 条后剩余 2 MB == 上限 → 停手
    const result = selectMusicUrlRecycle(rows, { keepDays: 0, maxSizeMB: 2, now: NOW })
    expect(result.ids).toEqual(['m0_128k'])
    expect(result.bytesAfter).toBe(2 * MB)
  })

  it('上限大于总占用 → 一条都不删', () => {
    const rows = rowsOfMb(3)
    const result = selectMusicUrlRecycle(rows, { keepDays: 0, maxSizeMB: 10, now: NOW })
    expect(result.ids).toEqual([])
    expect(result.bytesAfter).toBe(3 * MB)
  })

  it('上限小于单条 → 把手上的行删完就停手（不会删出负数）', () => {
    const rows = rowsOfMb(2)
    const result = selectMusicUrlRecycle(rows, { keepDays: 0, maxSizeMB: 0.5, now: NOW })
    expect(result.ids).toEqual(['m0_128k', 'm1_128k'])
    expect(result.bytesAfter).toBe(0)
  })
})

describe('两个阈值叠加', () => {
  const MB = 1024 * 1024

  it('先按时间删、再按容量删，同一个 id 不会重复出现', () => {
    const rows = [
      // 过期的两条（小行），再加两条新的大行撑爆容量
      row('old_a_128k', NOW - 5 * DAY, 10),
      row('old_b_128k', NOW - 4 * DAY, 10),
      row('new_a_128k', NOW - 1 * DAY, MB),
      row('new_b_128k', NOW, MB),
    ]
    const result = selectMusicUrlRecycle(rows, { keepDays: 1, maxSizeMB: 1.5, now: NOW })
    // 时间规则删 old_a / old_b（20 字节）后仍超过 1.5 MB，容量规则继续删最旧的 new_a
    expect(result.ids).toEqual(['old_a_128k', 'old_b_128k', 'new_a_128k'])
    expect(result.bytesAfter).toBe(MB)
  })

  it('顺序由旧到新（容量规则依赖这个序，挑出来的 id 也照它排）', () => {
    const rows = rowsOf(
      ['oldest_128k', NOW - 3 * DAY, MB],
      ['middle_128k', NOW - 2 * DAY, MB],
      ['newest_128k', NOW - 1 * DAY, MB],
    )
    const result = selectMusicUrlRecycle(rows, { keepDays: 0, maxSizeMB: 1, now: NOW })
    expect(result.ids).toEqual(['oldest_128k', 'middle_128k'])
  })
})

describe('keepIdPrefix：正在播放那首歌的行一条都不删', () => {
  const MB = 1024 * 1024

  it('命中的行不删，但**照样计入占用**（占用口径是整张表实际占多少）', () => {
    const rows = [
      row('playing_320k', NOW - 10 * DAY, MB),
      row('playing_128k', NOW - 9 * DAY, MB),
      row('other_128k', NOW - 8 * DAY, MB),
    ]
    // 保留项本身 2 MB 就超过 1 MB 上限：只删得掉 other，压不到上限内（这是刻意的取舍）
    const result = selectMusicUrlRecycle(rows, { keepDays: 0, maxSizeMB: 1, keepIdPrefix: 'playing_', now: NOW })
    expect(result.ids).toEqual(['other_128k'])
    expect(result.bytesAfter).toBe(2 * MB)
  })

  it('过期规则也不删命中的行', () => {
    const rows = [
      row('playing_128k', NOW - 10 * DAY, 100),
      row('other_128k', NOW - 10 * DAY, 100),
    ]
    const result = selectMusicUrlRecycle(rows, { keepDays: 1, maxSizeMB: 0, keepIdPrefix: 'playing_', now: NOW })
    expect(result.ids).toEqual(['other_128k'])
    expect(result.bytesAfter).toBe(100)
  })

  it('传 null / 不传 = 没有保留项（启动时的回收就是这样）', () => {
    const rows = [row('a_128k', NOW - 10 * DAY, 100)]
    expect(selectMusicUrlRecycle(rows, { keepDays: 1, maxSizeMB: 0, keepIdPrefix: null, now: NOW }).ids).toEqual(['a_128k'])
    expect(selectMusicUrlRecycle(rows, { keepDays: 1, maxSizeMB: 0, now: NOW }).ids).toEqual(['a_128k'])
  })
})

describe('批量删除的批大小', () => {
  it('是个正数（调用方按它切批，写成 0 会让回收死循环）', () => {
    expect(MUSIC_URL_RECYCLE_BATCH_SIZE).toBeGreaterThan(0)
    expect(Number.isInteger(MUSIC_URL_RECYCLE_BATCH_SIZE)).toBe(true)
  })
})
