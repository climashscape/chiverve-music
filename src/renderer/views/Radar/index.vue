<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <!-- 两个来源并列成 tab（票 04）：每日30首 与 雷达推荐，下面共用同一个轮播形态 -->
      <!-- 居中（2026-09-24 用户「这个居中放置」）：主视觉本来就是居中轮播，页头跟着居中 -->
      <base-tab v-model="tab" :class="$style.tabs" align="center" :list="tabs" item-key="tab" @change="handleTabChange" />
      <p :class="$style.tip">{{ tip }}</p>
    </div>

    <!-- 居中轮播（工单 07 的形态迭代：用户要主视觉居中 + 巨型播放键 + 左右滑动挑选）。
         `:key="tab"`：切 tab 重建组件，让拖动量/右键菜单这类瞬时状态跟着复位；
         列表数据与游标都在模块级（useRadar / useDaily30），重建不影响它们 -->
    <radar-carousel
      :key="tab"
      :block="block"
      :tab="tab"
      @load-more="handleLoadMore"
      @refresh="handleRefresh"
    />
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import useRadar from './useRadar'
import useDaily30 from './useDaily30'
import RadarCarousel from './components/RadarCarousel.vue'

/**
 * 雷达页（票 04）：两个 tab——「每日30首」与「雷达推荐」。
 *
 * 两个来源是**两类数据**：每日30首是 QQ 每天轮换内容的一张固定歌单（30 首、没有第二页），
 * 雷达推荐是流式个性化推荐（`GetRadarSong`，翻不完）。所以它们各自取数、各自记游标，
 * 只有轮播形态与底部 5 个按键共用（按键永远作用于「当前 tab 的中央那一首」）。
 *
 * tab 写在 `route.query.tab` 上：可分享，且从歌手页/专辑页回来能回到原 tab（与发现页/收藏页同约定）。
 */

const TABS = ['daily30', 'radar'] as const
type TabId = typeof TABS[number]

const normalizeTab = (tab: unknown): TabId => TABS.includes(tab as TabId) ? tab as TabId : TABS[0]

const t = (key: string) => window.i18n.t(key as any)

export default {
  name: 'Radar',
  components: {
    RadarCarousel,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const { radar, initRadar, loadRadar } = useRadar()
    const { daily, initDaily30, loadDaily30 } = useDaily30()

    const tab = ref<TabId>(normalizeTab(route.query.tab))

    const tabs = [
      { tab: 'daily30', label: t('radar__tab_daily30') },
      { tab: 'radar', label: t('radar__tab_recommend') },
    ]

    const block = computed(() => (tab.value === 'daily30' ? daily : radar))
    const tip = computed(() => t(tab.value === 'daily30' ? 'radar__daily30_tip' : 'radar__tip'))

    const handleTabChange = (id: TabId) => {
      void router.replace({ path: route.path, query: { tab: id } })
    }

    watch(() => route.query.tab, (next) => {
      tab.value = normalizeTab(next)
    })

    // 懒加载：只有切到「每日30首」才打它那个请求；雷达沿用 isInited 守卫（一个会话一次）
    watch(tab, (id) => {
      if (id === 'daily30') void initDaily30()
    }, { immediate: true })
    void initRadar()

    const handleLoadMore = () => {
      // 只有雷达能翻页（每日30首的 hasMore 恒 false，不会走到这里）
      void loadRadar(radar.page + 1, true)
    }
    const handleRefresh = () => {
      if (tab.value === 'daily30') void loadDaily30()
      else void loadRadar(1, false)
    }

    return {
      tab,
      tabs,
      block,
      tip,
      handleTabChange,
      handleLoadMore,
      handleRefresh,
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
  padding: 16px 22px 30px;
  color: var(--color-font);
  display: flex;
  flex-flow: column nowrap;
  // 内容（矮窗口下舞台会被 clamp 压缩）永不外溢：溢出的部分会被播放栏盖住、连点都点不到（票 01）
  overflow: hidden;
}

// 页头只留 tab 与一句说明，主视觉交给下面的轮播
.header {
  flex: none;
  padding-bottom: 4px;
  // 这一组整体居中（tab 靠 base-tab 的 align="center"，说明文案靠这条）
  text-align: center;
  // 字号跟着**根字号**（= 设置里的「界面字体大小」，默认 16px）走，而不是写死 px：
  // base-tab 自己写死 12px、本页原先的说明也是 12px，在这页 300px 的主视觉下显得过小
  // （2026-09-24 用户：「这个字都太小了」）。只在本页覆盖——base-tab 是收藏页/发现页/
  // 歌单页共用的组件，那几页是密集列表，别去动它本身
  .tabs {
    font-size: 1em;
  }
}
// 居中形态下**不要**再抵消 base-tab 的 15px 内边距：那条 `margin-left: -15px` 是给左对齐用的
// （让 tab 文字与下方内容左边缘齐平，写法见收藏页/发现页），在居中版里会让整组偏左 15px
.tabs {
  margin-left: 0;
}
.tip {
  margin-top: 2px;
  font-size: .875em;
  color: var(--color-font-label);
}
</style>
