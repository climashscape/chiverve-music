import { onBeforeUnmount, ref, type Ref, useCssModule } from '@common/utils/vueTools'
import { updateUserListPosition } from '@renderer/store/list/action'
import { userLists } from '@renderer/store/list/state'
import useDarg from '@renderer/utils/compositions/useDrag'


export default ({ dom_lists_list, handleSaveListName, handleMenuClick }: {
  dom_lists_list: Ref<HTMLElement | null>
  handleSaveListName: () => Promise<void> | void
  handleMenuClick: () => void
}) => {
  const isModDown = ref(false)
  const styles = useCssModule()

  const { setDisabled } = useDarg({
    dom_list: dom_lists_list,
    dragingItemClassName: styles.dragingItem,
    // 上游这个过滤器用来让「试听列表 / 我的收藏」两条**前导 li** 不可拖
    // （8f57403:src/renderer/views/List/MyList/index.vue 里那两条 `class="default-list"`）；
    // 这两条已随 MyList 页从界面退场（工单 07 / ADR-0006），当前 ul 里已无元素带这个类——
    // 不匹配任何元素时 useDrag 的 onMove 恒返回 true，留着无害。判据：全仓 grep "default-list" 只此一处。
    filter: 'default-list',
    onUpdate(newIndex: number, oldIndex: number) {
      // Sortable 给的就是 ul 子节点下标，直接对应 userLists 下标，别再加偏移：
      // ul 里只有条件渲染的空态 li / 新建输入 li（都不在 userLists 里），没有任何前导项
      const list = userLists[oldIndex]
      // 抓起空态或新建输入那条 li 时没有对应的自建列表可移动，直接不处理（否则索引越界）
      if (!list) return
      void updateUserListPosition({ ids: [list.id], position: newIndex })
    },
  })

  const handle_key_mod_down = ({ event }: LX.KeyDownEevent) => {
    if (!isModDown.value) {
      // console.log(event)
      switch ((event!.target as HTMLElement).tagName) {
        case 'INPUT':
        case 'SELECT':
        case 'TEXTAREA':
          return
        default: if ((event!.target as HTMLElement).isContentEditable) return
      }

      isModDown.value = true
      setDisabled(false)
      void handleSaveListName()
    }
    handleMenuClick()
  }
  const handle_key_mod_up = () => {
    if (isModDown.value) {
      isModDown.value = false
      setDisabled(true)
    }
  }

  window.key_event.on('key_mod_down', handle_key_mod_down)
  window.key_event.on('key_mod_up', handle_key_mod_up)

  onBeforeUnmount(() => {
    window.key_event.off('key_mod_down', handle_key_mod_down)
    window.key_event.off('key_mod_up', handle_key_mod_up)
  })

  return {
    isModDown,
  }
}
