/**
 * 发现页「推荐」Tab 的**卡片分组**：把服务端楼层（shelf）整理成一行行渲染用的卡片组。
 *
 * 为什么需要这一层（用户 2026-09-24 报「推荐tab页 排版有问题 成一竖列了」的根因，实测见票 20）：
 * QQ 首页 feed 的楼层有两种形态——**有标题的**（「为你打造」「最近常听」）和**没有标题的单卡槽**
 * （实测 id=203，一屏连着来 6 个、每个楼层只有 1 张卡）。渲染是「一个楼层一个 `ul.cards`」，
 * 单卡槽各自成行时首页推荐就变成一竖列孤零零的小卡（920 窗下实测 6 行、每行 1 张）。
 * 所以**连续的无名楼层并进同一组**，它们的卡在同一个 `ul.cards` 里按 `flex-wrap` 排成一行
 * （同一份数据：并组后 6 行 1 张 → 1 行 6 张，首页推荐区高度 2202 → 1312px）。
 *
 * 一组 = 模板里的一个 `.shelf` 块。组名**只参与并组判定**：2026-09-24 起模板不再渲染任何
 * 楼层标题（用户：推荐 tab 的内容就是首页推荐，不必再写一遍），但并组粒度决定卡片怎么分行，
 * 别因为「标题不显示了」就改成把所有楼层并成一组。
 * 卡片是否参与渲染由调用方传的 `isClickable` 决定（FeedPanel 传它的 `toCardTarget`，
 *「只渲染有点击目标的卡片」是 2026-09-23 定的口径）——本模块不认识路由，是纯函数。
 * **整个楼层**的取舍只此一处：`DROPPED_SHELF_IDS`（用户点名的楼层，判据与依据见该常量）。
 */

/**
 * **整块丢弃**的服务端楼层（用户 2026-09-24 裁定：「为你打造」一并去掉；上一轮已去掉「猜你喜欢」
 * 与所有标题）。判据是**楼层 `id`**——它是 QQ 的**楼层类型**编号，不是实例 id，更不是标题文案：
 *
 *   （a）同一屏里实测 6 个楼层共用 `id=203`，翻第二屏（direction=1）拿到的新楼层**仍然全是 203**
 *        → 一个 id 代表一类楼层，不会随内容轮换而变；
 *   （b）两次**独立实拉**（2026-09-23 22:37 / 2026-09-24，脚本 `/tmp/daily30-probe/probe_feed.py`
 *        与 `/tmp/feed-id-check/probe_feed_ids.py`）里 `201` 都是同一个「为你打造」楼层，
 *        **卡片逐张相同**（每日30首 500/510、二次元 500/511、榜单 800/810+811）——同日 `202`
 *        仍是「最近常听」、`204` 仍是 type=-1 的占位；
 *   （c）**不要改成按 `name`/标题匹配**：`title_template` 是服务端文案，改名（含 `title_content`
 *        里的昵称模板，实测安卓档案的 301 就有）就会让过滤失效。
 *
 * 已知副作用（有意为之）：该楼层里的「每日30首」卡也不再出现；它另有入口——雷达页的
 * 「每日30首」Tab（票 04），功能没有缺口。服务端若换掉这个 id，过滤会静默失效（楼层回来），
 * 复验方法就是上面 (b) 的两份探针。
 */
const DROPPED_SHELF_IDS = new Set(['201'])

/** 卡片的最小形状（`useFeedTab.ts` 的 `FeedCard` 结构上就满足它）。 */
export interface FeedGroupCard {
  kind: string
  id: string
  name: string
}

/** 楼层的最小形状（`useFeedTab.ts` 的 `FeedShelf` 结构上就满足它）。 */
export interface FeedGroupShelf<C> {
  id: string
  name: string
  cards: C[]
}

export interface FeedGroup<C> {
  /** Vue 的 `:key`：楼层 id 在同一屏里会重复（实测 6 个 id=203），必须拼上原始下标才唯一。 */
  key: string
  /** `''` = 无名组。模板不渲染组标题，这个字段只用于并组判定（见文件头）。 */
  name: string
  cards: C[]
}

/** 楼层 → 卡片组：丢整块丢弃的楼层、过滤无目标的卡、丢空楼层、把连续的无名楼层并成一组。 */
export const groupShelves = <C extends FeedGroupCard>(
  shelves: Array<FeedGroupShelf<C>>,
  isClickable: (card: C) => boolean,
): Array<FeedGroup<C>> => {
  const groups: Array<FeedGroup<C>> = []
  shelves.forEach((shelf, index) => {
    // 整块丢弃的楼层在**并组之前**就退出：它夹在两段无名单卡之间时不该把两段切开；
    // 用原始 index 组 key，其余楼层的 key 不因过滤而位移（比较两次渲染结果时更省事）
    if (DROPPED_SHELF_IDS.has(shelf.id)) return
    const cards = shelf.cards.filter(isClickable)
    // 过滤后没卡片的楼层整层丢掉（服务端会把占位/下架楼层也塞进来，如 type=-1 的「更多为你推荐」）
    if (!cards.length) return
    const last = groups[groups.length - 1]
    // 只有「本层无名 + 上一组也无名」才并组：有名楼层各自成组，标题与它的卡片行绑在一起
    if (shelf.name === '' && last != null && last.name === '') {
      last.cards.push(...cards)
      return
    }
    groups.push({ key: `${shelf.id}__${index}`, name: shelf.name, cards })
  })
  return groups
}
