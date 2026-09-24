// import { useCommit } from '@common/utils/vueTools'
import { addTempPlayList } from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'
import { type Ref } from '@common/utils/vueTools'
import { playMusicList } from '@renderer/core/player'
import { LIST_IDS } from '@common/constants'

/**
 * 播放队列的标识：有真实列表 id 的宿主页（专辑 / 歌单 / 榜单 / 云端歌单）用它的 id；
 * 搜索结果、雷达、发现区块、收藏页的「QQ 我喜欢」这些**没有真实 id 的列表**共用这个稳定常量。
 *
 * ⚠️ 共用常量意味着「队列身份相等」不等于「内容相等」（这些列表各自的内容不同）：
 * 认「正在播放那一行」时不能只看身份，见 `@renderer/utils/playingRowLocate` 的 `findPlayingRowIndex`。
 */
export const getQueueId = (listId?: string) => (listId?.length ? listId : 'online_list__temp')

export default ({ selectedList, props, removeAllSelect, emit }: {
  selectedList: Ref<LX.Music.MusicInfoOnline[]>
  props: {
    list: LX.Music.MusicInfoOnline[]
    /** 播放队列的身份（宿主页的列表 id）；没有真实 id 的列表用默认值即可 */
    listId?: string
  }
  removeAllSelect: () => void
  emit: (event: 'show-menu' | 'play-list' | 'togglePage', ...args: any[]) => void
}) => {
  let clickTime = 0
  let clickIndex = -1

  /**
   * 播放队列的标识：`tempListMeta.id`，只用于「当前播的是哪个列表」。
   * 队列内容由 `playMusicList` 每次都灌一遍，标识不参与「同列表复用」的判断。
   */
  const queueId = () => getQueueId(props.listId)

  /**
   * 点一首歌 = 从这首开始，按**它所在的列表**连播（ui-polish 工单 06 的方案 B）。
   * 之前是「把这一首加进试听列表再播那一首」，于是「下一首」会跑到试听列表攒下的杂歌上。
   */
  const handlePlayMusic = async(index: number, single: boolean) => {
    if (selectedList.value.length && !single) {
      // 多选播放：选中的这几首就是队列（每次都是新队列，标识带上时间戳以免复用旧历史）
      await playMusicList(`${queueId()}__selected_${Date.now()}`, [...selectedList.value], 0)
      removeAllSelect()
      return
    }
    await playMusicList(queueId(), props.list, index)
  }

  const handlePlayMusicLater = (index: number, single: boolean) => {
    if (selectedList.value.length && !single) {
      addTempPlayList(selectedList.value.map(s => ({ listId: LIST_IDS.PLAY_LATER, musicInfo: s })))
      removeAllSelect()
    } else {
      addTempPlayList([{ listId: LIST_IDS.PLAY_LATER, musicInfo: props.list[index] }])
    }
  }

  const doubleClickPlay = (index: number) => {
    if (
      window.performance.now() - clickTime > 400 ||
      clickIndex !== index
    ) {
      clickTime = window.performance.now()
      clickIndex = index
      return
    }
    if (appSetting['list.isClickPlayList']) {
      emit('play-list', index)
    } else {
      void handlePlayMusic(index, true)
    }
    clickTime = 0
    clickIndex = -1
  }

  return {
    handlePlayMusic,
    handlePlayMusicLater,
    doubleClickPlay,
  }
}
