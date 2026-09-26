<template>
  <user-list :state="state" :total-text="totalText" @login="openLoginModal" @load-more="loadMore" />
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { openLoginModal } from '@renderer/store/qqAuth/action'
import UserList from './UserList.vue'
import { totalTextOf, useUserList } from '../useUserList'

/**
 * 关注 Tab：**我关注的用户**（只读）。
 *
 * 与「我的收藏 → 歌手」不是一回事：那边是 `GetFollowSingerList`（关注的歌手），
 * 这边是 `GetFollowUserList`（关注的人），服务端分开计数（实测 603 + 9 ≈ 主页的 FollowNum=614）。
 */
export default {
  name: 'FriendsFollowPanel',
  components: { UserList },
  setup() {
    const { state, loadFirst, loadMore } = useUserList('follow')
    // 切进这个 Tab 才挂载、才取数（index.vue 用 v-if），所以这里直接拉第一页
    void loadFirst()

    return {
      state,
      loadMore,
      openLoginModal,
      totalText: computed(() => totalTextOf(state)),
    }
  },
}
</script>
