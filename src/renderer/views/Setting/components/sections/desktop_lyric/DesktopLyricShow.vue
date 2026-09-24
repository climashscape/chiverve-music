<template lang="pug">
dd
  h3#desktop_lyric_show {{ $t('setting__desktop_lyric_show_title') }}
  div
    //- 歌词窗总开关：开=建窗、关=销窗（托盘菜单 / 播放详情页按钮 / 全局快捷键也是它的开关对象）
    .gap-top(data-setting-key="desktopLyric.enable")
      base-checkbox(id="setting_desktop_lyric_enable" :model-value="appSetting['desktopLyric.enable']" :label="$t('setting__desktop_lyric_enable')" @update:model-value="updateSetting({ 'desktopLyric.enable': $event })")
    //- 主窗进全屏就关歌词窗、退出再建；与「以全屏模式启动」联动（启动瞬间就不建窗）
    .gap-top(data-setting-key="desktopLyric.fullscreenHide")
      base-checkbox(id="setting_desktop_lyric_fullscreen_hide" :model-value="appSetting['desktopLyric.fullscreenHide']" :label="$t('setting__desktop_lyric_fullscreen_hide')" @update:model-value="updateSetting({ 'desktopLyric.fullscreenHide': $event })")
    //- 勾上才会在任务栏出现歌词窗（录屏软件抓不到时的兜底）
    .gap-top(data-setting-key="desktopLyric.isShowTaskbar")
      base-checkbox(id="setting_desktop_lyric_showTaskbar" :model-value="appSetting['desktopLyric.isShowTaskbar']" :label="$t('setting__desktop_lyric_show_taskbar')" @update:model-value="updateSetting({ 'desktopLyric.isShowTaskbar': $event })")
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__desktop_lyric_show_taskbar_tip')" :title="$t('setting__desktop_lyric_show_taskbar_tip')")
    .gap-top(data-setting-key="desktopLyric.isAlwaysOnTop")
      base-checkbox(id="setting_desktop_lyric_alwaysOnTop" :model-value="appSetting['desktopLyric.isAlwaysOnTop']" :label="$t('setting__desktop_lyric_always_on_top')" @update:model-value="updateSetting({ 'desktopLyric.isAlwaysOnTop': $event })")
    //- 依赖上面的置顶开启（没开置顶时改这项无效果）
    .gap-top(data-setting-key="desktopLyric.isAlwaysOnTopLoop")
      base-checkbox(id="setting_desktop_lyric_alwaysOnTopLoop" :model-value="appSetting['desktopLyric.isAlwaysOnTopLoop']" :label="$t('setting__desktop_lyric_always_on_top_loop')" @update:model-value="updateSetting({ 'desktopLyric.isAlwaysOnTopLoop': $event })")
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__desktop_lyric_always_on_top_loop_tip')" :title="$t('setting__desktop_lyric_always_on_top_loop_tip')")
    //- 默认值平台相关（isWin）；关了可以把歌词拖到副屏——双屏用户的关键项
    .gap-top(data-setting-key="desktopLyric.isLockScreen")
      base-checkbox(id="setting_desktop_lyric_lockScreen" :model-value="appSetting['desktopLyric.isLockScreen']" :label="$t('setting__desktop_lyric_lock_screen')" @update:model-value="updateSetting({ 'desktopLyric.isLockScreen': $event })")
    //- 决定渲染 LyricHorizontal 还是 LyricVertical 两套布局（scrollAlign 只在垂直模式下参与布局）
    div.gap-top(data-setting-key="desktopLyric.direction")
      .p.small {{ $t('setting__desktop_lyric_direction') }}
      div
        base-checkbox.gap-left(id="setting_desktop_lyric_direction_horizontal" :model-value="appSetting['desktopLyric.direction']" need value="horizontal" :label="$t('setting__desktop_lyric_direction_horizontal')" @update:model-value="updateSetting({ 'desktopLyric.direction': $event })")
        base-checkbox.gap-left(id="setting_desktop_lyric_direction_vertical" :model-value="appSetting['desktopLyric.direction']" need value="vertical" :label="$t('setting__desktop_lyric_direction_vertical')" @update:model-value="updateSetting({ 'desktopLyric.direction': $event })")
    //- 与主窗的 player.audioVisualization 是两个独立开关；与自定义输出设备互斥
    .gap-top(data-setting-key="desktopLyric.audioVisualization")
      base-checkbox(id="setting_desktop_lyric_audio_visualization" :model-value="appSetting['desktopLyric.audioVisualization']" :label="$t('setting__desktop_lyric_audio_visualization')" @update:model-value="updateSetting({ 'desktopLyric.audioVisualization': $event })")
</template>

<script>
import { appSetting, updateSetting } from '@renderer/store/setting'

/** 桌面歌词 → 显示与置顶（`desktop_lyric_show`）：从 SettingDesktopLyric.vue 的裸开关堆里按语义重排。 */
export default {
  name: 'DesktopLyricShow',
  setup() {
    return {
      appSetting,
      updateSetting,
    }
  },
}
</script>
