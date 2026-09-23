<template lang="pug">
transition(enter-active-class="animated slideInRight" leave-active-class="animated slideOutDown" @after-enter="handleAfterEnter" @after-leave="handleAfterLeave")
  div(v-if="isShowPlayerDetail" :class="[$style.container, { fullscreen: isFullscreen }]" @contextmenu="handleContextMenu")
    div(:class="$style.bg")
    //- div(:class="$style.bg" :style="bgStyle")
    //- div(:class="$style.bg2")
    ControlBtnsLeftHeader(v-if="appSetting['common.controlBtnPosition'] == 'left'")
    ControlBtnsRightHeader(v-else)
    div(:class="[$style.main, {[$style.showComment]: isShowPlayComment}]")
      div.left(:class="$style.left")
        //- div(:class="$style.info")
        div(:class="$style.info")
          img(v-if="musicInfo.pic" :class="$style.img" :src="musicInfo.pic")
          div.description(:class="['scroll', $style.description]")
            p {{ $t('player__music_name') }}{{ musicInfo.name }}
            p(
              :class="{ [$style.jumpable]: canJumpToSinger(playMusicInfo.musicInfo) }"
              :title="canJumpToSinger(playMusicInfo.musicInfo) ? $t('list__jump_singer') : ''"
              @click="handlePlayDetailSingerClick"
            ) {{ $t('player__music_singer') }}{{ musicInfo.singer }}
            p(
              v-if="musicInfo.album"
              :class="{ [$style.jumpable]: canJumpToAlbum(playMusicInfo.musicInfo) }"
              :title="canJumpToAlbum(playMusicInfo.musicInfo) ? $t('list__jump_album') : ''"
              @click="handlePlayDetailAlbumClick"
            ) {{ $t('player__music_album') }}{{ musicInfo.album }}
            //- 播放详情页 ↔ 歌曲详情页互跳（工单 02）：本地文件没有 mid，不出这个入口
            p(
              v-if="canShareMusic(playMusicInfo.musicInfo)"
              :class="$style.jumpLink"
              @click="handleOpenSongDetail"
            ) {{ $t('player__open_song_detail') }}

      transition(enter-active-class="animated fadeIn" leave-active-class="animated fadeOut")
        LyricPlayer(v-if="visibled")
      music-comment(v-if="visibled" :class="$style.comment" :show="isShowPlayComment" :music-info="playMusicInfo.musicInfo" @close="hideComment")
    transition(enter-active-class="animated fadeIn" leave-active-class="animated fadeOut")
      play-bar(v-if="visibled")
    transition(enter-active-class="animated-slow fadeIn" leave-active-class="animated-slow fadeOut")
      common-audio-visualizer(v-if="appSetting['player.audioVisualization'] && visibled")
</template>


<script>
import { ref, watch } from '@common/utils/vueTools'
import { isFullscreen } from '@renderer/store'
import {
  isShowPlayerDetail,
  isShowPlayComment,
  musicInfo,
  playMusicInfo,
} from '@renderer/store/player/state'
import {
  setShowPlayerDetail,
  setShowPlayComment,
  setShowPlayLrcSelectContentLrc,
} from '@renderer/store/player/action'
import LyricPlayer from './LyricPlayer.vue'
import PlayBar from './PlayBar.vue'
import MusicComment from './components/MusicComment/index.vue'
import ControlBtnsLeftHeader from './ControlBtnsLeftHeader.vue'
import ControlBtnsRightHeader from './ControlBtnsRightHeader.vue'
import { registerAutoHideMounse, unregisterAutoHideMounse } from './autoHideMounse'
import { appSetting } from '@renderer/store/setting'
import { closeWindow, maxWindow, minWindow, setFullScreen } from '@renderer/utils/ipc'
import { useRouter } from '@common/utils/vueRouter'
import useMusicJump from '@renderer/utils/compositions/useMusicJump'

