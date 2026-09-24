<template lang="pug">
dd
  h3#desktop_lyric_interact {{ $t('setting__desktop_lyric_interact_title') }}
  div
    //- 锁定后鼠标穿透 + 隐藏控制条；撤销只能从托盘 / 播放详情页按钮 / 快捷键
    .gap-top(data-setting-key="desktopLyric.isLock")
      base-checkbox(id="setting_desktop_lyric_lock" :model-value="appSetting['desktopLyric.isLock']" :label="$t('setting__desktop_lyric_lock')" @update:model-value="updateSetting({ 'desktopLyric.isLock': $event })")
    //- Linux 上整项不渲染（主进程那份也只在该平台外生效）
    .gap-top(v-if="!isLinux" data-setting-key="desktopLyric.isHoverHide")
      base-checkbox(id="setting_desktop_lyric_hoverHide" :model-value="appSetting['desktopLyric.isHoverHide']" :label="$t('setting__desktop_lyric_hover_hide')" @update:model-value="updateSetting({ 'desktopLyric.isHoverHide': $event })")
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__desktop_lyric_hover_hide_tip')" :title="$t('setting__desktop_lyric_hover_hide_tip')")
    //- 默认开启，用户常把它当成「歌词不见了」的 bug
    .gap-top(data-setting-key="desktopLyric.pauseHide")
      base-checkbox(id="setting_desktop_lyric_pause_hide" :model-value="appSetting['desktopLyric.pauseHide']" :label="$t('setting__desktop_lyric_pause_hide')" @update:model-value="updateSetting({ 'desktopLyric.pauseHide': $event })")
    //- 逐行滚动延迟 600ms；与主窗 playDetail.isDelayScroll 是两份独立设置
    .gap-top(data-setting-key="desktopLyric.isDelayScroll")
      base-checkbox(id="setting_desktop_lyric_delayScroll" :model-value="appSetting['desktopLyric.isDelayScroll']" :label="$t('setting__desktop_lyric_delay_scroll')" @update:model-value="updateSetting({ 'desktopLyric.isDelayScroll': $event })")
    //- 仅垂直模式（direction=vertical）下参与布局：当前行滚到顶部还是居中
    div.gap-top(data-setting-key="desktopLyric.scrollAlign")
      .p.small {{ $t('setting__desktop_lyric_scroll_align') }}
      div
        base-checkbox.gap-left(id="setting_desktop_lyric_scroll_align_top" :model-value="appSetting['desktopLyric.scrollAlign']" need value="top" :label="$t('setting__desktop_lyric_scroll_align_top')" @update:model-value="updateSetting({ 'desktopLyric.scrollAlign': $event })")
        base-checkbox.gap-left(id="setting_desktop_lyric_scroll_align_center" :model-value="appSetting['desktopLyric.scrollAlign']" need value="center" :label="$t('setting__desktop_lyric_scroll_align_center')" @update:model-value="updateSetting({ 'desktopLyric.scrollAlign': $event })")
</template>

<script>
import { isLinux } from '@common/utils'
import { appSetting, updateSetting } from '@renderer/store/setting'

/** 桌面歌词 → 交互（`desktop_lyric_interact`）：锁定 / 淡出 / 延迟滚动 / 滚动位置（后两项原散在裸开关里）。 */
export default {
  name: 'DesktopLyricInteract',
  setup() {
    return {
      appSetting,
      updateSetting,
      isLinux,
    }
  },
}
</script>
