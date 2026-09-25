import { addTempPlayList } from '@renderer/store/player/action'
import { playList } from '@renderer/core/player'
import { hintUnavailableMusic, isUnavailableMusic } from '@renderer/core/music/unavailable'

export default ({ props, selectedList, list, removeAllSelect }) => {
  let clickTime = 0
  let clickIndex = -1

  /**
   * 失效曲（无版权 / 已下架）点不动（工单 01）：拦在播放入口——行双击、行内播放键、
   * 右键菜单的「播放」三处都走这个函数，给一句短提示而不是静默。
   * 判定与登记都在 core（`core/music/unavailable.ts`），这里只负责拦。
   */
  const handlePlayMusic = (index) => {
    if (isUnavailableMusic(list.value[index])) {
      hintUnavailableMusic()
      return
    }
    playList(props.listId, index)
  }

  const handlePlayMusicLater = (index, single) => {
    if (selectedList.value.length && !single) {
      addTempPlayList(selectedList.value.map(s => ({ listId: props.listId, musicInfo: s })))
      removeAllSelect()
    } else {
      addTempPlayList([{ listId: props.listId, musicInfo: list.value[index] }])
    }
  }

  const doubleClickPlay = index => {
    if (
      window.performance.now() - clickTime > 400 ||
      clickIndex !== index
    ) {
      clickTime = window.performance.now()
      clickIndex = index
      return
    }
    handlePlayMusic(index, true)
    clickTime = 0
    clickIndex = -1
  }

  return {
    handlePlayMusic,
    handlePlayMusicLater,
    doubleClickPlay,
  }
}
