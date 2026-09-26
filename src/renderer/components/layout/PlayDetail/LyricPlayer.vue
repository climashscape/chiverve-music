<template>
  <div :class="['right', $style.right]" :style="lrcFontSize">
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <div
        v-show="!isShowLrcSelectContent"
        ref="dom_lyric"
        :class="['lyric', $style.lyric, { [$style.draging]: isMsDown }, { [$style.lrcActiveZoom]: isZoomActiveLrc }]" :style="lrcStyles"
        :title="isLyricDictAvailable ? $t('player__lyric_dict_hint') : ''"
        @wheel="handleWheel" @mousedown="handleLyricMouseDown" @touchstart="handleLyricTouchStart"
        @contextmenu.stop="handleShowLyricMenu" @dblclick="handleLyricDblclick"
      >
        <div :class="['pre', $style.lyricSpace]" />
        <div ref="dom_lyric_text" />
        <div :class="$style.lyricSpace" />
      </div>
    </transition>
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <div v-if="isShowLyricProgressSetting" v-show="isStopScroll && !isShowLrcSelectContent" :class="$style.skip">
        <div ref="dom_skip_line" :class="$style.line" />
        <span :class="$style.label">{{ timeStr }}</span>
        <base-btn :class="$style.skipBtn" @mouseenter="handleSkipMouseEnter" @mouseleave="handleSkipMouseLeave" @click="handleSkipPlay">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="50%" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-play" />
          </svg>
        </base-btn>
      </div>
    </transition>
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <div v-if="isShowLrcSelectContent" ref="dom_lrc_select_content" tabindex="-1" :class="[$style.lyricSelectContent, 'select', 'scroll', 'lyricSelectContent']" @contextmenu="handleCopySelectText">
        <div v-for="(info, index) in lyric.lines" :key="index" :class="[$style.lyricSelectline, { [$style.lrcActive]: lyric.line == index }]">
          <span>{{ info.text }}</span>
          <template v-for="(lrc, i) in info.extendedLyrics" :key="i">
            <br>
            <span :class="$style.lyricSelectlineExtended">{{ lrc }}</span>
          </template>
        </div>
      </div>
    </transition>
    <LyricMenu v-model="lyricMenuVisible" :xy="lyricMenuXY" :lyric-info="lyricInfo" @update-lyric="handleUpdateLyric" />
    <!-- 点歌词查词（歌词词典）：只在「这首歌有词典」时才有提示与交互，见 useLyricDict 的文件头 -->
    <LyricDictModal
      v-model:show="lyricDictVisible"
      :word="lyricDictWord"
      :entries="lyricDictEntries"
      :loading="lyricDictLoading"
    />
  </div>
</template>

<script>
import { clipboardWriteText } from '@common/utils/electron'
import { lyric } from '@renderer/store/player/lyric'
import { playProgress } from '@renderer/store/player/playProgress'
import { isFullscreen } from '@renderer/store'
import {
  isPlay,
  isShowLrcSelectContent,
  isShowPlayComment,
  musicInfo as playerMusicInfo,
  playMusicInfo,
} from '@renderer/store/player/state'
import {
  setMusicInfo,
} from '@renderer/store/player/action'
import { onMounted, onBeforeUnmount, computed, reactive, ref, nextTick, watch } from '@common/utils/vueTools'
import useLyric from '@renderer/utils/compositions/useLyric'
import LyricMenu from './components/LyricMenu.vue'
import LyricDictModal from './components/LyricDictModal.vue'
import { appSetting } from '@renderer/store/setting'
import { setLyricOffset } from '@renderer/core/lyric'
import useSelectAllLrc from './useSelectAllLrc'
import useLyricDict from './useLyricDict'
import { wordAtPoint } from './lyricWordAtPoint'

