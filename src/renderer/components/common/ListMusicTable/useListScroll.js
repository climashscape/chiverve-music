import { onMounted, onBeforeUnmount, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { setListPosition, getListPosition } from '@renderer/utils/data'
import { appSetting } from '@renderer/store/setting'

/**
 * 列表的滚动位置与「定位到某一行」（深链在两处消费）：
 * - `scrollIndex`：要定位到的行号（点播放栏进度区带来的深链）；
 * - `center`：这一行要**摆到列表中间**——播放栏「定位到正在播放」（工单 08）带的标记。
 *   不带的按老口径（顶部留 150px 上边距），老深链的行为不变。
 */
export default ({ props, listRef, list, handleRestoreScroll, scrollToIndexCentered }) => {
  const route = useRoute()
  const router = useRouter()

  const saveListPosition = () => {
    // 列表被 v-show 藏起来时（「我的收藏」页切到 QQ 我喜欢那一栏）量不到真实滚动位置，
    // 此时读到的 0 会把已存的位置覆盖掉——所以隐藏状态下干脆不写
    const el = listRef.value?.$el
    if (el && el.offsetParent == null) return
    setListPosition(props.listId, listRef.value?.getScrollTop() || 0)
  }

  /** 读 URL 上的深链参数；没有就返回 null */
  const readDeepLink = () => {
    const index = route.query.scrollIndex
    if (index == null) return null
    return {
      index: Number(index),
      // 只要带了这个键就是居中口径（值本身不参与判断，写 1 / true 都一样）
      center: route.query.center != null,
    }
  }

  /** 消费掉深链参数（保留其它 query：宿主页可能带 tab / list 等参数） */
  const clearDeepLink = () => {
    // 路径用当前路由，不写死——这个组件现在被「我的收藏」与「我的歌单」两个页面共用。
    router.replace({
      path: route.path,
      query: {
        ...route.query,
        scrollIndex: undefined,
        center: undefined,
        updated: true,
      },
    })
  }

  const handleScrollList = (index, isAnimation, callback = () => {}, center = false) => {
    if (center) {
      // 居中口径在 `usePlayingRowLocate`（容器几何当场量，末尾居中不了就滚到底）
      scrollToIndexCentered(index, isAnimation)
      callback()
      return
    }
    listRef.value?.scrollToIndex(index, -150, isAnimation, callback)
  }

  const restoreScroll = async(index, isAnimation, center = false) => {
    // console.log(index, isAnimation)
    if (!list.value.length) return
    if (index == null) {
      let location = await getListPosition(props.listId) || 0
      if (appSetting['list.isSaveScrollLocation'] && location != null) {
        listRef.value?.scrollTo(location)
      }
      return
    }

    handleScrollList(index, isAnimation, () => {}, center)
  }

  /**
   * 消费一次深链。数据还没到时不做滚动——`handleRestoreScroll` 把参数交给上层记着，
   * 列表加载完的 `onLoadedList` 会再跑一次 `restoreScroll`。
   */
  const consumeDeepLink = () => {
    const deepLink = readDeepLink()
    if (deepLink == null) return
    handleRestoreScroll(deepLink.index, false, deepLink.center)
    clearDeepLink()
  }

  onMounted(consumeDeepLink)
  // 页面内换列表（`/playlists?id=A` → `?id=B`）时组件不重建、onMounted 不会再跑，
  // 而播放栏的「定位到正在播放」在别的列表页上正是这条路（先跳 id 再定位）——所以这里也消费一次。
  // `route.query` 此刻已经是新 URL（query 驱动 `LocalListsPanel` 的选中项，watcher 收在它后面）
  watch(() => props.listId, consumeDeepLink)
  onBeforeUnmount(() => {
    saveListPosition()
  })

  return {
    saveListPosition,
    restoreScroll,
  }
}