export default {
  name: 'CorePlayDetail',
  components: {
    ControlBtnsLeftHeader,
    ControlBtnsRightHeader,
    LyricPlayer,
    PlayBar,
    MusicComment,
  },
  setup() {
    const visibled = ref(false)
    const router = useRouter()

    let clickTime = 0

    const hide = () => {
      setShowPlayerDetail(false)
    }
    const handleContextMenu = () => {
      if (window.performance.now() - clickTime > 400) {
        clickTime = window.performance.now()
        return
      }
      clickTime = 0
      hide()
    }

    const hideComment = () => {
      setShowPlayComment(false)
    }

    const handleAfterEnter = () => {
      if (isFullscreen.value) registerAutoHideMounse()

      visibled.value = true
    }

    const handleAfterLeave = () => {
      setShowPlayLrcSelectContentLrc(false)
      hideComment(false)
      visibled.value = false

      unregisterAutoHideMounse()
    }

    watch(isFullscreen, isFullscreen => {
      (isFullscreen ? registerAutoHideMounse : unregisterAutoHideMounse)()
    })


    // 跳转 / 分享（工单 02）：这一页只显示播放器状态里的精简结构（name/singer/album），
    // 所以一律以 playMusicInfo.musicInfo（新式歌曲对象，带 meta）为准——它才有 songmid / albumMid
    const {
      canJumpToAlbum,
      canJumpToSinger,
      canShareMusic,
      handleSingerNameClick,
      handleAlbumNameClick,
      getSongMid,
    } = useMusicJump()

    const handlePlayDetailSingerClick = (event) => {
      if (!canJumpToSinger(playMusicInfo.musicInfo)) return
      handleSingerNameClick(playMusicInfo.musicInfo, event)
    }
    const handlePlayDetailAlbumClick = () => {
      if (!canJumpToAlbum(playMusicInfo.musicInfo)) return
      handleAlbumNameClick(playMusicInfo.musicInfo)
    }
    const handleOpenSongDetail = () => {
      const mid = getSongMid(playMusicInfo.musicInfo)
      if (!mid) return
      void router.push({ path: '/songDetail', query: { mid } })
    }

    return {
      appSetting,
      playMusicInfo,
      isShowPlayerDetail,
      isShowPlayComment,
      musicInfo,
      hide,
      handleContextMenu,
      hideComment,
      handleAfterEnter,
      handleAfterLeave,
      visibled,
      isFullscreen,
      canJumpToAlbum,
      canJumpToSinger,
      canShareMusic,
      handlePlayDetailSingerClick,
      handlePlayDetailAlbumClick,
      handleOpenSongDetail,
      fullscreenExit() {
        void setFullScreen(false).then((fullscreen) => {
          isFullscreen.value = fullscreen
        })
      },
      min() {
        minWindow()
      },
      max() {
        maxWindow()
      },
      close() {
        closeWindow()
      },
    }
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

@control-btn-width: @height-toolbar * .26;

.container {
  position: absolute;
  display: flex;
  flex-flow: column nowrap;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background-color: var(--color-content-background);
  z-index: 10;
  // -webkit-app-region: drag;
  overflow: hidden;
  border-radius: @radius-border;
  color: var(--color-font);
  // border-left: 12px solid var(--color-primary-alpha-900);
  -webkit-app-region: no-drag;
  contain: strict;

  box-sizing: border-box;

  * {
    box-sizing: border-box;
  }
}
.bg {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background: var(--background-image) var(--background-image-position) no-repeat;
  background-size: var(--background-image-size);
  // background-size: 110% 110%;
  // filter: blur(60px);
  opacity: .7;
  z-index: -1;
  &:before {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background-color: var(--color-app-background);
  }
  &:after {
    position: absolute;
    left: 0;
    top: 0;
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background-color: var(--color-main-background);
  }
}
// .bg2 {
//   position: absolute;
//   width: 100%;
//   height: 100%;
//   top: 0;
//   left: 0;
//   z-index: -1;
//   background-color: rgba(255, 255, 255, .8);
// }

.main {
  flex: auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  margin: 0 30px;
  position: relative;

  &.showComment {
    :global {
      .left {
        flex-basis: 18%;
        .description p {
          font-size: 12px;
        }
      }
      .right {
        flex-basis: 30%;
        .lyricSelectContent {
          font-size: 14px;
        }
      }
      .comment {
        opacity: 1;
        transform: scaleX(1);
      }
    }
  }
}
.left {
  // 44%：封面在 300px 的 .info 上限里显得偏小（用户 2026-09-23 反馈）而放大的一档。
  // ⚠️ 与歌词列的 flex-basis 是**一对**：两者之和必须是 100%（44 + 56，见 LyricPlayer.vue 的 .right）。
  // 曾经写成 44 + 60 = 104% → 歌词列多出的 4% 被本文件 .main 的 overflow:hidden 裁掉，
  // 表现为「歌词右侧出去了」，连「允许拖拽歌词调进度」的跳转按钮都整块被裁没（2026-09-24 修）
  flex: 0 0 44%;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  padding: 13px;
  overflow: hidden;
  transition: flex-basis @transition-normal;
}

.info {
  display: flex;
  flex-flow: column nowrap;
  justify-content: flex-start;
  // 封面（.img 是 min-width:100%）与歌曲信息都受这个上限约束，300 → 400 让封面明显大一圈
  max-width: 400px;
  min-height: 0;
}
.img {
  max-width: 100%;
  max-height: 80%;
  min-width: 100%;
  box-shadow: 0 0 6px var(--color-primary-alpha-500);
  border-radius: 6px;
  opacity: .8;
}
.description {
  max-width: 400px;
  margin-top: 15px;
  padding-bottom: 15px;
  min-height: 0;
  p {
    line-height: 1.5;
    font-size: 14px;
    overflow-wrap: break-word;
  }
}

// 可点的歌手名 / 专辑名（工单 02）：只加提示，不改颜色（背景是封面虚化，颜色改动容易糊）
.jumpable {
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}
// 进「歌曲详情页」的入口：做得像一条链接（这一页原来整页没有可点元素）
.jumpLink {
  cursor: pointer;
  color: var(--color-primary);
  &:hover {
    text-decoration: underline;
  }
}


.comment {
  position: absolute;
  right: 0;
  top: 0;
  width: 50%;
  height: 100%;
  opacity: 1;
  margin-left: 10px;
  transform: scaleX(0);
}


</style>
