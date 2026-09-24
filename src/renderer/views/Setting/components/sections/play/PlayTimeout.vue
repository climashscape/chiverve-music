<template lang="pug">
dd
  h3#play_timeout {{ $t('setting__play_timeout') }}
  div
    //- 定时到点：开 = 等本曲放完自然停；关 = 立即暂停（原来只有弹窗里有这个开关，附 B1 收进本组）
    .gap-top(data-setting-key="player.waitPlayEndStop")
      base-checkbox(id="setting_play_timeout_end" :model-value="appSetting['player.waitPlayEndStop']" :label="$t('play_timeout_end')" @update:model-value="updateSetting({'player.waitPlayEndStop': $event})")
    //- 时长（分钟，1–1440）：票 04 救活的 `player.waitPlayEndStopTime`。这里是它唯一的**设置项**形态，
    //- 弹窗里那个输入框改的是同一个值（校验口径也共用 `normalizeTimeoutStopMinutes`，见 timeoutStop.ts），
    //- 启动时 `restoreTimeoutStop` 拿它重新武装倒计时。
    div.gap-top(data-setting-key="player.waitPlayEndStopTime")
      .p.small
        | {{ $t('setting__play_timeout_time') }}
        svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__play_timeout_time_tip')" :title="$t('setting__play_timeout_time_tip')")
      div
        base-input(:class="$style.numInput" type="number" :model-value="appSetting['player.waitPlayEndStopTime']" :placeholder="$t('setting__play_timeout_time')" @update:model-value="setWaitTime")
    //- 「开始 / 取消定时」按钮 + 当前剩余时间：弹窗仍作为开始 / 取消的入口（它也带时长输入，同值）
    .p.gap-top
      base-btn.btn(min @click="isShowPlayTimeoutModal = true") {{ $t('setting__play_timeout') }} {{ timeLabel ? ` (${timeLabel})` : '' }}

PlayTimeoutModal(v-model="isShowPlayTimeoutModal")
</template>

<script>
import { ref } from '@common/utils/vueTools'
import { debounce } from '@common/utils'
import { normalizeTimeoutStopMinutes, useTimeout } from '@renderer/core/player/timeoutStop'
import { appSetting, updateSetting } from '@renderer/store/setting'

import PlayTimeoutModal from '../../PlayTimeoutModal.vue'

/**
 * 播放 → 定时暂停（`play_timeout`）：按钮原来在 SettingBasic.vue（基本设置节）、开关在
 * PlayTimeoutModal.vue——附 B1 把两者收进本组，弹窗继续作为时长输入 + 开始/取消的入口。
 *
 * 时长（`player.waitPlayEndStopTime`）在票 04 前是死设置（只有弹窗自己读写），现在进本组做正常设置项：
 * 落盘防抖 500ms（同本节其它数值项），空 / 非法输入不落盘——避免「擦掉重打」的中间态把存值写没；
 * 要停掉正在跑的倒计时用弹窗里的「取消定时」。
 */
export default {
  name: 'PlayTimeout',
  components: {
    PlayTimeoutModal,
  },
  setup() {
    const isShowPlayTimeoutModal = ref(false)
    const { timeLabel } = useTimeout()

    const setWaitTime = debounce(value => {
      const text = normalizeTimeoutStopMinutes(value)
      if (!text) return
      // 存值与弹窗落盘的是同一种形态（数字分钟），别在这里改写成字符串
      if (appSetting['player.waitPlayEndStopTime'] != text) updateSetting({ 'player.waitPlayEndStopTime': Number(text) })
    }, 500)

    return {
      appSetting,
      updateSetting,
      isShowPlayTimeoutModal,
      timeLabel,
      setWaitTime,
    }
  },
}
</script>

<style lang="less" module>
.numInput {
  width: 90px;
}
</style>
