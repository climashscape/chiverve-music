<template>
  <li :class="$style.card">
    <div :class="$style.avatarBox">
      <img v-if="item.img" :class="$style.avatar" loading="lazy" decoding="async" :src="item.img" alt="">
      <svg v-else :class="$style.avatarEmpty" viewBox="0 0 448 456"><use xlink:href="#icon-user" /></svg>
    </div>
    <div :class="$style.info">
      <h4 :class="$style.name" :title="item.name">{{ item.name }}</h4>
      <p :class="$style.meta">
        <span v-if="stateLabel" :class="$style.badge">{{ stateLabel }}</span>
        <span v-if="item.fans > 0">{{ $t('friends__fans_count', { num: item.fans }) }}</span>
      </p>
      <p v-if="item.desc" :class="$style.desc" :title="item.desc">{{ item.desc }}</p>
    </div>
  </li>
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import type { FriendUser } from '../useUserList'

/**
 * 用户条目（粉丝 / 关注 / 好友三个 Tab 共用）——**纯展示，不可点**。
 *
 * 为什么不做点击跳转：条目里没有可用的 mid（`MID` 实测恒为空串），只有 `EncUin`，
 * 而本仓库没有「用户主页」路由、`EncUin` 也没有已知的站内路由可去（见 `tx/user.js` 的
 * `toUserInfo` 与 `NOTES-friends.md`）。等探到用户主页的形态再接，别拿 `EncUin` 硬拼。
 *
 * 关注态用一句话表达（比两个布尔好读）：互相关注 / 已关注 / 关注了你。
 * 图标：头像缺失时用全局 sprite 的 `#icon-user`（同 `ProfileCard`）。
 */
export default {
  name: 'FriendsUserCard',
  props: {
    item: {
      type: Object,
      required: true,
    },
  },
  setup(props: { item: FriendUser }) {
    const stateLabel = computed(() => {
      if (props.item.isFollow && props.item.isFollowed) return window.i18n.t('friends__mutual' as any)
      if (props.item.isFollow) return window.i18n.t('friends__followed' as any)
      if (props.item.isFollowed) return window.i18n.t('friends__follows_you' as any)
      return ''
    })

    return { stateLabel }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.card {
  display: flex;
  align-items: center;
  // 宽窗口下两列、窄窗口落一列（flex-wrap 在 `.users` 上）。
  // padding 吃在宽度里 → 必须 border-box（默认 content-box 会撑出 16px）
  box-sizing: border-box;
  width: 260px;
  margin: 0 12px 8px 0;
  padding: 8px;
  border-radius: @radius-border;
  transition: background-color @transition-fast;

  &:hover {
    background-color: var(--color-button-background-hover);
  }
}
.avatarBox {
  flex: none;
  width: 46px;
  height: 46px;
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
  // flex: auto + min-width: 0 是 ellipsis 的前提（少了任何一个，长昵称会把卡片撑破）
  flex: auto;
  min-width: 0;
  padding-left: 10px;
}
.name {
  font-size: 13px;
  .mixin-ellipsis-1();
}
.meta {
  margin-top: 3px;
  font-size: 11px;
  color: var(--color-font-label);

  span {
    margin-right: 8px;
  }
}
.badge {
  padding: 0 6px;
  border-radius: @radius-border;
  background-color: var(--color-primary-alpha-800);
  color: var(--color-primary);
}
.desc {
  margin-top: 3px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
</style>
