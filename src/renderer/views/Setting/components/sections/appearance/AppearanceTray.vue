<template lang="pug">
dd
  h3#appearance_tray {{ $t('setting__appearance_tray_title') }}
  div
    //- 一个开关管两件事：建/销托盘图标 + 关窗时 hide 而不是退出
    .gap-top(data-setting-key="tray.enable")
      base-checkbox(id="setting_to_tray" :model-value="appSetting['tray.enable']" :label="$t('setting__basic_to_tray')" @update:model-value="updateSetting({'tray.enable': $event})")
    //- 4 档：白色 / 黑色 / 原色 / 跟随系统（跟随系统用 nativeTheme 在白黑之间切）；图标来自 SettingOther.vue
    div.gap-top(data-setting-key="tray.themeId")
      .p.small {{ $t('setting__other_tray_theme') }}
      div
        base-checkbox.gap-left(
          v-for="item in trayThemeList" :id="'setting_tray_theme_' + item.id" :key="item.id" :model-value="appSetting['tray.themeId']" name="setting_tray_theme"
          need :label="item.label" :value="item.id" @update:model-value="updateSetting({'tray.themeId': $event})")
    //- 仅 mac，且依赖托盘开启（实现是把当前歌词行写进托盘 title）；Linux/Windows 上不渲染这一项
    .gap-top(v-if="isMac" data-setting-key="player.isShowStatusBarLyric")
      base-checkbox(id="setting_player_showStatusBarLyric" :model-value="appSetting['player.isShowStatusBarLyric']" :label="$t('setting__play_statusbar_lyric')" @update:model-value="updateSetting({'player.isShowStatusBarLyric': $event})")
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__play_statusbar_lyric_tip')" :title="$t('setting__play_statusbar_lyric_tip')")
    //- Windows/Linux 任务栏图标进度条（mac 是 Dock 进度条），与托盘图标本身无关
    .gap-top(data-setting-key="player.isShowTaskProgess")
      base-checkbox(id="setting_player_showTaskProgess" :model-value="appSetting['player.isShowTaskProgess']" :label="$t('setting__play_task_bar')" @update:model-value="updateSetting({'player.isShowTaskProgess': $event})")
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { isMac } from '@common/utils'
import { TRAY_AUTO_ID } from '@common/constants'

/**
 * 外观 → 托盘与系统栏（`appearance_tray`）：托盘两项来自 SettingBasic.vue（`tray.enable`）与
 * SettingOther.vue（`tray.themeId`）；两个「系统栏」项（`player.isShowStatusBarLyric` /
 * `isShowTaskProgess`）来自 SettingPlay.vue——附 B11 把这两项判给本组（用户 2026-09-23 拍板），
 * 本票复核后**维持该归属**：实现就是托盘 title 与任务栏/Dock 进度条，与只装窗口尺寸的「窗口」组无关。
 */
export default {
  name: 'AppearanceTray',
  setup() {
    const t = useI18n()

    const trayThemeList = computed(() => {
      return [
        { id: 0, name: 'native', label: t('setting__other_tray_theme_native') },
        { id: 2, name: 'black', label: t('setting__other_tray_theme_black') },
        { id: 1, name: 'origin', label: t('setting__other_tray_theme_origin') },
        { id: TRAY_AUTO_ID, name: 'auto', label: t('setting__other_tray_theme_auto') },
      ]
    })

    return {
      appSetting,
      updateSetting,
      trayThemeList,
      isMac,
    }
  },
}
</script>
