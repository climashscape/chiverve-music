import { ref, watch, computed, onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo, playInfo } from '@renderer/store/player/state'
import { getListMusics } from '@renderer/store/list/action'
import { appSetting } from '@renderer/store/setting'
import { findPlayingRowIndex } from '@renderer/utils/playingRowLocate'


export default ({ props, onLoadedList }) => {
  const rightClickSelectedIndex = ref(-1)
  const selectedIndex = ref(-1)
  const dom_listContent = ref(null)
  const listRef = ref(null)

  const excludeListIds = computed(() => ([props.listId]))


  const list = ref([])
  watch(() => props.listId, id => {
    getListMusics(id).then(l => {
      list.value = [...l]
      if (id != props.listId) return
      onLoadedList()
    })
  }, {
    immediate: true,
  })

  const playerInfo = computed(() => ({
    isPlayList: playMusicInfo.listId == props.listId,
    playIndex: playInfo.playIndex,
  }))

  /**
   * 正在播放那首歌在本列表里的行号（不在本列表里是 -1）。
   * 行内高亮与播放栏的「定位到正在播放」都认它，判定只有一处（见 `utils/playingRowLocate.ts`）。
   */
  const playingRowIndex = computed(() => findPlayingRowIndex({
    list: list.value,
    isPlayingList: playerInfo.value.isPlayList,
    playIndex: playerInfo.value.playIndex,
    playingMusicId: playMusicInfo.musicInfo?.id,
  }))

  const setSelectedIndex = index => {
    selectedIndex.value = index
  }

  const isShowSource = computed(() => appSetting['list.isShowSource'])

  const handleMyListUpdate = (ids) => {
    if (!ids.includes(props.listId)) return
    getListMusics(props.listId).then(l => {
      list.value = [...l]
    })
  }

  window.app_event.on('myListUpdate', handleMyListUpdate)

  onBeforeUnmount(() => {
    window.app_event.off('myListUpdate', handleMyListUpdate)
  })

  return {
    rightClickSelectedIndex,
    selectedIndex,
    dom_listContent,
    listRef,
    list,
    playerInfo,
    playingRowIndex,
    setSelectedIndex,
    isShowSource,
    excludeListIds,
  }
}
