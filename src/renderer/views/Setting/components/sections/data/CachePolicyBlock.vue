<template lang="pug">
div
  //- 本组总说明：清的是哪张表 / 什么时候清 / 「0」是什么意思（工单要求这两条写进帮助文案）
  .p.small {{ $t('setting__data_cache_policy_group_tip') }}
  .gap-top(data-setting-key="cache.musicUrlKeepDays")
    .p.small
      | {{ $t('setting__data_cache_music_url_keep_days') }}
      common-setting-help-icon(:text="$t('setting__data_cache_music_url_keep_days_tip')" :label="$t('setting__data_cache_music_url_keep_days')")
    div
      base-input(:class="$style.numInput" type="number" :model-value="appSetting['cache.musicUrlKeepDays']" :placeholder="$t('setting__data_cache_music_url_keep_days')" @update:model-value="setNumber('cache.musicUrlKeepDays', $event)")
  .gap-top(data-setting-key="cache.maxSizeMB")
    .p.small
      | {{ $t('setting__data_cache_max_size') }}
      common-setting-help-icon(:text="$t('setting__data_cache_max_size_tip')" :label="$t('setting__data_cache_max_size')")
    div
      base-input(:class="$style.numInput" type="number" :model-value="appSetting['cache.maxSizeMB']" :placeholder="$t('setting__data_cache_max_size')" @update:model-value="setNumber('cache.maxSizeMB', $event)")
  .gap-top
    base-btn.btn(min :disabled="isRecycling" @click="handleRecycle") {{ $t('setting__data_cache_recycle_btn') }}
    span.p.small(v-if="resultText" :class="$style.result") {{ resultText }}
</template>

<script>
import { ref } from '@common/utils/vueTools'
import { debounce, sizeFormate } from '@common/utils/common'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { playMusicInfo } from '@renderer/store/player/state'
import { recycleMusicUrl } from '@renderer/utils/ipc'
import { useI18n } from '@renderer/plugins/i18n'

/**
 * 数据与存储 → 缓存回收策略（`data_cache_policy`，设置页重构票 08）。
 *
 * **只回收 `music_url` 表**（在线取流的 URL 缓存）：列表 / 我喜欢 / 歌单 / 备份 / 已下载的音频文件
 * 都不受影响——挑行（纯函数）与删行全在 worker 侧（`worker/dbService/modules/music_url/recycle.ts`），
 * 本组件只负责取值、点按钮、显示结果。
 *
 * 三件刻意的做法：
 * 1. **「立即回收」必须带上正在播放那首歌的缓存 key 前缀**（`${musicInfo.id}_`，含各档位）。
 *    播放中的 URL 已经在播放器手里，删行本身不会打断播放，但会让下一次取流白跑一次网络；
 *    设置页是在**播放中**被点的，所以这一刻正在播的那几行交给 `keepIdPrefix` 保住（worker 侧一条都不删）。
 * 2. 两个阈值都填 0 时按钮**照样能点**：回收会返回 `skipped`，这里如实提示「不回收」——
 *    「0 = 不自动清 / 不限」的约定在帮助文案里写明（两个 key 的默认值见 `@common/defaultSetting`）。
 * 3. 回收完 `emit('recycled')` 让上面「缓存与清理」那张表的计数重新取数（同节两块，由父组件转发）。
 *
 * 越界夹取：保留天数 0–3650 天（10 年 ≈ 等于不回收）、容量 0–10240 MB（10 GB，
 * 远超真实用量）。**空输入按 0 落盘**——这两个 key 的 0 本身是合法值（= 不自动清 / 不限），
 * 与「播放稳定性」那批阈值（0 越界、空输入直接跳过不落盘）的处理不同，别照抄那边。
 */
export default {
  name: 'SettingDataCachePolicy',
  emits: ['recycled'],
  setup(props, { emit }) {
    const t = useI18n()

    const maxValue = {
      'cache.musicUrlKeepDays': 3650,
      'cache.maxSizeMB': 10240,
    }
    const setNumber = debounce((key, value) => {
      const num = value === '' ? 0 : Number(value)
      if (!Number.isFinite(num)) return
      updateSetting({ [key]: Math.min(Math.max(Math.trunc(num), 0), maxValue[key]) })
    }, 500)

    const isRecycling = ref(false)
    const resultText = ref('')
    const handleRecycle = () => {
      if (isRecycling.value) return
      isRecycling.value = true
      resultText.value = ''
      const musicId = playMusicInfo.musicInfo?.id
      void recycleMusicUrl({
        keepDays: appSetting['cache.musicUrlKeepDays'],
        maxSizeMB: appSetting['cache.maxSizeMB'],
        keepIdPrefix: musicId ? `${musicId}_` : null,
      }).then(result => {
        if (result.skipped || result.bytesAfter == null) {
          resultText.value = t('setting__data_cache_recycle_none')
        } else {
          resultText.value = t('setting__data_cache_recycle_result', { count: result.deleted, size: sizeFormate(result.bytesAfter) })
        }
        emit('recycled')
      }).catch((err) => {
        console.log(err)
        resultText.value = t('setting__data_cache_recycle_failed')
      }).finally(() => {
        isRecycling.value = false
      })
    }

    return {
      appSetting,
      setNumber,
      isRecycling,
      resultText,
      handleRecycle,
    }
  },
}
</script>

<style lang="less" module>
.numInput {
  width: 120px;
}

.result {
  margin-left: 10px;
  font-size: 12px;
  opacity: .7;
}
</style>
