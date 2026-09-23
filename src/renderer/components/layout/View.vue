<template>
  <div ref="dom_view" :class="$style.view">
    <router-view v-slot="{ Component }">
      <!-- <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut"> -->
      <component :is="Component" class="view-container" />
      <!-- </transition> -->
    </router-view>
  </div>
</template>

<!-- 这里不写 lang="ts"：`<script setup lang="ts">` 会让模板与脚本编进同一个 TS 虚拟文件，
     而 `v-slot="{ Component }"` 的解构参数会被 ts-loader 报 TS7031（Binding element implicitly any），
     构建直接失败。TS 的实现都在 useViewScrollMemory.ts 里，本文件只是挂 ref 的壳。
     同理下面**不能写类型标注**（如 `ref<HTMLElement>()`）：JS 脚本块走 babel 解析，尖括号泛型是语法错误
     （`Unexpected token`），构建期同样过不去。 -->
<script setup>
import { ref } from '@common/utils/vueTools'
import useViewScrollMemory from './useViewScrollMemory'

// 滚动位置记忆（工单 03）要在「页面根之下」找滚动容器，所以给本组件根元素（= App.vue 里的 #view）挂 ref，
// 由组合式函数在它内部找——**不能**按 `.view-container` 全局找：App.vue:2 的 #container 也挂着这个类。
// 顺带一提：模板根节点只能是这一个 div（根上多一个注释节点就会变成 Fragment，id="view" 就落不下来）。
const dom_view = ref()

useViewScrollMemory({ dom_view })
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.view {
  position: relative;
  z-index: 1;
  > :global(.view-container) {
    position: absolute !important;
    left: 0;
    top: 0;
    height: 100%;
    width: 100%;
  }
  // background: #fff;
  // overflow: hidden;
}

</style>
