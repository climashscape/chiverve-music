<template>
  <div :class="$style.container" class="scroll">
    <!-- 相似歌手一次取完（服务端没有分页参数），所以没有「加载更多」 -->
    <ul v-show="!similar.noItemLabel" :class="$style.cards">
      <li v-for="item in similar.list" :key="item.id" :class="$style.singerCard" @click="toSimilar(item)">
        <img :class="$style.singerImg" loading="lazy" decoding="async" :src="item.img" alt="">
        <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
      </li>
    </ul>
    <div v-show="similar.noItemLabel" :class="$style.noitem">
      <p v-text="similar.noItemLabel" />
    </div>
  </div>
</template>

<script lang="ts">
import { watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import useSinger, { type SimilarSinger } from '../useSinger'

/**
 * 歌手页 → 相似歌手 tab（工单 02）。
 *
 * 这**一个**接口满了就没有下一页（`GetSimilarSingerList` 只收条数，见 useSinger.ts 的 SIMILAR_NUM），
 * 所以这块没有「加载更多」。请求失败 / 没有相似歌手时落 `noItemLabel` 的文案（与其它块同一套三段式）。
 */
export default {
  name: 'SingerSimilarPanel',
  props: {
    mid: {
      type: String,
      default: '',
    },
  },
  setup(props: { mid: string }) {
    const router = useRouter()
    const { similar, ensureSimilarTab } = useSinger()

    // 懒加载入口：切进本 tab（含换歌手）时判一次要不要取；切回来已有缓存则不重复拉
    watch(() => props.mid, (mid) => { ensureSimilarTab(mid) }, { immediate: true })

    // 相似歌手那边 mid 就在 id 上（数据层如此）
    const toSimilar = (item: SimilarSinger) => {
      void router.push({ path: '/singer', query: { mid: item.id } })
    }

    return {
      similar,
      toSimilar,
    }
  },
}
</script>

<style lang="less" module>
@import './panels.less';

.container {
  height: 100%;
  overflow-y: auto;
  padding-bottom: 30px;
}
.singerCard {
  width: 104px;
  margin: 0 12px 12px 0;
  cursor: pointer;

  &:hover .singerImg {
    transform: scale(1.04);
  }
}
.singerImg {
  width: 104px;
  height: 104px;
  // 歌手头像圆形（专辑/MV 封面是方的，故意不一样）
  border-radius: 50%;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
</style>
