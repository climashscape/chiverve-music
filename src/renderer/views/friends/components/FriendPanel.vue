<template>
  <user-list :state="state" :total-text="totalText" @login="openLoginModal" @load-more="loadMore" />
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { openLoginModal } from '@renderer/store/qqAuth/action'
import UserList from './UserList.vue'
import { totalTextOf, useUserList } from '../useUserList'

/**
 * 好友 Tab：QQ 音乐侧的好友关系（只读）。
 *
 * 与关注/粉丝两条路走的**不是同一个接口**（`music.homepage.Friendship/GetFriendList`，
 * 页码 0 起、服务端不给总数），细节与实测记录见 `tx/user.js` 的 `getFriends`。
 * ⚠️ 2026-09-26 探针时本账号 0 好友、`Friends` 返回 `null`，**条目字段名尚未实证**——
 * 真机出数据后按实测收紧 `tx/user.js` 的 `toUserInfo`。
 */
export default {
  name: 'FriendsFriendPanel',
  components: { UserList },
  setup() {
    const { state, loadFirst, loadMore } = useUserList('friend')
    void loadFirst()

    return {
      state,
      loadMore,
      openLoginModal,
      // 服务端不给 Total → 这行恒为空（`totalTextOf` 里判的），保留调用以便将来接口补上就自动显示
      totalText: computed(() => totalTextOf(state)),
    }
  },
}
</script>
