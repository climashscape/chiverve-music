import { describe, expect, it } from 'vitest'
import { MAX_CONSECUTIVE_UNAVAILABLE_SKIP, createUnavailableSkipGuard, unavailableSkipGuard } from './unavailableSkip'

/**
 * 「失效曲连播跳过」的上限（工单 01）。
 *
 * 跳过的动作本身在 `core/player/action.ts`（复用 `playNext`，随机 / 已播历史那几套逻辑不动），
 * 这里钉的是**上限行为**：整队列都失效时（老歌单大面积下架）不能一路跳到底——
 * 每次跳过都要发一轮 tx 取流，探针实测批量取流会被服务端限流（`code=104009`）；
 * 而「播到一首能播的就归零」保证正常队列不受影响。
 */

describe('连续跳过的计数上限', () => {
  it('前 N 首可以跳，第 N+1 首起不再跳', () => {
    const guard = createUnavailableSkipGuard(3)
    expect([guard.take(), guard.take(), guard.take(), guard.take(), guard.take()])
      .toEqual([true, true, true, false, false])
  })

  it('reset 之后重新开始计数（有歌真取到流 / 用户手动起播）', () => {
    const guard = createUnavailableSkipGuard(2)
    expect(guard.take()).toBe(true)
    expect(guard.take()).toBe(true)
    expect(guard.take()).toBe(false)
    guard.reset()
    expect(guard.take()).toBe(true)
  })

  it('上限 1 时只能跳一首（边界不外推）', () => {
    const guard = createUnavailableSkipGuard(1)
    expect(guard.take()).toBe(true)
    expect(guard.take()).toBe(false)
  })

  it('播放链路共用的那份用的是导出的上限常量', () => {
    unavailableSkipGuard.reset()
    for (let i = 0; i < MAX_CONSECUTIVE_UNAVAILABLE_SKIP; i++) expect(unavailableSkipGuard.take()).toBe(true)
    expect(unavailableSkipGuard.take()).toBe(false)
    unavailableSkipGuard.reset()
    expect(unavailableSkipGuard.take()).toBe(true)
    unavailableSkipGuard.reset()
  })
})
