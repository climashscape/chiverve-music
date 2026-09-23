<template>
  <div :class="$style.container">
    <!-- 歌单卡片组件内部是绝对定位 + 自滚动，父级必须给出确定的高度 -->
    <div :class="$style.gridBox">
      <song-card-grid :list-info="recommend.listInfo" @toggle-page="loadRecommend" />
    </div>
  </div>
</template>

<script lang="ts">
import useRecommendTab from '../useRecommendTab'

/** 发现页 → 歌单 Tab：推荐歌单（卡片网格自带「点卡片进歌单详情」与分页器）。 */
export default {
  name: 'DiscoverRecommendPanel',
  setup() {
    const { recommend, initRecommendTab, loadRecommend } = useRecommendTab()

    void initRecommendTab()

    return {
      recommend,
      loadRecommend,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  box-sizing: border-box;
  color: var(--color-font);
}
// 高度按「9 条 = 每行 3 张 × 3 行」配（见 useRecommendTab.ts 的 RECOMMEND_PAGE_SIZE）
.gridBox {
  height: 100%;
  position: relative;
}
</style>
