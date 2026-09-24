<template>
  <div :class="$style.container" class="scroll">
    <ul v-show="!albums.noItemLabel" :class="$style.cards">
      <li v-for="item in albums.list" :key="item.mid || item.id" :class="$style.albumCard" @click="toAlbum(item)">
        <img :class="$style.albumImg" loading="lazy" decoding="async" :src="item.img" alt="">
        <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
      </li>
    </ul>
    <div v-show="albums.noItemLabel" :class="$style.noitem">
      <p v-text="albums.noItemLabel" />
    </div>
    <div v-if="albums.hasMore" :class="$style.more">
      <base-btn min :disabled="albums.isLoading" @click="loadMoreAlbums">{{ $t('singer__load_more') }}</base-btn>
    </div>
    <p v-if="albums.moreError" :class="$style.error">{{ albums.moreError }}</p>
  </div>
</template>

<script lang="ts">
import { watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import useSinger, { type SingerAlbum } from '../useSinger'

/** 歌手页 → 专辑 tab（工单 02）：卡片网格 + 「加载更多」（专辑是偏移制分页，见 useSinger.ts 文件头第 3 条）。 */
export default {
  name: 'SingerAlbumsPanel',
  props: {
    mid: {
      type: String,
      default: '',
    },
  },
  setup(props: { mid: string }) {
    const router = useRouter()
    const { albums, ensureAlbumsTab, loadMoreAlbums } = useSinger()

    // 懒加载入口：切进本 tab（含换歌手）时判一次要不要取；切回来已有缓存则不重复拉
    watch(() => props.mid, (mid) => { ensureAlbumsTab(mid) }, { immediate: true })

    // 专辑 mid 优先（详情接口两种参数都收）
    const toAlbum = (item: SingerAlbum) => {
      void router.push({ path: '/album', query: { mid: item.mid || item.id } })
    }

    return {
      albums,
      toAlbum,
      loadMoreAlbums,
    }
  },
}
</script>

<style lang="less" module>
@import './panels.less';

// 卡片网格是通栏内容：左右 padding 由页面根给，滚动条会吃掉内容右边缘那 6px，
// 靠卡片自带的右外边距留净空（与收藏页的卡片网格同处理，见 .albumCard 的 margin）
.container {
  height: 100%;
  overflow-y: auto;
  padding-bottom: 30px;
}
.albumCard {
  width: 132px;
  margin: 0 14px 14px 0;
  cursor: pointer;

  &:hover .albumImg {
    transform: scale(1.04);
  }
}
.albumImg {
  width: 132px;
  height: 132px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
</style>
