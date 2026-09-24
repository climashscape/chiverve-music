import { onBeforeUnmount, onMounted, type Ref } from '@common/utils/vueTools'
import { getCenteredScrollTop, registerPlayingRowLocator } from '@renderer/utils/playingRowLocate'

/**
 * 「定位到正在播放」的挂载级行为（ui-polish-3 工单 08）：本地歌曲表（`ListMusicTable`）与在线歌曲表
 * （`OnlineList`）共用这一份。
 *
 * 它只管两件与 DOM 有关的事：把那一行滚到列表中间、把这份能力登记给播放栏的按钮。
 * 「哪一行在播」由调用方算好传进来——两张表的队列身份口径不同（本地表比 `props.listId`，
 * 在线表比 `queueId()` 算出来的队列身份），各自算更清楚，也各有单测。
 *
 * 为什么必须在**挂载后**才登记：`canLocate` 要读真实容器（可见性、高度），setup 阶段还什么都没有。
 *
 * 容器几何**当场量**、不写死像素：行高来自 `listItemHeight`（跟随字号设置，全屏时还会变），
 * 可见高与内容高来自列表自己的滚动容器——写死一套尺寸，改字号或改窗口就是滚偏。
 */
export default ({ listRef, listItemHeight, playingRowIndex }: {
  /** 列表组件实例（`VirtualizedList`），暴露 `scrollTo` 与自己的滚动容器 */
  listRef: Ref<any>
  /** 行高（随字号变化，见两张表的 `listItemHeight`） */
  listItemHeight: Ref<number>
  /** 正在播放那首歌在本列表里的行号；不在本列表里为 -1（算它的纯函数在 `playingRowLocate.ts`） */
  playingRowIndex: Ref<number>
}) => {
  /** 把第 `index` 行滚到列表中间（容器几何当场量，末尾附近居中不了就滚到底）。深链的居中口径也用它。 */
  const scrollToIndexCentered = (index: number, animate = true) => {
    const el = listRef.value?.$el
    if (!(index >= 0) || el == null) return
    listRef.value.scrollTo(getCenteredScrollTop({
      index,
      itemHeight: listItemHeight.value,
      containerHeight: el.clientHeight,
      contentHeight: el.scrollHeight,
    }), animate)
  }

  /** 把正在播放的那一行滚到列表中间 */
  const locatePlayingRow = (animate = true) => {
    scrollToIndexCentered(playingRowIndex.value, animate)
  }

  let unregister: (() => void) | null = null
  onMounted(() => {
    unregister = registerPlayingRowLocator({
      canLocate: () => {
        const el = listRef.value?.$el
        // `el?.offsetParent == null` 同时覆盖「没有容器」与「没有盒子（被 v-show 藏着）」：
        // 同一页里另一份列表正在显示时，这一份不该接答（同 `useListScroll.saveListPosition` 的判据）
        return playingRowIndex.value >= 0 && el?.offsetParent != null
      },
      locate: () => { locatePlayingRow() },
    })
  })
  onBeforeUnmount(() => {
    unregister?.()
    unregister = null
  })

  return {
    locatePlayingRow,
    scrollToIndexCentered,
  }
}
