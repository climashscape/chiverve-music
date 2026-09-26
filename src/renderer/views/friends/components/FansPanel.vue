<template>
  <user-list :state="state" :total-text="totalText" @login="openLoginModal" @load-more="loadMore" />
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { openLoginModal } from '@renderer/store/qqAuth/action'
import UserList from './UserList.vue'
import { totalTextOf, useUserList } from '../useUserList'

/**
 * 粉丝 Tab：关注了我的人（只读）。
 *
 * 条目的 `isFollow` = 我有没有回关——界面上落成「互相关注 / 已关注 / 关注了你」三种文案
 * （文案在 `UserCard.vue`）。**不做回关**：关注关系的写端点在 2026-09-25 的探针里没找到
 * （见 `scripts/verify/artifacts/2026-09-25-qq-probe/NOTES.md` 第 1 节）。
 */
export default {
  name: 'FriendsFansPanel',
  components: { UserList },
  setup() {
    const { state, loadFirst, loadMore } = useUserList('fans')
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
