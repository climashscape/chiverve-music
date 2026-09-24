<template lang="pug">
dd
  h3#play_defaults {{ $t('setting__play_defaults_title') }}
  div
    //- 音量 0–1：与播放栏音量键是**同一个值**（`useVolume` 监听 appSetting 再应用到播放器），
    //- 量程与步长照浮层滑杆（`VolumeBtn.vue:19` 的 min 0 / max 1 / step 0.01）
    div.gap-top(data-setting-key="player.volume")
      .p.small {{ $t('player__volume') }} {{ Math.trunc(appSetting['player.volume'] * 100) }}%
      div
        base-slider-bar(:value="appSetting['player.volume']" :min="0" :max="1" :step="0.01" @change="setVolume")
    .gap-top(data-setting-key="player.isMute")
      base-checkbox(id="setting_play_defaults_mute" :model-value="appSetting['player.isMute']" :label="$t('player__volume_mute_label')" @update:model-value="updateSetting({ 'player.isMute': $event })")
    //- 倍速 0.5–2.0（浮层滑杆的 50–200 除以 100）；帮助文案与桌面歌词窗共用一条（元数据的 helpI18nKey）
    div.gap-top(data-setting-key="player.playbackRate")
      .p.small
        | {{ $t('player__playback_rate') }} {{ appSetting['player.playbackRate'].toFixed(2) }}x
        common-setting-help-icon(:text="$t('setting__help_shared_with_lyric_window')" :label="$t('player__playback_rate')")
      div
        base-slider-bar(:value="appSetting['player.playbackRate'] * 100" :min="50" :max="200" :step="1" @change="setPlaybackRate")
    .gap-top(data-setting-key="player.preservesPitch")
      base-checkbox(id="setting_play_defaults_preserves_pitch" :model-value="appSetting['player.preservesPitch']" :label="$t('player__playback_preserves_pitch')" @update:model-value="updateSetting({ 'player.preservesPitch': $event })")
    //- 默认播放模式：取值是契约（`player.togglePlayMethod` 的联合类型），界面文案可以改、值不许动
    div.gap-top(data-setting-key="player.togglePlayMethod")
      .p.small
        | {{ $t('setting__play_toggle_play_method') }}
        common-setting-help-icon(:text="$t('setting__play_toggle_play_method_tip')" :label="$t('setting__play_toggle_play_method')")
      div
        base-checkbox.gap-left(
          v-for="item in playMethodList" :id="`setting_play_defaults_method_${item.value}`" :key="item.value"
          name="setting_play_defaults_method" need :model-value="appSetting['player.togglePlayMethod']" :value="item.value" :label="$t(item.label)"
          @update:model-value="updateSetting({ 'player.togglePlayMethod': $event })")
</template>

<script>
import { appSetting, updateSetting } from '@renderer/store/setting'

/**
 * 播放 → 播放控制默认值（`play_defaults`，设置页重构票 05）。
 *
 * 这一组是「只有浮层入口」的 5 个 key 的设置页入口：音量 / 静音 / 倍速 / 音调保持 / 默认播放模式。
 * 写法照播放栏的三个浮层：量程与步长**直接对齐浮层控件**（`VolumeBtn.vue:19`、`PlaybackRateBtn.vue:22`），
 * 值也写同一份 appSetting——浮层与这里的滑杆是同一个值，改哪边另一边立刻跟着动（`useVolume.ts:54`、
 * `usePlaybackRate.ts:40` 的 watch 负责应用到播放器）。
 * 模式取值是 `LX.AppSetting['player.togglePlayMethod']` 的联合类型，文案可改、值不许动。
 */
export default {
  name: 'PlayDefaults',
  setup() {
    const playMethodList = [
      { value: 'listLoop', label: 'player__play_toggle_mode_list_loop' },
      { value: 'random', label: 'player__play_toggle_mode_random' },
      { value: 'list', label: 'player__play_toggle_mode_list' },
      { value: 'singleLoop', label: 'player__play_toggle_mode_single_loop' },
      { value: 'none', label: 'player__play_toggle_mode_off' },
    ]

    const setVolume = (volume) => {
      updateSetting({ 'player.volume': volume })
    }
    // 滑杆给的是 50–200 的整数，落库仍是 0.5–2 的倍率（与浮层同一口径）
    const setPlaybackRate = (rate) => {
      updateSetting({ 'player.playbackRate': Math.round(rate) / 100 })
    }

    return {
      appSetting,
      updateSetting,
      playMethodList,
      setVolume,
      setPlaybackRate,
    }
  },
}
</script>
