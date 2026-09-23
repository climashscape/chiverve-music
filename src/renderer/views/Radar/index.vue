<template>
  <div :class="$style.container">
    <!-- 英雄区：主打大封面 + 一键播放（工单 07）。封面/歌名用列表首曲，加载完前是空壳 -->
    <div :class="$style.hero">
      <div :class="$style.coverBox">
        <img v-if="heroSong?.meta.picUrl" :class="$style.cover" loading="lazy" decoding="async" :src="heroSong.meta.picUrl" alt="">
        <svg v-else :class="$style.coverIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 448 448" space="preserve">
          <use xlink:href="#icon-radar" />
        </svg>
      </div>
      <div :class="$style.heroInfo">
        <h2 :class="$style.title">{{ $t('discover__radar') }}</h2>
        <p :class="$style.tip">{{ $t('radar__tip') }}</p>
        <p v-if="heroSong" :class="$style.heroName" :title="`${heroSong.name} - ${heroSong.singer}`">
          {{ heroSong.name }}<span :class="$style.heroSinger"> - {{ heroSong.singer }}</span>
        </p>
        <div :class="$style.heroActions">
          <base-btn :disabled="!radar.list.length || radar.isLoading" @click="handlePlayRadar">{{ $t('radar__play_all') }}</base-btn>
          <base-btn min :disabled="radar.isLoading" @click="loadRadar(1, false)">{{ $t('discover__refresh') }}</base-btn>
        </div>
      </div>
    </div>
    <!-- 列表仍用 material-online-list：右键菜单（跳转 / 分享 / 不喜欢…）与行内按钮不能丢 -->
    <radar-list :block="radar" @load-more="loadRadar(radar.page + 1, true)" />
  </div>
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { playMusicList } from '@renderer/core/player'
import useRadar, { RADAR_QUEUE_ID } from './useRadar'
import RadarList from './components/RadarList.vue'

export default {
  name: 'Radar',
  components: {
    RadarList,
  },
  setup() {
    const { radar, initRadar, loadRadar } = useRadar()

    void initRadar()

    // 主打位用列表第一首：雷达是流式推荐，没有「整张专辑」那样的实体封面
    const heroSong = computed(() => radar.list[0] ?? null)

    /** 一键播放：整串雷达进播放队列，从第 1 首开始；翻页拿到的新推荐会接到队列尾部 */
    const handlePlayRadar = () => {
      void playMusicList(RADAR_QUEUE_ID, [...radar.list], 0)
    }

    return {
      radar,
      loadRadar,
      heroSong,
      handlePlayRadar,
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
}

// 英雄区：左大封面 + 右信息与动作（像每日推荐的门面）
.hero {
  flex: none;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.coverBox {
  flex: none;
  width: 160px;
  height: 160px;
  margin-right: 20px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--color-button-background);
  box-shadow: 0 2px 10px 0 rgba(0, 0, 0, .18);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .95;
}
.coverIcon {
  width: 48%;
  height: 48%;
  fill: var(--color-font-label);
}
.heroInfo {
  flex: auto;
  min-width: 0;
}
.title {
  font-size: 20px;
  font-weight: 600;
}
.tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-font-label);
}
.heroName {
  margin-top: 10px;
  font-size: 14px;
  .mixin-ellipsis-1();
}
.heroSinger {
  color: var(--color-font-label);
}
.heroActions {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
