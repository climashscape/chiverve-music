import { describe, expect, it } from 'vitest'
import {
  FLING_VELOCITY,
  pushSample,
  resolveSwipeStep,
  sampleVelocity,
  SWIPE_THRESHOLD,
  VELOCITY_WINDOW,
} from './swipe'

/**
 * 工单 18 的「落点可预期」靠这组用例钉住：松手后**只能**是「不换 / 换一张」，
 * 且位移与甩动的优先级是确定的。手感本身（动画快慢）不在这里验，要真机。
 */
describe('views/Radar/swipe', () => {
  describe('pushSample', () => {
    it('丢掉窗口外的旧采样，只留最近一段', () => {
      let samples = pushSample([], 0, 1000)
      samples = pushSample(samples, 10, 1050)
      samples = pushSample(samples, 20, 1080)
      expect(samples).toHaveLength(3)

      // 1120 时刻，窗口 120ms → 1000 那个点（差了 120ms 以上）该被丢掉
      samples = pushSample(samples, 30, 1121)
      expect(samples.map(sample => sample.x)).toEqual([10, 20, 30])
    })

    it('窗口边界上的采样保留（<=）', () => {
      const samples = pushSample([{ x: 0, t: 1000 }], 5, 1000 + VELOCITY_WINDOW)
      expect(samples).toHaveLength(2)
    })
  })

  describe('sampleVelocity', () => {
    it('样本不足两个 → 0（还没动起来）', () => {
      expect(sampleVelocity([], 1000)).toBe(0)
      expect(sampleVelocity([{ x: 0, t: 1000 }], 1000)).toBe(0)
    })

    it('向右为正、向左为负，单位 px/ms', () => {
      expect(sampleVelocity([{ x: 0, t: 1000 }, { x: 40, t: 1100 }], 1100)).toBeCloseTo(0.4)
      expect(sampleVelocity([{ x: 40, t: 1000 }, { x: 0, t: 1100 }], 1100)).toBeCloseTo(-0.4)
    })

    it('时间没走 → 0（不给除零）', () => {
      expect(sampleVelocity([{ x: 0, t: 1000 }, { x: 50, t: 1000 }], 1000)).toBe(0)
    })

    it('按「现在」裁窗口：停手后再松手，旧点不算数', () => {
      const samples = [{ x: 0, t: 1000 }, { x: -20, t: 1020 }]
      // 松手时已经过去 500ms，两个点都在窗口外 → 窗口内 0 个样本 → 0
      expect(sampleVelocity(samples, 1520)).toBe(0)
      // 松手发生在窗口内时，照旧算得出来（不能把正常甩动一起裁掉）
      expect(sampleVelocity(samples, 1040)).toBeCloseTo(-1)
    })

    it('窗口里只剩一个点 → 0（速度不靠单点猜）', () => {
      expect(sampleVelocity([{ x: 0, t: 1000 }, { x: -20, t: 1020 }], 1139)).toBe(0)
    })
  })

  describe('resolveSwipeStep', () => {
    const free = { canPrev: true, canNext: true }

    it('位移过阈值就换一张，方向看位移', () => {
      expect(resolveSwipeStep({ dx: -SWIPE_THRESHOLD, velocity: 0, ...free })).toBe(1)
      expect(resolveSwipeStep({ dx: SWIPE_THRESHOLD, velocity: 0, ...free })).toBe(-1)
      // 刚不到阈值且没速度 → 不换
      expect(resolveSwipeStep({ dx: -(SWIPE_THRESHOLD - 1), velocity: 0, ...free })).toBe(0)
    })

    it('位移不够但甩得快 → 照样换一张（触屏轻甩）', () => {
      expect(resolveSwipeStep({ dx: -12, velocity: -FLING_VELOCITY, ...free })).toBe(1)
      expect(resolveSwipeStep({ dx: 12, velocity: FLING_VELOCITY, ...free })).toBe(-1)
      expect(resolveSwipeStep({ dx: -12, velocity: -(FLING_VELOCITY - 0.01), ...free })).toBe(0)
    })

    it('位移与速度打架时位移优先（有意拖过去的那一下说了算）', () => {
      // 往左拖过阈值后手指又回甩了一下（速度为右）——仍然换下一张
      expect(resolveSwipeStep({ dx: -80, velocity: 0.9, ...free })).toBe(1)
      expect(resolveSwipeStep({ dx: 80, velocity: -0.9, ...free })).toBe(-1)
    })

    it('到边界不越界（返回 0，交给回弹）', () => {
      expect(resolveSwipeStep({ dx: -200, velocity: -2, canPrev: true, canNext: false })).toBe(0)
      expect(resolveSwipeStep({ dx: 200, velocity: 2, canPrev: false, canNext: true })).toBe(0)
    })

    it('没动过的手势 → 不换', () => {
      expect(resolveSwipeStep({ dx: 0, velocity: 0, ...free })).toBe(0)
    })
  })

  describe('回归：拖一段后停手再松手（评审点出来的误判）', () => {
    // 采样只在指针移动时产生：停手后窗口不会自己往前滚，所以判速度前必须按「松手时刻」再裁一次
    const dragThenPause = () => {
      let samples = pushSample([], 100, 0)
      samples = pushSample(samples, 80, 20)
      return samples
    }

    it('快拖 20px（不到阈值）后按住不动 500ms 再松 → 不换选', () => {
      const velocity = sampleVelocity(dragThenPause(), 520)
      expect(velocity).toBe(0)
      expect(resolveSwipeStep({ dx: -20, velocity, canPrev: true, canNext: true })).toBe(0)
    })

    it('同一串采样，松手紧跟甩动 → 照样换一张（别把该甩的一起修掉）', () => {
      const velocity = sampleVelocity(dragThenPause(), 25)
      expect(velocity).toBeCloseTo(-1)
      expect(resolveSwipeStep({ dx: -20, velocity, canPrev: true, canNext: true })).toBe(1)
    })
  })
})
