<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <base-tab v-model="tab" :class="$style.tabs" :list="tabs" item-key="tab" @change="handleTabChange" />
    </div>
    <!-- Tab 懒加载：v-if（不是 v-show）——切进来才挂载、才打那一块的请求 -->
    <div :class="$style.content">
      <feed-panel v-if="tab === 'recommend'" />
      <recommend-panel v-else-if="tab === 'songlist'" />
      <new-albums-panel v-else-if="tab === 'newAlbums'" />
      <new-songs-panel v-else-if="tab === 'newSongs'" />
    </div>
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import FeedPanel from './components/FeedPanel.vue'
import RecommendPanel from './components/RecommendPanel.vue'
import NewAlbumsPanel from './components/NewAlbumsPanel.vue'
import NewSongsPanel from './components/NewSongsPanel.vue'

/**
 * 发现（工单 03）：推荐 / 歌单 / 新碟 / 新歌 四个 Tab。
 *
 * 这个文件只是壳：Tab 切换与 query 同步；每块内容在 components/ 里，各自取数
 * （`useXxxTab.ts`），互不阻塞——原来一屏塞六个板块、进页面并发打六个请求。
 *
 * Tab 写在 route.query.tab 上：可分享，且从歌单详情返回能回到原 Tab
 * （歌单卡片带 fromTab，见 components/common/SongCardGrid.vue）。
 * 切 Tab 会重建面板，滚动位置自然复位。
 */

const TABS = ['recommend', 'songlist', 'newAlbums', 'newSongs'] as const
type TabId = typeof TABS[number]

const normalizeTab = (tab: unknown): TabId => TABS.includes(tab as TabId) ? tab as TabId : TABS[0]

export default {
  name: 'Discover',
  components: {
    FeedPanel,
    RecommendPanel,
    NewAlbumsPanel,
    NewSongsPanel,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const tab = ref<TabId>(normalizeTab(route.query.tab))

    const tabs = [
      { tab: 'recommend', label: window.i18n.t('discover__tab_recommend' as any) },
      { tab: 'songlist', label: window.i18n.t('discover__tab_songlist' as any) },
      { tab: 'newAlbums', label: window.i18n.t('discover__tab_new_albums' as any) },
      { tab: 'newSongs', label: window.i18n.t('discover__tab_new_songs' as any) },
    ]

    const handleTabChange = (id: TabId) => {
      void router.replace({ path: route.path, query: { tab: id } })
    }

    watch(() => route.query.tab, (next) => {
      tab.value = normalizeTab(next)
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
