<template>
  <div id="my-playlists" :class="$style.container">
    <playlist-rail :list-id="localListId" :cloud-dir-id="cloudDirId" />
    <!-- 右侧：本地列表用共享的歌曲表；云端歌单用云端那一套（加歌 / 删歌） -->
    <cloud-list-pane v-if="cloudDirId" :key="cloudDirId" :dir-id="cloudDirId" />
    <list-music-table v-else :list-id="localListId" />
  </div>
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { LIST_IDS } from '@common/constants'
import { userLists } from '@renderer/store/list/state'
import PlaylistRail from './components/PlaylistRail/PlaylistRail.vue'
import CloudListPane from './components/CloudListPane.vue'

/**
 * 我的歌单（工单 06）：**所有歌单的归口**——左栏两组，本地自建列表（本地库）与
 * QQ 云端自建歌单（QQ 云端）。写语义不同：前者改本地库，后者改 QQ。
 *
 * 这个文件只是壳：左栏在 components/PlaylistRail/，右侧两块内容各自一个组件。
 *
 * query：`id` = 选中的本地列表（与旧 `/list?id=…` 同名，旧地址重定向进来即可用），
 * `cloud` = 选中的云端歌单 dirId。两者只该有一个生效（左栏切换时会清掉另一个）。
 */

export default {
  name: 'Playlists',
  components: {
    PlaylistRail,
    CloudListPane,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()

    const cloudDirId = computed(() => (route.query.cloud as string | undefined) ?? '')
    // 没指定本地列表时落到第一个自建列表（没有自建列表就落到默认列表，右栏会显示空态）
    const localListId = computed(() => {
      const id = route.query.id as string | undefined
      if (id && (userLists.some(l => l.id === id) || id === LIST_IDS.DEFAULT || id === LIST_IDS.LOVE)) return id
      return userLists[0]?.id ?? LIST_IDS.DEFAULT
    })

    // 归一：地址栏里既没有 id 也没有 cloud 时补一个（否则右栏不知道该显示什么）
    if (route.query.id == null && route.query.cloud == null) {
      void router.replace({ path: route.path, query: { id: localListId.value } })
    }

    return {
      cloudDirId,
      localListId,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  overflow: hidden;
  height: 100%;
  display: flex;
  position: relative;
}
</style>
