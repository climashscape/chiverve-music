<template>
  <div :class="$style.container">
    <cloud-rail :cloud-dir-id="dirId" />
    <div :class="$style.pane">
      <!-- 卡片没到（createdLists 还在取 / dirId 已失效）就不挂右栏：CloudListPane 取歌要用卡片的
           tid（不是 dirId），提前挂会拿 dirId 当 tid 打一次注定拿不到东西的请求 -->
      <cloud-list-pane v-if="card" :key="dirId" :dir-id="dirId" />
      <p v-else :class="$style.tip">{{ tip }}</p>
    </div>
  </div>
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { useRoute } from '@common/utils/vueRouter'
import { createdLists, labels as userLabels } from '@renderer/store/user/state'
import CloudRail from './PlaylistRail/CloudRail.vue'
import CloudListPane from './CloudListPane.vue'

/**
 * 我的歌单 →「QQ 音乐·歌单」tab（工单 09）：左栏云端自建歌单 + 右栏该歌单的歌与写操作。
 *
 * 这个文件只是壳：左栏在 `PlaylistRail/CloudRail.vue`（取数与建 / 删在 `useCloudLists.ts`），
 * 右栏是既有的 `CloudListPane`（加歌 / 删歌 / 刷新）。
 * 选中项由 `route.query.cloud`（dirId）派生，写由左栏负责（缺省时左栏归一到第一组）。
 */
export default {
  name: 'PlaylistsCloudPanel',
  components: {
    CloudRail,
    CloudListPane,
  },
  setup() {
    const route = useRoute()

    const dirId = computed(() => (route.query.cloud as string | undefined) ?? '')
    // 卡片来自 createdLists（建 / 删都刷新它）：dirId 不存在时 card 为 null
    const card = computed(() => createdLists.find(item => String(item.dirId) === dirId.value) ?? null)
    const tip = computed(() => userLabels.createdLists || window.i18n.t('playlists__cloud_pick' as any))

    return {
      dirId,
      card,
      tip,
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
.pane {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
}
// margin: auto 让提示在右栏正中（flex 项两个方向的 auto 外边距都会均分剩余空间）
.tip {
  margin: auto;
  padding: 0 10px;
  font-size: 13px;
  color: var(--color-font-label);
  text-align: center;
}
</style>
