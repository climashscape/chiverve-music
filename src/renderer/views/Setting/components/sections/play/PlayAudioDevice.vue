<template lang="pug">
dd
  //- 帮助图标挂在分组标题上：设备选择那一项没有独立文案行（`setting__play_mediaDevice` 就是本组标题）
  h3#play_audio_device
    | {{ $t('setting__play_audio_device_title') }}
    common-setting-help-icon(:text="$t('setting__play_mediaDevice_tip')" :label="$t('setting__play_audio_device_title')")
  div
    //- 选定的输出设备 id（default = 系统默认）；与高级音频特性互斥：本次启动已启用音效/可视化/最大声道时改不动
    //- 这一项没有独立标签行：它的文案（`setting__play_mediaDevice`）就是本组标题，再写一遍是同文重复
    div.gap-top(data-setting-key="player.mediaDeviceId")
      base-selection.gap-left(v-model="mediaDeviceId" :list="mediaDevices" item-key="deviceId" item-name="label" @change="handleMediaDeviceIdChnage")
    //- 开启时若已选非默认设备会被强制重置为 default；与音效/可视化互斥
    .gap-top(data-setting-key="player.isMaxOutputChannelCount")
      base-checkbox(id="setting_player_isMaxOutputChannelCount" :model-value="isMaxOutputChannelCount" :label="$t('setting__play_max_output_channel_count')" @update:model-value="handleUpdateMaxOutputChannelCount")
      common-setting-help-icon(:text="$t('setting__play_max_output_channel_count_tip')" :label="$t('setting__play_max_output_channel_count')")
    //- 播放中拔/换设备时立即暂停
    .gap-top(data-setting-key="player.isMediaDeviceRemovedStopPlay")
      base-checkbox(id="setting_player_isMediaDeviceRemovedStopPlay" :model-value="appSetting['player.isMediaDeviceRemovedStopPlay']" :label="$t('setting__play_mediaDevice_remove_stop_play')" @update:model-value="updateSetting({'player.isMediaDeviceRemovedStopPlay': $event})")
</template>

<script>
import { ref, onBeforeUnmount, watch } from '@common/utils/vueTools'
import { hasInitedAdvancedAudioFeatures, setMediaDeviceId } from '@renderer/plugins/player'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, saveMediaDeviceId, updateSetting } from '@renderer/store/setting'

/** 播放 → 音频输出（`play_audio_device`）：从 SettingPlay.vue 搬来（设备列表 + 两个互斥相关的开关）。 */
export default {
  name: 'PlayAudioDevice',
  setup() {
    const t = useI18n()

    const mediaDevices = ref([])
    const getMediaDevice = async() => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      let audioDevices = devices.filter(device => device.kind === 'audiooutput')
      mediaDevices.value = audioDevices
    }
    void getMediaDevice()

    navigator.mediaDevices.addEventListener('devicechange', getMediaDevice)
    onBeforeUnmount(() => {
      navigator.mediaDevices.removeEventListener('devicechange', getMediaDevice)
    })

    const mediaDeviceId = ref(appSetting['player.mediaDeviceId'])
    const handleMediaDeviceIdChnage = async() => {
      if (hasInitedAdvancedAudioFeatures()) {
        await dialog({
          message: t('setting__play_media_device_error_tip'),
          confirmButtonText: t('alert_button_text'),
        })
        mediaDeviceId.value = appSetting['player.mediaDeviceId']
      } else if (appSetting['player.audioVisualization']) {
        const confirm = await dialog.confirm({
          message: t('setting__play_media_device_tip'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        })
        if (confirm) {
          updateSetting({
            'player.audioVisualization': false,
            'player.mediaDeviceId': mediaDeviceId.value,
          })
        } else {
          mediaDeviceId.value = appSetting['player.mediaDeviceId']
        }
      } else {
        appSetting['player.mediaDeviceId'] = mediaDeviceId.value
      }
    }
    watch(() => appSetting['player.mediaDeviceId'], val => {
      mediaDeviceId.value = val
    })

    const isMaxOutputChannelCount = ref(appSetting['player.isMaxOutputChannelCount'])
    const handleUpdateMaxOutputChannelCount = async(enabled) => {
      isMaxOutputChannelCount.value = enabled
      if (appSetting['player.mediaDeviceId'] != 'default') {
        const confirm = await dialog.confirm({
          message: t('setting__play_advanced_audio_features_tip'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        })
        if (!confirm) {
          isMaxOutputChannelCount.value = false
          return
        }
        await setMediaDeviceId('default').catch(_ => _)
        saveMediaDeviceId('default')
      }
      updateSetting({ 'player.isMaxOutputChannelCount': enabled })
    }

    return {
      appSetting,
      updateSetting,
      mediaDevices,
      mediaDeviceId,
      handleMediaDeviceIdChnage,
      isMaxOutputChannelCount,
      handleUpdateMaxOutputChannelCount,
    }
  },
}
</script>
