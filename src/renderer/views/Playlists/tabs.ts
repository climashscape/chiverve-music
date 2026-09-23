/**
 * 我的歌单两个 tab 的 id 与「从 query 推断 tab」的规则（工单 09）。
 *
 * 抽成独立模块只为一件事：URL 兼容规则能被单测直接跑（同 views/Radar/swipe.ts 的做法），
 * 不必挂载组件、不必造 router。
 */

/** Tab 顺序与 id：与 i18n 的 playlists__tab_* 一一对应。 */
export const TABS = ['local', 'cloud'] as const
export type TabId = typeof TABS[number]

/** `tab` 参数不认识（手改地址栏、别的版本分享来的链接）时落第一个 tab。 */
export const normalizeTab = (tab: unknown): TabId => TABS.includes(tab as TabId) ? tab as TabId : TABS[0]

/**
 * 老链接兼容（工单 09 的验收项）：`?id=…`（选中的本地列表）视作 local，
 * `?cloud=…`（选中的云端 dirId）视作 cloud，两者都缺时默认 local。
 * 有 `tab` 键时以它为准——它是本页自己的参数，优先级高于推断。
 */
export const tabFromQuery = (query: Record<string, unknown>): TabId => {
  if (TABS.includes(query.tab as TabId)) return query.tab as TabId
  return query.cloud ? 'cloud' : TABS[0]
}
