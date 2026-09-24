<template lang="pug">
dd
  h3#play_timeout {{ $t('setting__play_timeout') }}
  div
    //- 定时到点：开 = 等本曲放完自然停；关 = 立即暂停（原来只有弹窗里有这个开关，附 B1 收进本组）
    .gap-top(data-setting-key="player.waitPlayEndStop")
      base-checkbox(id="setting_play_timeout_end" :model-value="appSetting['player.waitPlayEndStop']" :label="$t('play_timeout_end')" @update:model-value="updateSetting({'player.waitPlayEndStop': $event})")
    //- ③「开始/取消定时」按钮 + 当前剩余时间：弹窗（复用 PlayTimeoutModal）同时是**时长输入**的
    //- 唯一控件——元数据里 `player.waitPlayEndStopTime`（numberInput）的输入框就在它里面，
    //- 本组不另放一个（会写出第二套校验；票 04 救活这个值时才决定它落到哪里）
    .p.gap-top
      base-btn.btn(min @click="isShowPlayTimeoutModal = true") {{ $t('setting__play_timeout') }} {{ timeLabel ? ` (${timeLabel})` : '' }}

PlayTimeoutModal(v-model="isShowPlayTimeoutModal")
</template>

<script>
import { ref } from '@common/utils/vueTools'
import { useTimeout } from '@renderer/core/player/timeoutStop'
import { appSetting, updateSetting } from '@renderer/store/setting'

import PlayTimeoutModal from '../../PlayTimeoutModal.vue'

/**
 * 播放 → 定时暂停（`play_timeout`）：按钮原来在 SettingBasic.vue（基本设置节）、开关在
 * PlayTimeoutModal.vue——附 B1 把两者收进本组，弹窗继续作为时长输入 + 开始/取消的入口。
 */
export default {
  name: 'PlayTimeout',
  components: {
    PlayTimeoutModal,
  },
  setup() {
    const isShowPlayTimeoutModal = ref(false)
    const { timeLabel } = useTimeout()

    return {
      appSetting,
      updateSetting,
      isShowPlayTimeoutModal,
      timeLabel,
    }
  },
}
</script>
