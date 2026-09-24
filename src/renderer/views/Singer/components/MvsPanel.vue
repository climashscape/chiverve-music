<template>
  <div :class="$style.container" class="scroll">
    <!-- 点卡片用乐馆 MV 已有的播放弹窗（复用 store/mv 的 player，不另造播放器）；
         弹窗本身挂在页面壳上（index.vue），所以切 tab 不会把它连带销毁 -->
    <ul v-show="!mvs.noItemLabel" :class="$style.cards">
      <li v-for="item in mvs.list" :key="item.vid" :class="$style.mvCard" @click="openMv(item)">
        <div :class="$style.thumbBox">
          <img :class="$style.thumb" loading="lazy" decoding="async" :src="item.img" alt="">
          <span v-if="item.interval" :class="$style.duration">{{ item.interval }}</span>
        </div>
        <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
        <p v-if="item.playCount" :class="$style.cardMeta">{{ $t('mv__play_count') }}：{{ playText(item.playCount) }}</p>
      </li>
    </ul>
    <div v-show="mvs.noItemLabel" :class="$style.noitem">
      <p v-text="mvs.noItemLabel" />
    </div>
    <div v-if="mvs.hasMore" :class="$style.more">
      <base-btn min :disabled="mvs.isLoading" @click="loadMoreMvs">{{ $t('singer__load_more') }}</base-btn>
    </div>
    <p v-if="mvs.moreError" :class="$style.error">{{ mvs.moreError }}</p>
  </div>
</template>

<script lang="ts">
import { watch } from '@common/utils/vueTools'
import { formatPlayCount } from '@renderer/utils'
import useSinger from '../useSinger'

/** 歌手页 → MV tab（工单 02）：卡片网格 + 「加载更多」（页号制分页，见 useSinger.ts 的 loadMvs）。 */
export default {
  name: 'SingerMvsPanel',
  props: {
    mid: {
      type: String,
      default: '',
    },
  },
  setup(props: { mid: string }) {
    const { mvs, ensureMvsTab, loadMoreMvs, openMv } = useSinger()

    // 懒加载入口：切进本 tab（含换歌手）时判一次要不要取；切回来已有缓存则不重复拉
    watch(() => props.mid, (mid) => { ensureMvsTab(mid) }, { immediate: true })

    const playText = (num: number) => formatPlayCount(num)

    return {
      mvs,
      playText,
      openMv,
      loadMoreMvs,
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
.mvCard {
  width: 208px;
  margin: 0 16px 16px 0;
  cursor: pointer;

  &:hover .thumb {
    transform: scale(1.04);
  }
}
.thumbBox {
  position: relative;
  width: 208px;
  height: 117px;
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
// 时长角标压在封面上：封面图深浅不可控，必须自带反差底色（与 /mv 卡片同样处理）
.duration {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 2px 5px;
  font-size: 11px;
  color: #fff;
  background-color: rgba(0, 0, 0, .5);
}
</style>
