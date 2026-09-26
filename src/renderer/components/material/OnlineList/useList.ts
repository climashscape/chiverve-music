import { computed, watch, ref, onBeforeUnmount, type Ref } from '@common/utils/vueTools'
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import { getFontSizeWithScreen } from '@renderer/utils'

const useKeyEvent = ({ handleSelectAllData, listRef }: {
  handleSelectAllData: () => void
  listRef: Ref<any>
}) => {
  const keyEvent = {
    isShiftDown: false,
    isModDown: false,
  }

  const handle_key_shift_down = () => {
    keyEvent.isShiftDown ||= true
  }
  const handle_key_shift_up = () => {
    keyEvent.isShiftDown &&= false
  }
  const handle_key_mod_down = () => {
    keyEvent.isModDown ||= true
  }
  const handle_key_mod_up = () => {
    keyEvent.isModDown &&= false
  }
  const handle_key_mod_a_down = ({ event }: LX.KeyDownEevent) => {
    if (!event || (event.target as HTMLElement).tagName == 'INPUT' || document.activeElement != listRef.value?.$el) return
    event.preventDefault()
    if (event.repeat) return
    keyEvent.isModDown = false
    handleSelectAllData()
  }

  onBeforeUnmount(() => {
    window.key_event.off('key_shift_down', handle_key_shift_down)
    window.key_event.off('key_shift_up', handle_key_shift_up)
    window.key_event.off('key_mod_down', handle_key_mod_down)
    window.key_event.off('key_mod_up', handle_key_mod_up)
    window.key_event.off('key_mod+a_down', handle_key_mod_a_down)
  })
  window.key_event.on('key_shift_down', handle_key_shift_down)
  window.key_event.on('key_shift_up', handle_key_shift_up)
  window.key_event.on('key_mod_down', handle_key_mod_down)
  window.key_event.on('key_mod_up', handle_key_mod_up)
  window.key_event.on('key_mod+a_down', handle_key_mod_a_down)

  return keyEvent
}


export default ({ props, listRef }: {
  props: {
    list: LX.Music.MusicInfoOnline[]
  }
  listRef: Ref<any>
}) => {
  const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
  let lastSelectIndex = -1
  const listItemHeight = computed(() => {
    return Math.ceil((isFullscreen.value ? getFontSizeWithScreen() : appSetting['common.fontSize']) * 2.3)
  })

  const removeAllSelect = () => {
    selectedList.value = []
  }
  const handleSelectAllData = () => {
    removeAllSelect()
    selectedList.value = [...props.list]
  }
  const keyEvent = useKeyEvent({ handleSelectAllData, listRef })

  const handleSelectData = (clickIndex: number) => {
    if (keyEvent.isShiftDown) {
      if (selectedList.value.length) {
        removeAllSelect()
        if (lastSelectIndex != clickIndex) {
          let isNeedReverse = false
          let _lastSelectIndex = lastSelectIndex
          if (clickIndex < _lastSelectIndex) {
            let temp = _lastSelectIndex
            _lastSelectIndex = clickIndex
            clickIndex = temp
            isNeedReverse = true
          }
          selectedList.value = props.list.slice(_lastSelectIndex, clickIndex + 1)
          if (isNeedReverse) selectedList.value.reverse()
        }
      } else {
        selectedList.value.push(props.list[clickIndex])
        lastSelectIndex = clickIndex
      }
    } else if (keyEvent.isModDown) {
      lastSelectIndex = clickIndex
      let item = props.list[clickIndex]
      let index = selectedList.value.indexOf(item)
      if (index < 0) {
        selectedList.value.push(item)
      } else {
        selectedList.value.splice(index, 1)
      }
    } else if (selectedList.value.length) {
      removeAllSelect()
    }
  }

  // 列表内容一变就丢掉整个多选集合：只盯引用会被「原地改」绕过——本仓在线列表的写回是
  // `splice(0, len, ...list)`（`store/user/action.ts`），引用乃至长度都可能不变，而旧的选中项已经
  // 不在屏上；继续留着，「加入歌单 / 批量下载」就会作用到不显示的歌（2026-09-26 复核的缺陷 3）。
  // 探针逐项读一遍（长度 + 每一项），触发条件因此是「某个下标被写成了**另一个对象**，或长度变了」
  // （Vue 的 set 对同一引用不触发）——「换引用但对象还是那些」的写回不会白清一次用户的选择。
  watch(() => [props.list, props.list.length, props.list.map(item => item)], removeAllSelect)

  return {
    selectedList,
    listItemHeight,
    removeAllSelect,
    handleSelectData,
  }
}
