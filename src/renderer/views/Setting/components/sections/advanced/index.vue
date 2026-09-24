<template lang="pug">
dt#advanced {{ $t('setting__advanced') }}
dd
  h3#advanced_open_api {{ $t('setting__open_api') }}
  div
    SettingAdvancedOpenApi
dd
  h3#advanced_sync {{ $t('setting__sync') }}
  div
    SettingAdvancedSync
dd
  h3#advanced_sound_effect {{ $t('setting__advanced_sound_effect_title') }}
  div
    SettingAdvancedSoundEffect
dd
  h3#advanced_experimental {{ $t('setting__advanced_experimental_title') }}
  div
    .p
      base-checkbox(
        id="setting_player_audio_visualization" data-setting-key="player.audioVisualization"
        :model-value="appSetting['player.audioVisualization']" :label="$t('audio_visualization')"
        @update:model-value="handleUpdateAudioVisualization"
      )
      common-setting-help-icon(:text="$t('setting__advanced_audio_visualization_tip')" :label="$t('audio_visualization')")
</template>

<script>
import { useI18n } from '@renderer/plugins/i18n'
import { dialog } from '@renderer/plugins/Dialog'
import { setMediaDeviceId } from '@renderer/plugins/player'
import { appSetting, saveMediaDeviceId, setEnableAudioVisualization } from '@renderer/store/setting'

import SettingAdvancedOpenApi from './OpenApiBlock.vue'
import SettingAdvancedSync from './SyncBlock.vue'
import SettingAdvancedSoundEffect from './SoundEffectBlock.vue'

/**
 * 高级（`advanced`）节：开放 API / 数据同步 / 音效与均衡器 / 实验性四组，照元数据顺序渲染。
 *
 * 「实验性」目前只有 `player.audioVisualization` 一项（媒体键缺口见归类表附 C.3，键名还没定）。
 * 它的开关原来只长在播放详情页左下角的按钮上（审计的「浮层入口 26 个」之一），本票把入口补到设置页。
 * **副作用照抄浮层按钮**（`PlayDetail/components/ControlBtns.vue`）：开启前若音频输出设备不是默认，
 * 先确认再重置为默认——音频可视化与自定义输出设备互斥，绕过这个确认会直接没声音。
 */
export default {
  name: 'SettingSectionAdvanced',
  components: {
    SettingAdvancedOpenApi,
    SettingAdvancedSync,
    SettingAdvancedSoundEffect,
  },
  setup() {
    const t = useI18n()

    const handleUpdateAudioVisualization = async(enabled) => {
      if (enabled && appSetting['player.mediaDeviceId'] != 'default') {
        const confirm = await dialog.confirm({
          message: t('setting__player_audio_visualization_tip'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        })
        if (!confirm) return
        await setMediaDeviceId('default').catch(_ => _)
        saveMediaDeviceId('default')
      }
      setEnableAudioVisualization(enabled)
    }

    return {
      appSetting,
      handleUpdateAudioVisualization,
    }
  },
}
</script>
