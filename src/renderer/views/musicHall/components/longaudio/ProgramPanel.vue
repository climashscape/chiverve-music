<template>
  <div :class="$style.container" class="scroll">
    <div :class="$style.header">
      <base-input
        v-model="keyword"
        :class="$style.input"
        :placeholder="$t('program__search_placeholder')"
        @submit="handleSearch"
      />
      <base-btn min :disabled="searchState.isLoading" @click="handleSearch">{{ $t('search') }}</base-btn>
      <base-btn v-if="searchState.active" min outline @click="clearSearch">{{ $t('program__back_hot') }}</base-btn>
    </div>

    <h3 :class="$style.title">
      {{ searchState.active ? $t('program__search_result') : $t('program__hot_title') }}
      <span v-if="searchState.active && searchState.total" :class="$style.count">{{ searchState.total }}</span>
    </h3>

    <ul v-show="visibleList.length" :class="$style.cards">
      <li v-for="item in visibleList" :key="item.id || item.mid" :class="$style.card" @click="openAlbum(item)">
        <div :class="$style.thumbBox">
          <img :class="$style.thumb" loading="lazy" decoding="async" :src="item.img" alt="">
        </div>
        <h4 :class="$style.name" :title="item.name">{{ item.name }}</h4>
        <p v-if="item.singer" :class="$style.meta" :title="item.singer">{{ item.singer }}</p>
        <p v-if="item.total" :class="$style.meta">{{ $t('program__episode_count', { num: item.total }) }}</p>
        <p v-else-if="item.playCount" :class="$style.meta">{{ $t('program__play_count') }}：{{ playText(item.playCount) }}</p>
      </li>
    </ul>

    <div v-show="!visibleList.length" :class="$style.noitem">
      <p v-text="searchState.active ? searchState.noItemLabel : hot.noItemLabel" />
    </div>

    <div v-if="searchState.active && searchState.hasMore" :class="$style.more">
      <base-btn min :disabled="searchState.isLoading" @click="loadMore">{{ $t('program__load_more') }}</base-btn>
    </div>
  </div>
</template>

<script lang="ts">
import { ref } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { formatPlayCount } from '@renderer/utils'
import useProgramAlbums, { type ProgramAlbum } from './useProgramAlbums'

/**
 * 乐馆 → 有声节目 Tab（长音频：有声书 / 电台节目）。
 *
 * 这里**只选专辑**，点进既有 `/album` 页看单集并播放：单集在数据层与普通歌曲同构
 * （`AlbumSongList` 的 `songList[].songInfo`，本仓专辑页早已按这个形状解包），
 * 取流也走既有链路（探针实测节目单集 128k purl 非空）——所以不新造列表、不新造播放器。
 * 依据与实测记录见 `tx/longAudio.js` 文件头与
 * `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-radio.md`。
 *
 * 关键词与选中项**不走 route.query**：搜索态是这一块的临时视图状态，不是可分享的页面
 * （乐馆的 query 只放 Tab 与各 Tab 自己的定位参数；本块没有「详情页返回原焦点」的需求）。
 */

export default {
  setup() {
    const router = useRouter()
    const { hot, searchState, visibleList, loadHot, runSearch, clearSearch, loadMore } = useProgramAlbums()
    // 关键词用模块级状态里的值初始化：Tab 切走再回来（组件重建）时输入框不该空着而结果还在
    const keyword = ref(searchState.keyword)

    // 首次进 Tab 才取热门（结果缓在模块级状态里，切走再回来不重打）
    if (!hot.loaded) void loadHot()

    const handleSearch = () => { void runSearch(keyword.value) }
    const playText = (num: number) => formatPlayCount(num)
    /**
     * 节目专辑的数字 id 与 mid 本仓专辑页都吃（`tx/album.js` 按 `isNumericId` 分流参数），
     * 但 mid 更稳（feed 卡片只有数字 id，搜索结果两者都有）——有 mid 就优先用 mid。
     */
    const openAlbum = (item: ProgramAlbum) => {
      const mid = item.mid || item.id
      if (!mid) return
      void router.push({ path: '/album', query: { mid } })
    }

    return {
      keyword,
      hot,
      searchState,
      visibleList,
      handleSearch,
      clearSearch,
      loadMore,
      playText,
      openAlbum,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  // 乐馆的内容区已经有确定高度，这里只负责滚动（与 MvPanel 同一套）
  height: 100%;
  color: var(--color-font);
  overflow-y: auto;
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 4px;
}
.input {
  flex: none;
  width: 260px;
}

.title {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
}
.count {
  margin-left: 6px;
  font-weight: 400;
  font-size: 12px;
  color: var(--color-font-label);
}

.cards {
  display: flex;
  flex-wrap: wrap;
  margin-top: 10px;
}
.card {
  width: 168px;
  margin: 0 16px 16px 0;
  cursor: pointer;

  &:hover .thumb {
    transform: scale(1.04);
  }
}
.thumbBox {
  position: relative;
  width: 168px;
  height: 168px;
  border-radius: @radius-border;
  overflow: hidden;
  background-color: var(--color-button-background);
}
.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform @transition-fast;
}
.name {
  margin-top: 6px;
  font-size: 13px;
  .mixin-ellipsis-2();
}
.meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}

.more {
  margin-top: 10px;
  text-align: center;
}
.noitem {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
</style>
