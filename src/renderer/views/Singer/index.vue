<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <div :class="$style.avatarBox">
        <img v-if="detail.avatar" :class="$style.avatar" loading="lazy" decoding="async" :src="detail.avatar" alt="">
      </div>
      <div :class="$style.info">
        <h2 :class="$style.name" :title="detail.name">{{ detail.name || $t('music_singer') }}</h2>
        <p :class="$style.meta">
          <span v-if="detail.musicCount">{{ $t('singer__songs') }} {{ detail.musicCount }}</span>
          <span v-if="detail.albumCount">{{ $t('singer__albums') }} {{ detail.albumCount }}</span>
        </p>
        <p v-if="detail.desc" :class="$style.desc">{{ detail.desc }}</p>
      </div>
    </div>
    <!-- 返回键搬到顶部工具栏搜索栏右侧（工单 03）：页头只剩「头像 + 信息」两个 flex 子项。
         歌手页本来没有「上方空白」——页头行高由 120px 头像决定，返回键不占纵向空间。 -->
    <common-toolbar-actions>
      <base-btn @click="handleBack">{{ $t('back') }}</base-btn>
    </common-toolbar-actions>

    <!-- 歌手不存在（多半是 mid 失效）/ 页头信息取不到时，只显示这一处文案：tab 栏与四个面板一起让位，
         免得到每个 tab 里再看到同一句话（原「四个区块重复同一句话」的约束换了形态但仍在）。
         ⚠️ 加载中（`isInfoLoading`）**不拦**：面板要能立刻挂载、与页头信息并行取数（useSinger.ts 文件头第 6 条） -->
    <div v-if="headerLabel && !isInfoLoading" :class="$style.noitemFull">
      <p v-text="headerLabel" />
    </div>
    <template v-else>
      <div :class="$style.tabBar">
        <base-tab v-model="tab" :class="$style.tabs" :list="tabs" item-key="tab" @change="handleTabChange" />
      </div>
      <!-- Tab 懒加载：v-if（不是 v-show）——切进来才挂载，面板自己判断要不要取那一块的数据 -->
      <div :class="$style.content">
        <songs-panel v-if="tab === 'songs'" :mid="mid" />
        <albums-panel v-else-if="tab === 'albums'" :mid="mid" />
        <mvs-panel v-else-if="tab === 'mv'" :mid="mid" />
        <similar-panel v-else-if="tab === 'similar'" :mid="mid" />
      </div>
    </template>

    <!-- MV 播放弹窗：组件与取流逻辑都在 MV 页，这里只负责把 show/url/详情接上。
         挂在页面壳上（不在 MV 面板里）：切 tab 卸载面板时不会连带把正在播的弹窗销毁 -->
    <player-modal
      :show="mvPlayer.show"
      :mv="mvPlayer.mv"
      :detail="mvPlayer.detail"
      :url="mvPlayer.url"
      :url-error="mvPlayer.urlError"
      :is-loading="mvPlayer.isLoading"
      :size-text="mvPlayer.sizeText"
      @close="closeMv"
      @retry="retryMvUrl"
    />
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import PlayerModal from '@renderer/components/common/MvPlayerModal.vue'
import useSinger from './useSinger'
import { normalizeTab, type TabId } from './tabs'
import SongsPanel from './components/SongsPanel.vue'
import AlbumsPanel from './components/AlbumsPanel.vue'
import MvsPanel from './components/MvsPanel.vue'
import SimilarPanel from './components/SimilarPanel.vue'

/**
 * 歌手页（工单 02）：页头（头像/名字/歌曲数/专辑数/简介/返回）+ 四个 tab
 * —— 歌曲 / 专辑 / MV / 相似歌手。
 *
 * 原来四个区块纵向铺满一页、进页面并发打四组请求（`initSinger` 的 Promise.all），
 * 现在**每个 tab 一个面板组件、每块取数一个入口**（`useSinger.ts` 的 `ensureXxxTab`），
 * 进页只取页头信息 + 当前 tab 那一块，其余 tab 首次切入时才取。本文件只是壳。
 *
 * Tab 写在 `route.query.tab` 上（`songs` / `albums` / `mv` / `similar`，默认 `songs`）：可分享、
 * 刷新后落回原 tab，`useViewScrollMemory` 也按 `fullPath` 给每个 tab 各记一份滚动位置（与发现/收藏同理）。
 * ⚠️ 写 tab 时**必须保留 `mid`**（它是本页的主参数），所以 query 是展开后再覆盖 tab。
 * 老链接 `/singer?mid=…`（没有 `tab` 键）照旧落歌曲 tab，推断规则见 `./tabs.ts`（单测 `tabs.test.ts`）。
 */
