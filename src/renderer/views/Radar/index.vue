<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <h3 :class="$style.title">{{ $t('discover__radar') }}</h3>
      <base-btn min :disabled="radar.isLoading" @click="loadRadar(1, false)">{{ $t('discover__refresh') }}</base-btn>
    </div>
    <p :class="$style.tip">{{ $t('radar__tip') }}</p>
    <radar-list :block="radar" @load-more="loadRadar(radar.page + 1, true)" />
  </div>
</template>

<script lang="ts">
import useRadar from './useRadar'
import RadarList from './components/RadarList.vue'

export default {
  name: 'Radar',
  components: {
    RadarList,
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
}

.header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-size: 14px;
  font-weight: 600;
}
.tip {
  flex: none;
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
