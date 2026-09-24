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
 * 一组 = 模板里的一个 `.shelf` 块：有名字渲染 `.shelfTitle`，没有就不渲染（无名组照样出卡片）。
 * 卡片是否参与渲染由调用方传的 `isClickable` 决定（FeedPanel 传它的 `toCardTarget`，
 *「只渲染有点击目标的卡片」是 2026-09-23 定的口径）——本模块不认识路由，是纯函数。
 */

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
  /** `''` = 无名组（模板据此决定渲染不渲染组标题）。 */
  name: string
  cards: C[]
}

/** 楼层 → 卡片组：过滤无目标的卡、丢空楼层、把连续的无名楼层并成一组。 */
export const groupShelves = <C extends FeedGroupCard>(
  shelves: Array<FeedGroupShelf<C>>,
  isClickable: (card: C) => boolean,
): Array<FeedGroup<C>> => {
  const groups: Array<FeedGroup<C>> = []
  shelves.forEach((shelf, index) => {
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