export default {
  components: {
    LyricMenu,
    LyricDictModal,
  },
  setup() {
    const isZoomActiveLrc = computed(() => appSetting['playDetail.isZoomActiveLrc'])
    const isShowLyricProgressSetting = computed(() => appSetting['playDetail.isShowLyricProgressSetting'])

    const {
      dom_lyric,
      dom_lyric_text,
      dom_skip_line,
      isMsDown,
      isStopScroll,
      timeStr,
      handleLyricMouseDown,
      handleLyricTouchStart,
      handleWheel,
      handleSkipPlay,
      handleSkipMouseEnter,
      handleSkipMouseLeave,
      handleScrollLrc,
    } = useLyric({ isPlay, lyric, playProgress, isShowLyricProgressSetting })

    const dom_lrc_select_content = useSelectAllLrc()

    watch([isFullscreen, isShowPlayComment], () => {
      setTimeout(handleScrollLrc, 400)
    })

    const lyricMenuVisible = ref(false)
    const lyricMenuXY = reactive({
      x: 0,
      y: 0,
    })
    const lyricInfo = reactive({
      lyric: '',
      tlyric: '',
      rlyric: '',
      lxlyric: '',
      rawlyric: '',
      musicInfo: null,
    })
    const updateMusicInfo = () => {
      lyricInfo.lyric = playerMusicInfo.lrc
      lyricInfo.tlyric = playerMusicInfo.tlrc
      lyricInfo.rlyric = playerMusicInfo.rlrc
      lyricInfo.lxlyric = playerMusicInfo.lxlrc
      lyricInfo.rawlyric = playerMusicInfo.rawlrc
      lyricInfo.musicInfo = playMusicInfo.musicInfo
    }
    const handleShowLyricMenu = event => {
      updateMusicInfo()
      lyricMenuXY.x = event.pageX
      lyricMenuXY.y = event.pageY
      if (lyricMenuVisible.value) return
      void nextTick(() => {
        lyricMenuVisible.value = true
      })
    }
    const handleUpdateLyric = ({ lyric, tlyric, rlyric, lxlyric, offset }) => {
      setMusicInfo({
        lrc: lyric,
        tlrc: tlyric,
        rlrc: rlyric,
        lxlrc: lxlyric,
      })
      console.log(offset)
      setLyricOffset(offset)
    }

    // 点歌词查词（歌词词典）
    const {
      lyricDictVisible,
      lyricDictWord,
      lyricDictEntries,
      lyricDictLoading,
      isLyricDictAvailable,
      lookupWord: lookupLyricWord,
    } = useLyricDict()
    /**
     * 双击歌词里的词 → 查释义。
     * 为什么是**双击**而不是单击：单击 / 按下已经被 `useLyric` 拿去拖拽滚动歌词了
     * （`handleLyricMouseDown` + document 上的 mousemove），再叠单击必然误触。
     *
     * 取词**不依赖浏览器选区**：整个应用 `user-select: none`（`App.vue`，拖拽滚动的前提），
     * 双击建不起选区，旧写法（读 `getSelection()`）在真机上恒为空。改成按**点击坐标**取词
     * （`wordAtPoint`，见 `lyricWordAtPoint.ts` 的文件头），所以不必放开可选、不动拖拽手感。
     * 命中位置必须落在歌词区里：本页旁边还有封面/歌名，那里的双击不该当歌词查。
     *
     * **这首歌没有词典就整个不动**（与「悬停提示只在有词典时挂」同一条判据）：实测中文歌 / 日文歌
     * 都没有词典，让它们双击弹一个「无释义」既没用又多一次请求。词典还在路上时照走，
     * 弹窗自己给加载态（见 `useLyricDict` 的 `lookupWord`）——所以守卫要**连 loading 一起看**：
     * `isLyricDictAvailable` 只在请求回来且非空时为真，光看它会把「刚切歌、词典还在路上」这一段
     * 的双击静默丢掉（`useLyricDict` 里 pending 那条分支也就永远走不到）。
     */
    const handleLyricDblclick = (event) => {
      if (!isLyricDictAvailable.value && !lyricDictLoading.value) return
      const word = wordAtPoint(event?.clientX, event?.clientY, dom_lyric.value)
      if (!word) return
      lookupLyricWord(word)
    }

    const lrcStyles = computed(() => {
      return {
        textAlign: appSetting['playDetail.style.align'],
      }
    })
    const lrcFontSize = computed(() => {
      let size = appSetting['playDetail.style.fontSize'] / 100
      if (isFullscreen.value) size = size *= 1.4
      return {
        '--playDetail-lrc-font-size': (isShowPlayComment.value ? size * 0.82 : size) + 'rem',
      }
    })

    onMounted(() => {
      window.app_event.on('musicToggled', updateMusicInfo)
      window.app_event.on('lyricUpdated', updateMusicInfo)
    })
    onBeforeUnmount(() => {
      window.app_event.off('musicToggled', updateMusicInfo)
      window.app_event.off('lyricUpdated', updateMusicInfo)
    })

    return {
      dom_lyric,
      dom_lyric_text,
      dom_skip_line,
      dom_lrc_select_content,
      isMsDown,
      timeStr,
      handleLyricMouseDown,
      handleLyricTouchStart,
      handleWheel,
      handleSkipPlay,
      handleSkipMouseEnter,
      handleSkipMouseLeave,
      lyric,
      lrcStyles,
      lrcFontSize,
      isShowLrcSelectContent,
      isShowLyricProgressSetting,
      isZoomActiveLrc,
      isStopScroll,
      lyricMenuVisible,
      lyricMenuXY,
      handleShowLyricMenu,
      handleUpdateLyric,
      lyricInfo,
      lyricDictVisible,
      lyricDictWord,
      lyricDictEntries,
      lyricDictLoading,
      isLyricDictAvailable,
      handleLyricDblclick,
    }
  },
  methods: {
    handleCopySelectText() {
      let str = window.getSelection().toString()
      str = str.trim()
      if (!str.length) return
      clipboardWriteText(str)
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.right {
  // ⚠️ 与封面栏的 flex-basis 是一对：两者之和必须是 100%（56 + 44，见 index.vue 的 .left）。
  // 上游是 40 + 60；封面放大到 44% 后这里若还留 60%，多出的 4% 会被 .main 的 overflow:hidden
  // 裁掉——歌词行尾缺字、跳转按钮整块不可见（2026-09-24 修）
  flex: 0 0 56%;
  // padding: 0 30px;
  position: relative;
  transition: flex-basis @transition-normal;
}
.lyric {
  text-align: center;
  height: 100%;
  overflow: hidden;
  font-size: var(--playDetail-lrc-font-size, 16px);
  -webkit-mask-image: linear-gradient(transparent 0%, #fff 20%,  #fff 80%, transparent 100%);
  cursor: grab;
  &.draging {
    cursor: grabbing;
  }
  :global {
    .font-lrc {
      color: var(--color-450);
    }
    .line-content {
      line-height: 1.2;
      padding: calc(var(--playDetail-lrc-font-size, 16px) / 2) 1px;
      overflow-wrap: break-word;
      color: var(--color-450);
      transition: @transition-normal;
      transition-property: padding;

      .extended {
        font-size: 0.8em;
        margin-top: 5px;
      }
      &.line-mode {
        .font-lrc {
          transition: @transition-fast;
          transition-property: font-size, color;
        }
      }
      &.line-mode.active .font-lrc, &.font-mode.played .font-lrc {
        color: var(--color-primary-dark-200);
      }
      &.font-mode .extended .font-lrc {
        transition: @transition-slow;
        transition-property: font-size, color;
      }

      &.font-mode > .line > .font-lrc {
        > span {
          transition: @transition-normal;
          transition-property: font-size;
          font-size: 1em;
          background-repeat: no-repeat;
          background-color: var(--color-450);
          background-image: -webkit-linear-gradient(top, var(--color-primary-dark-200), var(--color-primary-dark-200));
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text;
          background-size: 0 100%;
        }
      }
    }
  }
  // p {
  //   padding: 8px 0;
  //   line-height: 1.2;
  //   overflow-wrap: break-word;
  //   transition: @transition-normal !important;
  //   transition-property: color, font-size;
  // }
  // .lrc-active {
  //   color: var(--color-primary);
  //   font-size: 1.2em;
  // }
}
.lrcActiveZoom {
  :global {
    .line-content {
      &.active {
        .extended {
          font-size: .94em;
        }
        .line {
          font-size: 1.1em;
        }
      }
    }
  }
}

.skip {
  position: absolute;
  top: calc(38% + var(--playDetail-lrc-font-size, 16px) + 4px);
  left: 0;
  // height: 6px;
  width: 100%;
  pointer-events: none;
  // opacity: .5;
  .line {
    border-top: 2px dotted var(--color-primary-dark-100);
    opacity: .15;
    margin-right: 30px;
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, transparent 15%, #fff 100%);
  }
  .label {
    position: absolute;
    right: 30px;
    top: -14px;
    line-height: 1.2;
    font-size: 12px;
    color: var(--color-primary-dark-100);
    opacity: .7;
  }
  .skipBtn {
    position: absolute;
    right: 0;
    top: 0;
    transform: translateY(-50%);
    width: 30px;
    height: 30px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none !important;
    pointer-events: initial;
    transition: @transition-normal;
    transition-property: opacity;
    opacity: .8;
    &:hover {
      opacity: .6;
    }
  }
}
.lyricSelectContent {
  position: absolute;
  left: 0;
  top: 0;
  // text-align: center;
  height: 100%;
  width: 100%;
  font-size: var(--playDetail-lrc-font-size, 16px);
  z-index: 10;
  color: var(--color-400);

  .lyricSelectline {
    padding: calc(var(--playDetail-lrc-font-size, 16px) / 2) 1px;
    overflow-wrap: break-word;
    transition: @transition-normal !important;
    transition-property: color, font-size;
    line-height: 1.3;
  }
  .lyricSelectlineExtended {
    font-size: 14px;
  }
  .lrcActive {
    color: var(--color-primary);
  }
}

.lyricSpace {
  height: 70%;
}

</style>
