<template>
  <div :class="$style.card">
    <div :class="$style.avatarBox">
      <img v-if="profile.avatar" :class="$style.avatar" :src="profile.avatar" alt="">
      <svg v-else :class="$style.avatarEmpty" viewBox="0 0 448 456"><use xlink:href="#icon-user" /></svg>
    </div>
    <div :class="$style.info">
      <h2 :class="$style.nick">{{ profile.name || $t('user_center__not_logged_in') }}</h2>
      <p :class="$style.meta">
        <span v-if="vip.hires || vip.dolby" :class="$style.vipBadge">{{ $t('user_center__vip') }}</span>
        <span>{{ $t('user_center__follow') }} {{ profile.follow }}</span>
        <span>{{ $t('user_center__fans') }} {{ profile.fans }}</span>
        <span>{{ $t('user_center__visitor') }} {{ profile.visitor }}</span>
      </p>
      <p v-if="labels.profile" :class="$style.tip">{{ labels.profile }}</p>
    </div>
    <base-btn min :disabled="isLoading" @click="handleRefresh">{{ $t('user_center__refresh') }}</base-btn>
  </div>
</template>

<script lang="ts">
import { isLoading, labels, profile, vip } from '@renderer/store/user/state'
import { initUserCenter } from '@renderer/store/user/action'

/**
 * 我的音乐页 → 账号卡（昵称/头像/关注粉丝访客 + VIP + 刷新）。
 *
 * 刷新走 `initUserCenter(true)`：整页数据（概览 + 基因）一起重拉，与页面上唯一的
 * 那个刷新按钮语义一致——只刷卡片会留下「卡片新、基因旧」的错位。
 */
export default {
  name: 'UserCenterProfileCard',
  setup() {
    const handleRefresh = () => { void initUserCenter(true) }

    return {
      profile,
      vip,
      labels,
      isLoading,
      handleRefresh,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.card {
  // 页面根不再带左右 padding（工单 26）：左右留白由本卡片与滚动区各自出。
  // 右边 28px = 22px 页面留白 + 6px 滚动条宽度（全局 `.scroll` 的 ::-webkit-scrollbar）：
  // 6px 经典滚动条吃掉的是滚动区内容右边缘那一条，本卡片不在滚动区里，不让出这 6px
  // 的话分割线会比下方内容宽出一条滚动条、正好吊在滚动条上方（实测 5.78px）。
  // 口径同全局 `.thead` 的 `padding-right: 6px`（表头给滚动条让位）。
  margin: 0 28px 0 22px;
  // 页面根是 flex 列：这张卡固定在顶部不滚（`flex: none` + 下面的内容区 `overflow-y: auto`）
  flex: none;
  display: flex;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}
.avatarBox {
  flex: none;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  overflow: hidden;
  background-color: var(--color-button-background);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatarEmpty {
  width: 55%;
  height: 55%;
  color: var(--color-font-label);
}
.info {
  flex: auto;
  min-width: 0;
  padding: 0 14px;
}
.nick {
  font-size: 17px;
  font-weight: 600;
  .mixin-ellipsis-1();
}
.meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-font-label);

  span {
    margin-right: 12px;
  }
}
.vipBadge {
  padding: 1px 6px;
  border-radius: @radius-border;
  background-color: var(--color-primary-alpha-800);
  color: var(--color-primary);
}
.tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
