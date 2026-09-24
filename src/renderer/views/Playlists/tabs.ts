/**
 * 我的歌单两个 tab 的 id / 顺序，以及「从 query 推断 tab」的规则（工单 09；默认 tab 改云端见工单 07）。
 *
 * 抽成独立模块只为一件事：URL 兼容规则能被单测直接跑（同 views/Radar/swipe.ts 的做法），
 * 不必挂载组件、不必造 router。
 */

/**
 * Tab 顺序与 id：与 i18n 的 `playlists__tab_*` 一一对应。
 * **第一个就是默认 tab**（`normalizeTab` / `tabFromQuery` 都兜到它）——本仓是 QQ 音乐客户端，
 * 进页面先看 QQ 云端歌单，本地自建列表退第二位（2026-09-24 用户定；之前默认本地）。
 * 页面壳 `index.vue` 的 tab 栏顺序也按这个数组来。
 */
export const TABS = ['cloud', 'local'] as const
export type TabId = typeof TABS[number]

/** `tab` 参数不认识（手改地址栏、别的版本分享来的链接）时落第一个 tab（= 默认 tab）。 */
export const normalizeTab = (tab: unknown): TabId => TABS.includes(tab as TabId) ? tab as TabId : TABS[0]

/**
 * 老链接兼容（工单 09 的验收项）：`?id=…`（选中的本地列表）视作 local，
 * `?cloud=…`（选中的云端 dirId）视作 cloud。
 * 有 `tab` 键时以它为准——它是本页自己的参数，优先级高于推断。
 *
 * 两个推断键都缺时落 `TABS[0]`，也就是**默认云端 tab**：老地址 `/playlists`（工单 09 前
 * 也是「本地 + 云端一堆」的同名页）现在落到 QQ 音乐·歌单。两个键同时出现（手改地址栏）
 * 时云端优先——与默认 tab 同向，也保留了改默认之前的旧判别顺序，不算回归。
 */
export const tabFromQuery = (query: Record<string, unknown>): TabId => {
  if (TABS.includes(query.tab as TabId)) return query.tab as TabId
  if (query.cloud) return 'cloud'
  return query.id ? 'local' : TABS[0]
}
