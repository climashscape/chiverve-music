<template lang="pug">
dd
  h3#play_stability {{ $t('setting__play_stability_title') }}
  div
    //- 本组总说明：单位 / 量程 / 生效前提（9 个阈值都只在「播放错误时自动切换歌曲」开着时才起作用）
    .p.small {{ $t('setting__play_stability_group_tip') }}
    //- 三档失败策略（单选组，同 name）：retry（默认 = 改造前行为）/ degrade（降档重取）/ error（不重试）
    .gap-top(data-setting-key="player.onUrlFailStrategy")
      .p.small
        | {{ $t('setting__play_on_url_fail_strategy') }}
        svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__play_on_url_fail_strategy_tip')" :title="$t('setting__play_on_url_fail_strategy_tip')")
      div
        base-checkbox.gap-left(
          v-for="item in failStrategyList" :id="`setting_play_on_url_fail_strategy_${item}`" :key="item"
          name="setting_play_on_url_fail_strategy" need :model-value="appSetting['player.onUrlFailStrategy']" :value="item"
          :label="$t(`setting__play_on_url_fail_strategy_${item}`)"
          @update:model-value="updateSetting({'player.onUrlFailStrategy': $event})")
    //- 下面 8 项都是数值输入：落盘防抖 500ms（同 SettingOpenAPI 的端口输入），越界在 setNumber 里夹取
    .gap-top(v-for="item in numberItems" :key="item.key" :data-setting-key="item.key")
      .p.small
        | {{ $t(item.i18nKey) }}
        svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t(item.helpI18nKey)" :title="$t(item.helpI18nKey)")
      div
        base-input(:class="$style.numInput" type="number" :model-value="appSetting[item.key]" :placeholder="$t(item.i18nKey)" @update:model-value="setNumber(item.key, $event)")
</template>

<script>
import { debounce } from '@common/utils/common'
import { appSetting, updateSetting } from '@renderer/store/setting'

/**
 * 播放 → 播放稳定性（`play_stability`，设置页重构票 06）：把原来写死在播放核心里的 9 个阈值
 * 与 1 个隐式失败策略做成设置项。默认值 = 改造前的硬编码常量，所以不动这些项时播放行为与改前一致。
 *
 * 量程（票 06 定：时长类 1–600 秒、步进 1–20%），越界在这里夹取后落盘：
 * - 时长类下限 1 秒：0 会让对应的定时器变成「立即触发」（刷新/跳过变成风暴），1 秒是最短的可用间隔；
 * - 时长类上限 600 秒：10 分钟已经比绝大多数歌都长，再大等于把这些容错机制关掉一半；
 * - `player.retryUrlMaxNum` 下限 0（= 不刷新 URL，与策略选 error 的取流行为一致）、上限 10 次：
 *   每次刷新都要重新走一遍签名取流，超过 10 次说明这首歌整条链路都不通，再刷只是拖长等待；
 * - `player.volumeStep` 下限 1%（0 会让音量快捷键完全没反应）、上限 20%（一次调五分之一，
 *   再大就在静音与满音量之间来回跳，快捷键失去意义）。
 */
export default {
  name: 'PlayStability',
  setup() {
    const failStrategyList = ['retry', 'degrade', 'error']
    const numberItems = [
      // 顺序 = settingMetadata 的 play_stability.items 顺序（搜索结果与页面顺序都照它）；
      // helpI18nKey 与元数据逐条对应（卡顿跳转的上下限共用一条，讲的是同一段区间）
      { key: 'player.retryUrlMaxNum', i18nKey: 'setting__play_retry_url_max_num', helpI18nKey: 'setting__play_retry_url_max_num_tip', min: 0, max: 10 },
      { key: 'player.retryUrlDelay', i18nKey: 'setting__play_retry_url_delay', helpI18nKey: 'setting__play_retry_url_delay_tip', min: 1, max: 600 },
      { key: 'player.getUrlTimeout', i18nKey: 'setting__play_get_url_timeout', helpI18nKey: 'setting__play_get_url_timeout_tip', min: 1, max: 600 },
      { key: 'player.errorSkipDelay', i18nKey: 'setting__play_error_skip_delay', helpI18nKey: 'setting__play_error_skip_delay_tip', min: 1, max: 600 },
      { key: 'player.stallSkipThreshold', i18nKey: 'setting__play_stall_skip_threshold', helpI18nKey: 'setting__play_stall_skip_threshold_tip', min: 1, max: 600 },
      { key: 'player.stallSkipMin', i18nKey: 'setting__play_stall_skip_min', helpI18nKey: 'setting__play_stall_skip_range_tip', min: 1, max: 600 },
      { key: 'player.stallSkipMax', i18nKey: 'setting__play_stall_skip_max', helpI18nKey: 'setting__play_stall_skip_range_tip', min: 1, max: 600 },
      { key: 'player.skipStepSeconds', i18nKey: 'setting__play_skip_step_seconds', helpI18nKey: 'setting__play_skip_step_seconds_tip', min: 1, max: 600 },
      { key: 'player.volumeStep', i18nKey: 'setting__play_volume_step', helpI18nKey: 'setting__play_volume_step_tip', min: 1, max: 20 },
    ]
    const ranges = new Map(numberItems.map(item => [item.key, item]))

    const setNumber = debounce((key, value) => {
      // 输入框被清空时 Number('') 是 0 —— 不落盘，免得「擦掉重打」的中间态把阈值写成下限
      if (!value) return
      const num = Number(value)
      if (!Number.isFinite(num)) return
      const { min, max } = ranges.get(key)
      updateSetting({ [key]: Math.min(Math.max(Math.trunc(num), min), max) })
    }, 500)

    return {
      appSetting,
      updateSetting,
      failStrategyList,
      numberItems,
      setNumber,
    }
  },
}
</script>

<style lang="less" module>
.numInput {
  width: 120px;
}
</style>
