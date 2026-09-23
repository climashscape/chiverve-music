<template>
  <div :class="$style.container">
    <!-- 页头：只留标题与一句说明，主视觉交给下面的轮播 -->
    <div :class="$style.header">
      <h2 :class="$style.title">{{ $t('discover__radar') }}</h2>
      <p :class="$style.tip">{{ $t('radar__tip') }}</p>
    </div>

    <!-- 居中轮播（工单 07 的形态迭代：用户要主视觉居中 + 巨型播放键 + 左右滑动挑选） -->
    <radar-carousel
      :block="radar"
      @load-more="loadRadar(radar.page + 1, true)"
      @refresh="loadRadar(1, false)"
    />
  </div>
</template>

<script lang="ts">
import useRadar from './useRadar'
import RadarCarousel from './components/RadarCarousel.vue'

export default {
  name: 'Radar',
  components: {
    RadarCarousel,
  },
  setup() {
    const { radar, initRadar, loadRadar } = useRadar()

    void initRadar()

    return {
      radar,
      loadRadar,
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

.header {
  flex: none;
  text-align: center;
}
.title {
  font-size: 18px;
  font-weight: 600;
}
.tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
