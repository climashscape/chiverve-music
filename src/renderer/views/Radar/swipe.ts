/**
 * 轮播的滑动判定（ui-polish 工单 18）。
 *
 * 抽成纯函数放在组件外，是因为工单的约束是「松手后的**落点可预期**」——触屏手感没法在
 * CI 里验，判定规则可以：组件只负责把指针事件喂进来、把算出来的结果作用到游标上。
 *
 * 符号约定与 `dragX` 一致：**向左为负**（`dx < 0` / `velocity < 0`）→ 换「下一张」。
 */

/** 位移过它就算「换一张」（鼠标拖动时代就有的阈值，触屏沿用）。 */
export const SWIPE_THRESHOLD = 60
/** 位移过它就算「拖过」，这次交互不再当点击处理。 */
export const DRAG_SLOP = 6
/**
 * 甩动速度过它（px/ms）也换一张：触屏上轻轻一甩的位移常常不到 60px，
 * 只按位移判会「甩不动」（用户 2026-09-24 报的触屏生硬感来源之一）。
 * 0.4px/ms = 400px/s：慢速有意的拖动一般在 200px/s 以下，轻甩在 400px/s 以上。
 */
export const FLING_VELOCITY = 0.4
/** 只取最近这段时间的采样算速度（毫秒）。配合 `sampleVelocity` 的 `now` 裁窗，手指停住再松手时
 * 速度能读成 0（= 不触发甩动）——**裁窗必须在「松手时刻」再做一次**，理由见 `sampleVelocity`。 */
export const VELOCITY_WINDOW = 120

export interface SwipeSample {
  /** 指针的 `clientX`。 */
  x: number
  /** 采样时刻（`performance.now()`）。 */
  t: number
}

/** 追加采样点，并丢掉窗口外的旧点。返回新数组——调用方直接替换，别原地改。 */
export const pushSample = (samples: SwipeSample[], x: number, t: number, windowMs: number = VELOCITY_WINDOW): SwipeSample[] => {
  const next = samples.filter(sample => t - sample.t <= windowMs)
  next.push({ x, t })
  return next
}

/**
 * 最近一段采样的平均速度（px/ms），向左为负；窗口内的样本不足 2 个返回 0。
 *
 * `now` 是**松手时刻**，必须传：采样只在指针移动时产生，手指停住后不会再有新采样，
 * 于是 `pushSample` 的窗口**不会自己往前滚**——停在窗口里的全是停手前的旧点。
 * 松手前先按 `now` 再裁一次，才能让「快速拖一段 → 按住不动 → 松手」读成速度 0（不换选），
 * 而不是拿几百毫秒前的旧点当甩动。
 */
export const sampleVelocity = (samples: SwipeSample[], now: number, windowMs: number = VELOCITY_WINDOW): number => {
  const recent = samples.filter(sample => now - sample.t <= windowMs)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return (last.x - first.x) / dt
}

/** 换选结果：`+1` 下一张、`-1` 上一张、`0` 不换（回弹原位）。 */
export type SwipeStep = -1 | 0 | 1

/**
 * 松手时换几张。**结果只能是 0 或 ±1，绝不会一次多张**（工单 18 的约束：
 * 别出现「滑三张停不下」）。
 *
 * 两条判据，**位移优先**：
 * 1. `|位移| >= SWIPE_THRESHOLD`：用户是有意拖过去的，方向以位移为准；
 * 2. 位移不够但 `|速度| >= FLING_VELOCITY`：用户是甩过去的（触屏的主力手势）。
 * 都不满足 = 不换选。
 *
 * 到边界（第一张再往前 / 最后一张再往后）返回 0：不换选，但组件照样会播一段回弹动画。
 */
export const resolveSwipeStep = (options: {
  dx: number
  velocity: number
  canPrev: boolean
  canNext: boolean
}): SwipeStep => {
  const { dx, velocity, canPrev, canNext } = options
  let direction = 0
  if (Math.abs(dx) >= SWIPE_THRESHOLD) direction = Math.sign(dx)
  else if (Math.abs(velocity) >= FLING_VELOCITY) direction = Math.sign(velocity)
  if (direction < 0) return canNext ? 1 : 0
  if (direction > 0) return canPrev ? -1 : 0
  return 0
}
