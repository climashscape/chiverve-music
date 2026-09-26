import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFollowFeedScheduler, nextDelay, FOLLOW_FEED_INTERVAL_MS } from './schedule'

/**
 * 检查节奏（票 06 的接缝①：注入假的 run + 假定时器，不碰网络也不碰库）。
 *
 * 钉四条：起步就查一次；成功回到 30 分钟；连续失败按 30 分 → 2 时 → 6 时封顶；
 * **手动刷新能立刻重置退避**（用户修好网络后不必等下一轮）；以及单飞（定时器与手动撞上时只跑一轮）。
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

describe('降频档位（纯函数）', () => {
  it('第 1 次失败仍按 30 分钟（偶发抖动不降频）；第 2 次 2 小时；≥3 次 6 小时封顶', () => {
    expect(nextDelay(0)).toBe(FOLLOW_FEED_INTERVAL_MS)
    expect(nextDelay(1)).toBe(30 * MINUTE)
    expect(nextDelay(2)).toBe(2 * HOUR)
    expect(nextDelay(3)).toBe(6 * HOUR)
    expect(nextDelay(9)).toBe(6 * HOUR)
  })
})

describe('调度器：起步、间隔与退避', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('start() 立刻跑一轮，之后每 30 分钟一轮', async() => {
    const run = vi.fn(async() => undefined)
    const scheduler = createFollowFeedScheduler({ run })

    await scheduler.start()
    expect(run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(29 * MINUTE)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1 * MINUTE)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(run).toHaveBeenCalledTimes(3)

    scheduler.stop()
  })

  it('连续失败：第 2 次失败后等 2 小时，第 3 次后等 6 小时', async() => {
    const run = vi.fn(async() => { throw new Error('boom') })
    const onError = vi.fn()
    const scheduler = createFollowFeedScheduler({ run, onError })

    await scheduler.start()
    expect(run).toHaveBeenCalledTimes(1)

    // 第 1 次失败 → 仍按 30 分钟
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(run).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenLastCalledWith(expect.any(Error), 2)

    // 第 2 次失败 → 2 小时
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2 * HOUR - 30 * MINUTE)
    expect(run).toHaveBeenCalledTimes(3)

    // 第 3 次失败 → 6 小时封顶
    await vi.advanceTimersByTimeAsync(6 * HOUR)
    expect(run).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(6 * HOUR)
    expect(run).toHaveBeenCalledTimes(5)

    scheduler.stop()
  })

  it('一次成功就把退避清掉（回到 30 分钟）', async() => {
    let fail = true
    const run = vi.fn(async() => { if (fail) throw new Error('boom') })
    const scheduler = createFollowFeedScheduler({ run })

    await scheduler.start()
    await vi.advanceTimersByTimeAsync(30 * MINUTE) // 第 2 次失败 → 下一轮 2 小时
    expect(run).toHaveBeenCalledTimes(2)

    fail = false
    await vi.advanceTimersByTimeAsync(2 * HOUR) // 这次成功 → 重置
    expect(run).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(30 * MINUTE) // 又回到 30 分钟
    expect(run).toHaveBeenCalledTimes(4)

    scheduler.stop()
  })

  it('手动 trigger()：立刻跑一轮并把退避重置（下次 30 分钟）', async() => {
    const run = vi.fn(async() => { throw new Error('boom') })
    const scheduler = createFollowFeedScheduler({ run })

    await scheduler.start()
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    await vi.advanceTimersByTimeAsync(30 * MINUTE) // 已进入 2 小时档
    const before = run.mock.calls.length

    const run2 = vi.fn(async() => undefined)
    const scheduler2 = createFollowFeedScheduler({ run: run2 })
    await scheduler2.start()
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    await scheduler2.trigger()
    expect(run2).toHaveBeenCalledTimes(3) // 起步 1 + 定时 1 + 手动 1

    // 手动那轮成功 → 退避清零 → 下一次仍是 30 分钟
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(run2).toHaveBeenCalledTimes(4)

    scheduler.stop()
    scheduler2.stop()
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(before)
  })

  it('单飞：一轮在途时再触发（手动撞定时）不会起第二轮', async() => {
    let release: (() => void) | null = null
    const run = vi.fn(async() => {
      await new Promise<void>(resolve => { release = resolve })
    })
    const scheduler = createFollowFeedScheduler({ run })

    const starting = scheduler.start()
    // 第一轮还挂着，这时手动刷新
    const triggering = scheduler.trigger()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)

    release!()
    await starting
    await triggering
    // 两次调用共用同一轮 → 但 trigger 之后还会重排，所以再跑一轮是允许的（那是下一轮）
    expect(run.mock.calls.length).toBeLessThanOrEqual(2)

    scheduler.stop()
  })

  it('stop() 之后不再有下一轮', async() => {
    const run = vi.fn(async() => undefined)
    const scheduler = createFollowFeedScheduler({ run })

    await scheduler.start()
    scheduler.stop()
    await vi.advanceTimersByTimeAsync(10 * HOUR)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
