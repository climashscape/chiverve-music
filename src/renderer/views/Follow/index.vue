<template>
  <div :class="$style.container">
    <!-- 状态栏与时间线共同收进 max-width：大窗口下不再把行拉到整屏宽 -->
    <div :class="$style.inner">
      <!-- 顶部状态行常显（三种页面状态都画它）：「上次检查 + 结果」「手动刷新」「监控中的歌手数」 -->
      <feed-status-bar
        :last-success-at="lastSuccessAt"
        :error-reason="errorReason"
        :monitored-count="monitoredCount"
        :is-checking="isChecking"
        @refresh="refresh"
      />
      <div :class="$style.content" class="scroll">
        <!-- 未登录：给登录引导（不是空列表，也不是报错）。文案与按钮**复用既有 key**
             （设置页「QQ 账号」节与收藏页/粉丝页用的是同两条），不另起一份 -->
        <div v-if="state.isLogin === false" :class="$style.center">
          <p :class="$style.tip">{{ $t('user_center__need_login') }}</p>
          <base-btn min @click="openLoginModal">{{ $t('qq_auth__login') }}</base-btn>
        </div>
        <p v-else-if="state.isLoading" :class="$style.tip">{{ $t('list__loading') }}</p>
        <!-- 已登录但还没有条目：把「已开始监控 N 位歌手」说出来，别让用户以为它坏了
             （首次运行的存量作品不产生条目，见 spec） -->
        <p v-else-if="!items.length" :class="$style.tip">{{ $t('follow__empty', { count: monitoredCount }) }}</p>
        <feed-timeline v-else :items="items" :fresh-ids="freshIds" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { openLoginModal } from '@renderer/store/qqAuth/action'
import FeedStatusBar from './components/FeedStatusBar.vue'
import FeedTimeline from './components/FeedTimeline.vue'
import { useFollowFeed } from './useFollowFeed'

/**
 * 关注动态（`/follow`）：我关注的 QQ 音乐歌手的新歌 / 新专时间线。
 *
 * 这个文件只是壳——三种状态（未登录 / 空 / 有时间线）各画什么在这里，取数全在
 * `useFollowFeed.ts`，两块内容在 `components/` 里。**进页面的副作用**（读库 + 记 freshIds +
 * 未读置已读 / 角标清零）在 `useFollowFeed` 挂载时跑，别在这里再调一次 `openFollowFeed`。
 *
 * 不做的事（按批次划分，都属其它票）：检测与定时器、行上的播放 / 跳转 / 右键菜单。
 */
export default {
  name: 'Follow',
  components: {
    FeedStatusBar,
    FeedTimeline,
  },
  setup() {
    const { state, items, freshIds, monitoredCount, lastSuccessAt, errorReason, isChecking, refresh } = useFollowFeed()

    return {
      state,
      items,
      freshIds,
      monitoredCount,
      lastSuccessAt,
      errorReason,
      isChecking,
      refresh,
      openLoginModal,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  // 根容器带左右 padding 时必须 border-box，否则溢出窗口右侧（AGENTS §2.5.1 第 10 条）
  box-sizing: border-box;
  padding: 16px 22px 0;
  color: var(--color-font);
  display: flex;
  flex-flow: column nowrap;
}

// 内容收口：关注动态是线性阅读的列表，宽窗口下通栏会把行拉得很长（2026-09-27 视觉重做）
.inner {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-flow: column nowrap;
  flex: auto;
  min-height: 0;
}

.content {
  flex: auto;
  min-height: 0;
  overflow-y: auto;
}

.center {
  padding-top: 40px;
  text-align: center;
}
.tip {
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-font-label);
}
</style>
