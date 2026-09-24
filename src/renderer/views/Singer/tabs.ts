/**
 * 歌手页四个 tab 的 id / 顺序，以及两条纯规则（工单 02）：
 * `normalizeTab`（URL → tab，旧链接兼容）与 `shouldFetch`（本 tab 该不该打请求）。
 *
 * 抽成独立模块的理由与 `views/Playlists/tabs.ts` 相同：规则能被单测直接跑，
 * 不必挂载组件、不必造 router——懒加载的判定要在真机上反复切 tab 才验得出来，先把语义钉死在这里。
 */

/** Tab 顺序与 id：与 i18n 的 `singer__songs` / `singer__albums` / `singer__mvs` / `singer__similar` 一一对应。 */
export const TABS = ['songs', 'albums', 'mv', 'similar'] as const
export type TabId = typeof TABS[number]

/** 认不出的 `tab`（手改地址栏、别的版本分享来的链接）落第一个 tab——旧链接（无 `tab` 键）因此仍落歌曲。 */
export const normalizeTab = (tab: unknown): TabId => TABS.includes(tab as TabId) ? tab as TabId : TABS[0]

/** 懒加载判定要读的两个字段（`useSinger.ts` 的 `Block` 里同名，这里只描述形状，免得把整个取数模块拖进来）。 */
export interface FetchState {
  /** 本块当前**内容**属于哪个歌手：成功取数后才写；失败 / 换歌手前留空 */
  loadedMid: string
  /** 正在请求的歌手：在途去重用 */
  loadingMid: string
}

/**
 * 「这个 tab 现在该不该打请求」：
 * - `mid` 为空（路由没带 mid）→ 不发请求，页头自己落「歌手不存在」文案（数据层对空 mid 会抛错）；
 * - `loadedMid === mid` → 本块已有这个歌手的数据，切回来直接用缓存，**不重复拉**；
 * - `loadingMid === mid` → 同一歌手的请求还在路上，复用在途的那次（来回连点 tab 不该重复打）；
 * - 其余（换歌手 / 上次失败）→ 该拉。
 *
 * ⚠️ 在途判据用 `loadingMid` 而不是 `Block.isLoading`：`isLoading` 只管「加载更多」键的禁用态，
 * 它会被**上一个歌手的请求**的 finally 关掉（换歌手时旧请求仍在飞），拿它去重会漏。
 */
export const shouldFetch = (block: FetchState, mid: string) =>
  !!mid && block.loadedMid !== mid && block.loadingMid !== mid
