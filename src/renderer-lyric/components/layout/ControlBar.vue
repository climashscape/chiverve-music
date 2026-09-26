<template>
  <div :class="$style.container">
    <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated fadeOut">
      <div v-show="!isShowThemeList" :class="$style.btns" @mousedown="handleLyricMouseDown" @touchstart="handleLyricTouchStart">
        <!-- 图标键一律 aria-label + title 取同一份文案（§2.5.1 规则 11）：aria-label 管无障碍，
             title 是唯一的悬停提示来源；动态键的三份文案在 setup 里算成 computed，免得写两遍 -->
        <button :class="$style.btn" :aria-label="$t('desktop_lyric__close')" :title="$t('desktop_lyric__close')" @click="handleClose">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-close" />
          </svg>
        </button>
        <button :class="$style.btn" :aria-label="lockTitle" :title="lockTitle" @click="handleLock">
          <svg v-if="setting['desktopLyric.isLock']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-unlock" />
          </svg>
          <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-lock" />
          </svg>
        </button>
        <button :class="$style.btn" :aria-label="$t('desktop_lyric__font_increase')" :title="$t('desktop_lyric__font_increase')" @click="handleFontChange('increase', 1)">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-font-increase" />
          </svg>
        </button>
        <button :class="$style.btn" :aria-label="$t('desktop_lyric__font_decrease')" :title="$t('desktop_lyric__font_decrease')" @click="handleFontChange('decrease', 1)">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-font-decrease" />
          </svg>
        </button>
        <button :class="$style.btn" :aria-label="$t('desktop_lyric__opacity_increase')" :title="$t('desktop_lyric__opacity_increase')" @click="handleOpactiyChange('increase', 10)" @contextmenu="handleOpactiyChange('increase', 2)">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-opactiy-increase" />
          </svg>
        </button>
        <button :class="$style.btn" :aria-label="$t('desktop_lyric__opacity_decrease')" :title="$t('desktop_lyric__opacity_decrease')" @click="handleOpactiyChange('decrease', 10)" @contextmenu="handleOpactiyChange('decrease', 2)">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-opactiy-decrease" />
          </svg>
        </button>
        <button :class="$style.btn" :aria-label="zoomLrcTitle" :title="zoomLrcTitle" @click="handleZoomLrc">
          <svg v-if="setting['desktopLyric.style.isZoomActiveLrc']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-vibrate-off" />
          </svg>
          <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-vibrate" />
          </svg>
        </button>
        <button :class="$style.btn" :aria-label="alwaysOnTopTitle" :title="alwaysOnTopTitle" @click="handleAlwaysOnTop">
          <svg v-if="setting['desktopLyric.isAlwaysOnTop']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-top-off" />
          </svg>
          <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="20px" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-top-on" />
          </svg>
        </button>
      </div>
    </transition>
  </div>
</template>

<script>
import { computed, ref } from '@common/utils/vueTools'
import { setting } from '@lyric/store/state'
import { updateSetting } from '@lyric/store/action'
import { useI18n } from '@lyric/plugins/i18n'
import useDrag from './useDrag'

export default {
  setup() {
    const t = useI18n()
    const isShowThemeList = ref(false)
    const { handleLyricMouseDown, handleLyricTouchStart } = useDrag()

    // 三个「按下会切状态」的键：文案在两种状态间切（锁 / 居中放大 / 置顶）。
    // 算成 computed 供 `aria-label` 与 `title` 共用一份，避免同一串三元表达式在模板里写两遍（§2.5.1 规则 11）
    const lockTitle = computed(() => t(setting['desktopLyric.isLock'] ? 'desktop_lyric__unlock' : 'desktop_lyric__lock'))
    const zoomLrcTitle = computed(() => t(setting['desktopLyric.style.isZoomActiveLrc'] ? 'desktop_lyric__lrc_active_zoom_off' : 'desktop_lyric__lrc_active_zoom_on'))
    const alwaysOnTopTitle = computed(() => t(setting['desktopLyric.isAlwaysOnTop'] ? 'desktop_lyric__win_top_off' : 'desktop_lyric__win_top_on'))

    const handleClose = () => {
      updateSetting({ 'desktopLyric.enable': false })
    }
    const handleLock = () => {
      updateSetting({ 'desktopLyric.isLock': true })
    }
    const handleAlwaysOnTop = () => {
      updateSetting({ 'desktopLyric.isAlwaysOnTop': !setting['desktopLyric.isAlwaysOnTop'] })
    }
    const handleZoomLrc = () => {
      updateSetting({ 'desktopLyric.style.isZoomActiveLrc': !setting['desktopLyric.style.isZoomActiveLrc'] })
    }
    const handleFontChange = (action, step) => {
      let num
      switch (action) {
        case 'increase':
          num = Math.min(setting['desktopLyric.style.fontSize'] + step, 80)
          break
        case 'decrease':
          num = Math.max(setting['desktopLyric.style.fontSize'] - step, 10)
          break
      }
      if (setting['desktopLyric.style.fontSize'] == num) return
      updateSetting({ 'desktopLyric.style.fontSize': num })
    }
    const handleOpactiyChange = (action, step) => {
      let num
      switch (action) {
        case 'increase':
          num = Math.min(setting['desktopLyric.style.opacity'] + step, 100)
          break
        case 'decrease':
          num = Math.max(setting['desktopLyric.style.opacity'] - step, 6)
          break
      }
      if (setting['desktopLyric.style.opacity'] == num) return
      updateSetting({ 'desktopLyric.style.opacity': num })
    }
    return {
      setting,
      isShowThemeList,
      lockTitle,
      zoomLrcTitle,
      alwaysOnTopTitle,

      handleClose,
      handleLock,
      handleAlwaysOnTop,
      handleZoomLrc,
      handleFontChange,
      handleOpactiyChange,
      handleLyricMouseDown,
      handleLyricTouchStart,
    }
  },
}
</script>

<style lang="less" module>
@import '../../assets/styles/layout.less';

@bar-height: 38px;
@bar-height-padding: 7px;

.container {
  position: relative;
  // height: 50px;
  transition: opacity @transition-theme;
  // opacity: 0;
  // &:hover {
  //   opacity: 1;
  // }
}

.btns {
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  // 控制栏跟随主题：比面板略不透明一档，保持「栏浮在面板上」的层次
  background-color: color-mix(in srgb, var(--color-main-background) 96%, transparent);
}

.btn {
  min-height: @bar-height;
  padding: 0 10px;
  cursor: pointer;
  border: none;
  outline: none;
  background: none;
  // 图标是 fill="currentColor"（Icons.vue），所以这个色同时决定图标与文字
  color: var(--color-1000);
  transition: opacity @transition-theme;
  &:hover {
    opacity: .7;
  }
}

</style>
