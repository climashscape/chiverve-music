import { mainHandle } from '@common/mainIpc'
import { FOLLOW_FEED_EVENT_NAME } from '@common/ipcNames'

/**
 * 关注动态的 IPC 适配（票 02）：只做通道到 dbService 的搬运，不含任何检测逻辑。
 *
 * 通道返回的都是**本地库里的数据**（不含凭证），所以不需要来源窗口校验
 * （那条硬约束针对「返回凭证的通道」，见 AGENTS.md §5.2）。
 */
export default () => {
  mainHandle<LX.FollowFeed.Baseline[]>(FOLLOW_FEED_EVENT_NAME.get_baseline, async() => {
    return global.lx.worker.dbService.followFeedBaselineAll()
  })
  mainHandle<LX.FollowFeed.BaselineInput[]>(FOLLOW_FEED_EVENT_NAME.save_baseline, async({ params: rows }) => {
    await global.lx.worker.dbService.followFeedBaselineSave(rows)
  })
  mainHandle<LX.FollowFeed.Item[]>(FOLLOW_FEED_EVENT_NAME.get_items, async() => {
    return global.lx.worker.dbService.followFeedItemsGet()
  })
  mainHandle<LX.FollowFeed.ItemInput[]>(FOLLOW_FEED_EVENT_NAME.add_items, async({ params: items }) => {
    await global.lx.worker.dbService.followFeedItemsAdd(items)
  })
  mainHandle<number>(FOLLOW_FEED_EVENT_NAME.get_unread_count, async() => {
    return global.lx.worker.dbService.followFeedUnreadCount()
  })
  mainHandle<LX.FollowFeed.Summary>(FOLLOW_FEED_EVENT_NAME.get_summary, async() => {
    return global.lx.worker.dbService.followFeedSummary()
  })
  mainHandle(FOLLOW_FEED_EVENT_NAME.mark_all_read, async() => {
    await global.lx.worker.dbService.followFeedMarkAllRead()
  })
}
