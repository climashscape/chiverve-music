import { reactive } from '@common/utils/vueTools'

/**
 * 最近一次失败（**内存态**：不落库）。
 *
 * 不落库的理由：重启后马上会再跑一轮，把上一次的失败原因读回来只会显示一个过期的错误；
 * 而「上次成功的时间」是**能**落库的（基线里的 `updatedAt`），所以它在页面重启后仍然真实。
 */
export interface FollowFeedError {
  at: number
  reason: string
}

/**
 * 关注动态的渲染侧状态。
 *
 * 两处来源，别混：
 * - **库里的**（条目 / 未读 / 监控数 / 上次成功时间）——由 `loadFollowFeed` 从 IPC 读回，重启仍在；
 * - **内存里的**（正在检查 / 最近一次失败）——不落库，重启即清。
 */
export const followFeedState = reactive({
  /** 时间线条目（发布时间倒序，由库的 ORDER BY 决定，页面不要重排） */
  items: [] as LX.FollowFeed.Item[],
  /** 未读条目数 = 左栏角标的数字（`> 99` 由角标自己封顶显示） */
  unreadCount: 0,
  /** 监控中的歌手数（= 基线行数） */
  monitoredCount: 0,
  /** 最近一次**成功**覆盖的时间戳；`null` = 从未成功过 */
  lastSuccessAt: null as number | null,
  /** 最近一次失败；`null` = 本次会话没失败过 */
  lastError: null as FollowFeedError | null,
  /** 是否有一轮正在跑（手动刷新按钮的 loading 与并发单飞都看它） */
  isChecking: false,
  /**
   * 「本次进入页面时还是未读」的条目 id（页内视觉标记用）。
   *
   * 进入页面会立刻把未读全部置为已读（角标清零），但**页内仍要能分辨哪几条是这次的新内容**，
   * 所以在置已读之前先把它们记下来。离开页面后这组 id 没有意义。
   */
  freshIds: [] as number[],
})
