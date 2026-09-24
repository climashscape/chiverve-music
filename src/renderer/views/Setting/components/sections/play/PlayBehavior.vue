<template lang="pug">
dd
  h3#play_behavior {{ $t('setting__play_behavior_title') }}
  div
    //- 只在「恢复了上次播放的歌」时才起作用（没有可恢复的播放记录时无任何效果）
    .gap-top(data-setting-key="player.startupAutoPlay")
      base-checkbox(id="setting_player_startup_auto_play" :model-value="appSetting['player.startupAutoPlay']" :label="$t('setting__play_startup_auto_play')" @update:model-value="updateSetting({'player.startupAutoPlay': $event})")
      common-setting-help-icon(:text="$t('setting__play_startup_auto_play_tip')" :label="$t('setting__play_startup_auto_play')")
    //- 关掉后暂停时要再等 90 秒才释放阻止器（防频繁切歌反复申请）
    .gap-top(data-setting-key="player.powerSaveBlocker")
      base-checkbox(id="setting_player_power_save_blocker" :model-value="appSetting['player.powerSaveBlocker']" :label="$t('setting__play_power_save_blocker')" @update:model-value="handleUpdatePowerSaveBlocker")
      common-setting-help-icon(:text="$t('setting__play_power_save_blocker_tip')" :label="$t('setting__play_power_save_blocker')")
    //- 只对「非临时列表」生效（在线列表播完即弃，不记进度）
    .gap-top(data-setting-key="player.isSavePlayTime")
      base-checkbox(id="setting_player_save_play_time" :model-value="appSetting['player.isSavePlayTime']" :label="$t('setting__play_save_play_time')" @update:model-value="updateSetting({'player.isSavePlayTime': $event})")
      common-setting-help-icon(:text="$t('setting__play_save_play_time_tip')" :label="$t('setting__play_save_play_time')")
    //- 只影响「点播列表 == 当前播放列表」这条路径
    .gap-top(data-setting-key="player.isAutoCleanPlayedList")
      base-checkbox(id="setting_player_auto_clean_played_list" :model-value="appSetting['player.isAutoCleanPlayedList']" :label="$t('setting__play_auto_clean_played_list')" @update:model-value="updateSetting({'player.isAutoCleanPlayedList': $event})")
      common-setting-help-icon(:text="$t('setting__play_auto_clean_played_list_tip')" :label="$t('setting__play_auto_clean_played_list')")
    //- 一揽子容错总闸：关掉后出链 5s 切歌 / 卡顿 3s 跳 / error 事件切歌 / URL 刷新 100s 计时器四条同时失效
    .gap-top(data-setting-key="player.autoSkipOnError")
      base-checkbox(id="setting_player_auto_skip_on_error" :model-value="appSetting['player.autoSkipOnError']" :label="$t('setting__play_auto_skip_on_error')" @update:model-value="updateSetting({'player.autoSkipOnError': $event})")
      common-setting-help-icon(:text="$t('setting__play_auto_skip_on_error_tip')" :label="$t('setting__play_auto_skip_on_error')")
</template>

<script>
import { appSetting, updateSetting } from '@renderer/store/setting'
import { setPowerSaveBlocker } from '@renderer/core/player/utils'
import { isPlay } from '@renderer/store/player/state'

/** 播放 → 播放行为（`play_behavior`）：5 项全部来自 SettingPlay.vue 顶层（原是一堆裸开关）。 */
export default {
  name: 'PlayBehavior',
  setup() {
    const handleUpdatePowerSaveBlocker = (enabled) => {
      if (enabled) {
        if (isPlay.value) setPowerSaveBlocker(true, true)
      } else {
        setPowerSaveBlocker(false, true)
      }
      updateSetting({ 'player.powerSaveBlocker': enabled })
    }

    return {
      appSetting,
      updateSetting,
      handleUpdatePowerSaveBlocker,
    }
  },
}
</script>
