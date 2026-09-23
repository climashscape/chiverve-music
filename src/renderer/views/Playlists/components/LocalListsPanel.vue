<template>
  <div :class="$style.container">
    <local-rail :list-id="listId" />
    <!-- 一个自建列表都没有：右栏明说没得选，而不是把别的列表（试听列表 / 我的收藏）塞进来
         （工单 07 / ADR 0006；左栏另有自己的提示条） -->
    <div v-if="!listId" :class="$style.empty">{{ $t('playlists__local_empty') }}</div>
    <list-music-table v-else :list-id="listId" />
  </div>
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { LIST_IDS } from '@common/constants'
import { userLists } from '@renderer/store/list/state'
import LocalRail from './PlaylistRail/LocalRail.vue'
import ListMusicTable from '@renderer/components/common/ListMusicTable/index.vue'

/**
 * 我的歌单 →「本地歌单」tab（工单 09）：左栏本地自建列表 + 右栏该列表的歌曲表。
 *
 * 这个文件只是壳：左栏在 `PlaylistRail/LocalRail.vue`，右栏是共享的 `ListMusicTable`。
 * 本地列表的数据在本地库（list store），没有要在这里取的数，选中项由 `route.query.id` 派生。
 *
 * 没指定本地列表时落到第一个自建列表。**不回落到试听列表**——它已从界面退场（工单 07 / ADR 0006）；
 * 一个自建列表都没有时返回空串，右栏显示空态文案。
 */
export default {
  name: 'PlaylistsLocalPanel',
  components: {
    LocalRail,
    ListMusicTable,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()

    const listId = computed(() => {
      const id = route.query.id as string | undefined
      if (id && (userLists.some(l => l.id === id) || id === LIST_IDS.LOVE)) return id
      return userLists[0]?.id ?? ''
    })

    // 归一：本地 tab 里没有 id 且有可选的本地列表时补一个（地址栏里能看出当前选的是哪一个）。
    // 保留其它键——`tab` 属于页面壳，`cloud` 属于云端 tab（切回去时它的选中项还在）
    if (route.query.id == null && listId.value) {
      void router.replace({ path: route.path, query: { ...route.query, id: listId.value } })
    }

    return {
      listId,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  display: flex;
  flex-flow: row nowrap;
}

// 没有可选本地列表时的空态（右栏）
.empty {
  flex: auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-font-label);
}
</style>
