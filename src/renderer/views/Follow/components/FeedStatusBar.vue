<template>
  <div :class="$style.bar">
    <div :class="$style.status">
      <span :class="$style.label">{{ $t('follow__last_check') }}</span>
      <!-- 从未成功过就说「从未检查」，别画一个假时间（`lastSuccessAt` 只反映成功那一次） -->
      <span :class="$style.value">{{ lastSuccessAt == null ? $t('follow__never_checked') : lastCheckText }}</span>
      <!-- 失败不弹窗、不打断播放，只在这里留一句（连续失败降频由检测那边管） -->
      <span v-if="errorReason" :class="$style.error">{{ $t('follow__check_failed', { reason: errorReason }) }}</span>
    </div>
    <div :class="$style.actions">
      <span :class="$style.monitored">{{ $t('follow__monitored', { count: monitoredCount }) }}</span>
      <!-- 检查中禁用并换文案：按钮是唯一的进行中反馈（没有 toast/notification 这套东西） -->
      <base-btn min :disabled="isChecking" @click="$emit('refresh')">
        {{ isChecking ? $t('follow__checking') : $t('follow__refresh') }}
      </base-btn>
    </div>
  </div>
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { dateFormat2 } from '@renderer/utils'

/**
 * 页面顶部的状态行（关注动态）：上次检查时间与结果 + 监控中的歌手数 + 手动刷新。
 *
 * 纯展示：状态由页面从 store 传进来，**不在这里取数**；刷新只 `emit('refresh')`，
 * 动作的接线在 `core/followFeed`（另一张票）。
 */
export default {
  name: 'FollowFeedStatusBar',
  props: {
    /** 最近一次**成功**覆盖的时间戳（ms）；`null` = 从未成功过 */
    lastSuccessAt: {
      type: Number as () => number | null,
      default: null,
    },
    /** 最近一次失败的原因；空串 = 本次会话没失败过 */
    errorReason: {
      type: String,
      default: '',
    },
    monitoredCount: {
      type: Number,
      default: 0,
    },
    isChecking: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['refresh'],
  setup(props: { lastSuccessAt: number | null }) {
    // 文案走 i18n（`date_format_*` 那几个 key），所以只在拿到时间戳时才算
    const lastCheckText = computed(() => props.lastSuccessAt == null ? '' : dateFormat2(props.lastSuccessAt))

    return {
      lastCheckText,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 10px;
  font-size: 12px;
  color: var(--color-font-label);
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.value {
  color: var(--color-font);
}

// 失败原因用正文色而不是标签色，好从这一行里略微分出来。**不能自造 error/warning 语义 token**
// ——本仓库的 :root 里没有（§2.5.1 第 3 条），主色系也没有「错误」含义的档位
.error {
  color: var(--color-font);
  .mixin-ellipsis-1();
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.monitored {
  white-space: nowrap;
}
</style>
