import { computed, onMounted, reactive, watch } from '@common/utils/vueTools'
import { getQQCredential } from '@renderer/utils/ipc'
import { markSeen, openFollowFeed, refreshFollowFeed } from '@renderer/store/followFeed/action'
import { followFeedState } from '@renderer/store/followFeed/state'
import { status } from '@renderer/store/qqAuth/state'

/**
 * 「关注动态」页的取数（`views/Follow/index.vue` 只是薄壳，状态都从这里出）。
 *
 * 三件事：
 *   1. **进页面**：`openFollowFeed()` 读库 + 记下 `freshIds` + 把未读全部置已读（角标清零）；
 *   2. **登录态**：问凭证，而不是读 QQ 账号 store 的 `status.isLogin`——那个状态只在「设置」页
 *      初始化过（同 `MusicComment/index.vue` 的 `refreshAuth` 注释），直接读它会把已登录的用户
 *      画成未登录；
 *   3. **登录成功后就地切到时间线**：照 Favorites 各面板的 `watch(() => status.isLogin)`，
 *      不补这一下，用户登完还停在引导上，得切走再切回来。
 *
 * **不含检测**：一轮检查怎么跑在 `core/followFeed/`（另一张票接线；本票只做按钮与 loading 态）。
 */

export interface FollowFeedPageState {
  /** 登录态；`null` = 还没问出来（先画加载态，别闪一下登录引导） */
  isLogin: boolean | null
  /** 首次读库还没回来（只决定空态与时间线画哪个，不影响状态行） */
  isLoading: boolean
}

export const useFollowFeed = () => {
  const state = reactive<FollowFeedPageState>({
    isLogin: null,
    isLoading: true,
  })

  /** 有凭证 = 已登录（判据与数据层写接口一致，见 `tx/comment.js` 的 requireLoginCredential） */
  const hasCredential = async(): Promise<boolean> => {
    try {
      return (await getQQCredential()) != null
    } catch (err) {
      // 取不到凭证就当未登录：页面给引导，不弹错（评论那套同款口径）
      console.log('[followFeed] credential', err)
      return false
    }
  }

  const load = async(): Promise<void> => {
    state.isLogin = await hasCredential()
    try {
      await openFollowFeed()
    } catch (err) {
      // 读库失败不抛（弱依赖）：页面落空态，状态行仍显示上一次的结果
      console.log('[followFeed] load', err)
    } finally {
      state.isLoading = false
    }
  }

  onMounted(() => {
    void load()
  })

  // 登录流程里 `status.isLogin` 会被置 true（`store/qqAuth/action` 的 poll 收到 DONE 时）
  watch(() => status.isLogin, (isLogin) => {
    if (isLogin && state.isLogin !== true) void load()
  })

  /**
   * 页面开着时新条目到达 → 立刻标已读。
   *
   * 一轮检查（30 分钟一轮，或用户刚点了刷新）可能正插进新条目：用户就在这一页上看着，
   * 角标还挂数字是错的，而且这些条目该算进「本次新增」的标记里。
   *
   * ⚠️ `markSeen` 跑完会把 `unreadCount` 置 0 → 这个 watch 会再收到一次 0，
   * **必须判 `> 0`**，否则就是自激循环（0 → 调 markSeen → 还是 0 → 再调…）。
   */
  watch(() => followFeedState.unreadCount, (count) => {
    // 首次读库那一下由 `openFollowFeed` 自己负责置已读——那时 `isLoading` 还是 true，
    // 这里不插一脚，免得同一次进页面把库写两遍
    if (state.isLoading) return
    if (count > 0) void markSeen()
  })

  /**
   * 手动刷新（顶部按钮）：跑一轮检查并**重置退避**——用户修好了网络就不该再等 6 小时。
   * 检测本身全在 `store/followFeed/action` + `core/followFeed/`，**这里不写任何检测逻辑**。
   *
   * 失败不在这里处理：`performFollowFeedCheck` 已经把它落进 `lastError`（页面顶部显示那行），
   * 这里只把 promise 的拒绝吞掉，别变成 unhandledrejection。
   */
  const refresh = (): void => {
    void refreshFollowFeed().catch((err) => {
      console.log('[followFeed] refresh', err)
    })
  }

  return {
    state,
    items: computed(() => followFeedState.items),
    freshIds: computed(() => followFeedState.freshIds),
    monitoredCount: computed(() => followFeedState.monitoredCount),
    lastSuccessAt: computed(() => followFeedState.lastSuccessAt),
    // 页面只关心「有没有失败、原因是什么」，不关心失败时刻（那个留给日志与后续票）
    errorReason: computed(() => followFeedState.lastError?.reason ?? ''),
    isChecking: computed(() => followFeedState.isChecking),
    refresh,
  }
}
