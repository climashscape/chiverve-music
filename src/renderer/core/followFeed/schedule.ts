/**
 * 关注动态的**检查节奏**（票 06）：启动后跑一次，之后按间隔轮转；连续失败自动降频。
 *
 * 为什么在渲染侧而不是主进程：`tx` 数据层只存在于渲染进程，而「两套请求层不可混用」是硬约束
 * （`musicSdk/**` 用 needle、主进程用 undici）。所以**应用没开就收不到任何提醒**，
 * 窗口隐藏 / 托盘常驻时渲染进程仍在、检查继续——这就是「应用内提醒」的边界。
 */

/** 正常间隔：30 分钟（用户拍板） */
export const FOLLOW_FEED_INTERVAL_MS = 30 * 60 * 1000
const BACKOFF_FAIL_2_MS = 2 * 60 * 60 * 1000
const BACKOFF_FAIL_3_MS = 6 * 60 * 60 * 1000

/**
 * 下一轮的间隔。
 *
 * 第 1 次失败**仍按 30 分钟**（偶发网络抖动不该马上降频）；连续 2 次 → 2 小时；≥3 次 → **6 小时封顶**。
 * 理由：连续失败往往是限流或凭证失效的征兆，按 30 分钟继续打只会拖长恢复时间
 * （已知坑：搜索模块被打爆后限流 25 分钟以上不恢复）。
 */
export const nextDelay = (failCount: number): number => {
  if (failCount <= 1) return FOLLOW_FEED_INTERVAL_MS
  if (failCount == 2) return BACKOFF_FAIL_2_MS
  return BACKOFF_FAIL_3_MS
}

export interface SchedulerDeps {
  /** 跑一轮；**抛错 = 失败**（据此降频）。「跳过」（如未登录）应当 resolve */
  run: () => Promise<unknown>
  onError?: (err: unknown, failCount: number) => void
}

export interface FollowFeedScheduler {
  /** 启动：立刻跑一轮，然后按间隔排下一次 */
  start: () => Promise<void>
  /** 手动刷新：立刻跑一轮、**重置退避**，并重排下一次（于是下一次回到 30 分钟） */
  trigger: () => Promise<void>
  stop: () => void
}

export const createFollowFeedScheduler = (deps: SchedulerDeps): FollowFeedScheduler => {
  let failCount = 0
  let stopped = false
  /** 在途的那一轮（单飞：定时器与手动刷新撞上时不会再起第二轮） */
  let inFlight: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const runOnce = async() => {
    if (inFlight) return inFlight
    inFlight = (async() => {
      try {
        await deps.run()
        failCount = 0
      } catch (err) {
        failCount += 1
        console.log('[followFeed] 一轮检查失败', err)
        deps.onError?.(err, failCount)
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  const scheduleNext = () => {
    if (stopped) return
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => {
      void runOnce().then(scheduleNext)
    }, nextDelay(failCount))
  }

  return {
    async start() {
      await runOnce()
      scheduleNext()
    },
    async trigger() {
      // 先重置再跑：手动刷新失败时记作「第 1 次失败」→ 下一轮仍按 30 分钟
      failCount = 0
      await runOnce()
      scheduleNext()
    },
    stop() {
      stopped = true
      if (timer != null) clearTimeout(timer)
      timer = null
    },
  }
}
