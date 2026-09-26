<template>
  <div :class="$style.container" class="scroll">
    <!-- 未登录：给引导而不是「加载失败」——按钮直接开登录弹窗（同设置页「QQ 账号」节的写法） -->
    <div v-if="state.needLogin" :class="$style.center">
      <p :class="$style.tip">{{ $t('user_center__need_login') }}</p>
      <base-btn min @click="$emit('login')">{{ $t('qq_auth__login') }}</base-btn>
    </div>
    <template v-else>
      <!-- 总数：只有关注 / 粉丝给（好友那口服务端不给 Total，见 tx/user.js 的 getFriends） -->
      <p v-if="totalText" :class="$style.total">{{ totalText }}</p>
      <ul v-if="state.list.length" :class="$style.users">
        <user-card v-for="item in state.list" :key="item.id" :item="item" />
      </ul>
      <p v-else :class="$style.tip">{{ state.noItemLabel || $t('no_item') }}</p>
      <!-- 加载更多失败时列表还在（失败了不把已加载的行藏起来），文案单独挂一行 -->
      <p v-if="state.noItemLabel && state.list.length" :class="$style.tip">{{ state.noItemLabel }}</p>
      <!-- 「加载更多」是按钮而不是滚动到底自动翻：关系列表条数不多，手动更省请求 -->
      <div v-if="state.hasMore" :class="$style.more">
        <base-btn min :disabled="state.isLoading" @click="$emit('loadMore')">{{ $t('user_center__load_more') }}</base-btn>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import UserCard from './UserCard.vue'
import type { UserListState } from '../useUserList'

/**
 * 用户列表的展示层（三个 Tab 共用）——**不取数**，状态由 `useUserList` 的调用方传入。
 *
 * 四种状态各自独立：未登录（引导）→ 空 / 加载中（文案）→ 有数据（列表）→ 还有更多（按钮）。
 * 状态对象整个作 prop 传（它是 `reactive` 的，属性变化照常触发重渲染），
 * 这样面板不必把五六个字段一个个拆开传。
 */
export default {
  name: 'FriendsUserList',
  components: { UserCard },
  props: {
    state: {
      type: Object as () => UserListState,
      required: true,
    },
    /** 「共 N 位」那行文案；空串表示不显示（好友列表就没有总数）。 */
    totalText: {
      type: String,
      default: '',
    },
  },
  emits: ['loadMore', 'login'],
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
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
.total {
  padding: 4px 0 6px;
  font-size: 12px;
  color: var(--color-font-label);
}

.users {
  display: flex;
  flex-wrap: wrap;
}

.more {
  padding: 10px 0;
  text-align: center;
}
</style>