export default {
  name: 'Singer',
  components: {
    PlayerModal,
    SongsPanel,
    AlbumsPanel,
    MvsPanel,
    SimilarPanel,
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const {
      detail, headerLabel, isInfoLoading, mvPlayer,
      initSingerInfo, closeMv, retryMvUrl,
    } = useSinger()

    const tab = ref<TabId>(normalizeTab(route.query.tab))
    // 页头与四个面板都按「路由上的歌手」取数；面板要的 mid 从这里传下去（单一来源，不再各自读路由）
    const mid = computed(() => String(route.query.mid ?? '').trim())

    const tabs = [
      { tab: 'songs', label: window.i18n.t('singer__songs' as any) },
      { tab: 'albums', label: window.i18n.t('singer__albums' as any) },
      { tab: 'mv', label: window.i18n.t('singer__mvs' as any) },
      { tab: 'similar', label: window.i18n.t('singer__similar' as any) },
    ]

    const handleTabChange = (id: TabId) => {
      // 保留 `mid`（本页主参数）——切 tab 只是换视图，不该把歌手丢了
      void router.replace({ path: route.path, query: { ...route.query, tab: id } })
    }

    // 路由页没有 keep-alive，但 /singer?mid=A → /singer?mid=B 是同组件复用（setup 不会再跑），
    // 所以靠 watch 路由参数驱动取数，进入与更新两种情况都能覆盖
    watch(() => route.query.mid, (value) => {
      void initSingerInfo(value)
    }, { immediate: true })

    // 地址栏被外部改（分享链接进来、旧链接重定向）时跟上；tab 不认识的取值一律落 songs
    watch(() => route.query.tab, (value) => {
      tab.value = normalizeTab(value)
    })

    const handleBack = () => { router.back() }

    return {
      tab,
      tabs,
      mid,
      detail,
      headerLabel,
      isInfoLoading,
      mvPlayer,
      handleTabChange,
      handleBack,
      closeMv,
      retryMvUrl,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  // 根容器带左右 padding 时必须 border-box，否则溢出窗口右侧（见 userCenter/index.vue 同名注释）
  box-sizing: border-box;
  // ⚠️ 上/左/右 三个值与改版前一致（16px 顶 padding 是三页页头统一的顶缘）；歌手页「返回」键
  // 已搬到顶部工具栏（工单 03），页头不再有动作列，「同顶缘/同右缘」那条对齐基准随之作废
  padding: 16px 22px 0;
  color: var(--color-font);
  display: flex;
  flex-flow: column nowrap;
  // 页头与 tab 栏固定，滚动交给面板自己（原来的页面级滚动容器已下移，见各面板的 .container）
  overflow: hidden;
}

.header {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}
.avatarBox {
  flex: none;
  width: 120px;
  height: 120px;
  // 歌手头像是圆形（专辑封面是方的，两边故意不一样）
  border-radius: 50%;
  overflow: hidden;
  background-color: var(--color-button-background);
}
.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info {
  flex: auto;
  min-width: 0;
  padding: 0 14px;
}
.name {
  font-size: 17px;
  font-weight: 600;
  .mixin-ellipsis-1();
}
.meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-font-label);

  span {
    margin-right: 12px;
  }
}
.desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-font-label);
  .mixin-ellipsis(4);
}
// 原来还有一个 .actions（返回键）——返回键搬到顶部工具栏后整块删除（工单 03）
.tabBar {
  flex: none;
  display: flex;
  align-items: center;
  padding: 10px 0 4px;
}
// base-tab 自带 15px 内边距，这里抵消掉，让 tab 与左栏内容左对齐（与发现/收藏页同写法）
.tabs {
  margin-left: -15px;
}

.content {
  flex: auto;
  min-height: 0;
  position: relative;
}

// 整页级空态（歌手不存在）：落在页面中部，别贴着顶部
.noitemFull {
  flex: auto;
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
</style>
