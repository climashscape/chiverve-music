<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <base-tab v-model="tab" :class="$style.tabs" :list="tabs" item-key="tab" @change="handleTabChange" />
    </div>
    <!-- Tab 懒加载：v-if（不是 v-show）——切进来才挂载、才取那一块的数据 -->
    <div :class="$style.content">
      <leaderboard-panel v-if="tab === 'leaderboard'" />
      <song-list-panel v-else-if="tab === 'songlist'" />
      <mv-panel v-else-if="tab === 'mv'" />
      <program-panel v-else-if="tab === 'audio'" />
    </div>
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import LeaderboardPanel from './components/leaderboard/LeaderboardPanel.vue'
import SongListPanel from './components/songlist/SongListPanel.vue'
import MvPanel from './components/mv/MvPanel.vue'
import ProgramPanel from './components/longaudio/ProgramPanel.vue'

/**
 * 乐馆（工单 04）：把排行榜 / 歌单广场 / MV 三块既有内容聚到一个页面，MV 因此第一次有了入口。
 * 第四块「有声节目」（长音频，2026-09-26 加）：同页一个 Tab，点节目专辑进既有 `/album` 页——
 * 单集与播放复用那条链路（见 `components/longaudio/ProgramPanel.vue` 文件头）。
 *
 * 这个文件**只是壳**：Tab 切换与 query 同步；每块内容在 components/<块>/ 里，
 * 各自的取数留在各自的面板（沿用原来的 store/composable，没重写数据层）。
 *
 * Tab 写在 route.query.tab 上：可分享、可从详情页返回原 Tab
 * （歌单卡片跳详情时带 fromTab，见 components/common/SongCardGrid.vue）。
 * 三个 Tab 的参数（榜单的 boardId、歌单广场的 tagId/sortId/page）也留在 query 上——
 * 旧地址重定向进来时能把参数一并带过来。
 */

/** Tab 顺序与 id：与 i18n 的 music_hall__tab_* 一一对应。 */
const TABS = ['leaderboard', 'songlist', 'mv', 'audio'] as const
type TabId = typeof TABS[number]

const normalizeTab = (tab: unknown): TabId => TABS.includes(tab as TabId) ? tab as TabId : TABS[0]

export default {
  name: 'MusicHall',
  components: {
    LeaderboardPanel,
    SongListPanel,
    MvPanel,
    ProgramPanel,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const tab = ref<TabId>(normalizeTab(route.query.tab))

    const tabs = [
      { tab: 'leaderboard', label: window.i18n.t('music_hall__tab_leaderboard' as any) },
      { tab: 'songlist', label: window.i18n.t('music_hall__tab_songlist' as any) },
      { tab: 'mv', label: window.i18n.t('music_hall__tab_mv' as any) },
      { tab: 'audio', label: window.i18n.t('music_hall__tab_audio' as any) },
    ]

    const handleTabChange = (id: TabId) => {
      // 切 Tab 时清掉别的 Tab 的参数（boardId 之于歌单广场是噪音），只留 tab
      void router.replace({ path: route.path, query: { tab: id } })
    }

    // 地址栏被外部改（旧地址重定向、从详情页返回带 tab）时跟上
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
