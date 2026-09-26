<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <base-tab v-model="tab" :class="$style.tabs" :list="tabs" item-key="tab" @change="handleTabChange" />
    </div>
    <!-- Tab 懒加载：v-if（不是 v-show）——切进来才挂载、才取那一块的数据 -->
    <div :class="$style.content">
      <follow-panel v-if="tab === 'follow'" />
      <fans-panel v-else-if="tab === 'fans'" />
      <friend-panel v-else-if="tab === 'friend'" />
    </div>
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import FollowPanel from './components/FollowPanel.vue'
import FansPanel from './components/FansPanel.vue'
import FriendPanel from './components/FriendPanel.vue'

/**
 * 粉丝与好友（资料类能力·读侧）：**QQ 账号的关系列表归口**——我关注的用户 / 我的粉丝 / QQ 好友。
 *
 * 这个文件只是壳：Tab 切换与 query 同步（照 `views/Favorites/index.vue` 的写法）。
 * 每块内容在 `components/` 里，取数一律走 `useUserList(kind)`。
 *
 * 只读：关注 / 取关（写端点）2026-09-25 探针未找到，别在这里加写按钮
 * （见 `scripts/verify/artifacts/2026-09-25-qq-probe/NOTES.md` 第 1 节）。
 * 入口在「我的音乐」页的账号卡上（不是左侧一级导航——它属于账号中心的下一层）。
 *
 * Tab 写在 `route.query.tab` 上：可分享、可深链，且从别处跳进来能直接落在某一块。
 */

const TABS = ['follow', 'fans', 'friend'] as const
type TabId = typeof TABS[number]

const normalizeTab = (tab: unknown): TabId => TABS.includes(tab as TabId) ? tab as TabId : TABS[0]

export default {
  name: 'Friends',
  components: {
    FollowPanel,
    FansPanel,
    FriendPanel,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const tab = ref<TabId>(normalizeTab(route.query.tab))

    const tabs = [
      // 默认 tab 是「关注」（我关注的人）——它是这一页里唯一与「我的账号」强相关的入口，
      // 粉丝/好友都是从外面收进来的
      { tab: 'follow', label: window.i18n.t('friends__tab_follow' as any) },
      { tab: 'fans', label: window.i18n.t('friends__tab_fans' as any) },
      { tab: 'friend', label: window.i18n.t('friends__tab_friend' as any) },
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
// base-tab 自带 15px 内边距，这里抵消掉，让 tab 与内容左对齐（同 Favorites 页）
.tabs {
  margin-left: -15px;
}

.content {
  flex: auto;
  min-height: 0;
  position: relative;
}
</style>
