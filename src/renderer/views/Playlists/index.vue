<template>
  <div id="my-playlists" :class="$style.container">
    <div :class="$style.header">
      <base-tab v-model="tab" :class="$style.tabs" :list="tabs" item-key="tab" @change="handleTabChange" />
    </div>
    <!-- Tab 懒加载：v-if（不是 v-show）——切进来才挂载；云端那组因此只在切到该 tab 时才取 createdLists -->
    <div :class="$style.content">
      <local-lists-panel v-if="tab === 'local'" />
      <cloud-lists-panel v-else-if="tab === 'cloud'" />
    </div>
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { type TabId, tabFromQuery } from './tabs'
import LocalListsPanel from './components/LocalListsPanel.vue'
import CloudListsPanel from './components/CloudListsPanel.vue'

/**
 * 我的歌单（工单 09）：两个 tab——**本地歌单**（本地库的自建列表）与 **QQ 音乐·歌单**
 * （QQ 云端自建歌单）。两者是**两套数据、两种写语义**，以前堆在一根左栏里两个组各自滚动，
 * 现在各占一个 tab，每个 tab 内部仍是「左栏 + 右栏」。
 *
 * 这个文件只是壳：Tab 切换与 query 同步；两个面板在 components/ 里，各自取数。
 *
 * query（三个键各归其主）：
 * - `tab`：`local` / `cloud`，本文件写
 * - `id`：本地 tab 选中的列表，`LocalListsPanel` 写
 * - `cloud`：云端 tab 选中的 dirId，`CloudRail` 写
 * 切 tab **不丢**另外两个键：那是各自 tab 内部的选择，切回去还在原位（与收藏页把参数清掉不同——
 * 那边的参数只对一个 tab 有意义）。老地址因此照旧可用：`?id=…` 落本地 tab、`?cloud=…` 落云端 tab，
 * 两者都缺时默认 `local`（推断规则见 `./tabs.ts`，单测在 `tabs.test.ts`）。
 */

export default {
  name: 'Playlists',
  components: {
    LocalListsPanel,
    CloudListsPanel,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()

    const tab = ref<TabId>(tabFromQuery(route.query as Record<string, unknown>))

    const tabs = [
      { tab: 'local', label: window.i18n.t('playlists__tab_local' as any) },
      { tab: 'cloud', label: window.i18n.t('playlists__tab_cloud' as any) },
    ]

    const handleTabChange = (id: TabId) => {
      void router.replace({ path: route.path, query: { ...route.query, tab: id } })
    }

    // 地址栏被外部改（老地址重定向进来、外部链接）时跟上；两个面板自己写的 id / cloud 也在这里
    // 过一遍——有 `tab` 键时它说了算，没有时按老链接语义推断，所以不会出现「写 id 把 tab 改掉」
    watch(() => [route.query.tab, route.query.id, route.query.cloud], () => {
      tab.value = tabFromQuery(route.query as Record<string, unknown>)
    })

    return {
      tab,
      tabs,
      handleTabChange,
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

.header {
  flex: none;
  display: flex;
  align-items: center;
  padding-bottom: 6px;
}
// base-tab 自带 15px 内边距，这里抵消掉，让 tab 与内容左对齐
.tabs {
  margin-left: -15px;
}

.content {
  flex: auto;
  min-height: 0;
  position: relative;
}
</style>
