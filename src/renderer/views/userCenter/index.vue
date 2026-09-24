<template>
  <div :class="$style.container">
    <!-- 账号卡：**固定在顶部**（工单 02）——它是 flex 列里不可伸缩的第一行，下面的内容区自己滚动
         （不是 sticky：sticky 会在滚动时露出下面的内容） -->
    <profile-card />

    <div :class="$style.content" class="scroll">
      <!-- 这一页只做听歌基因（工单 10 / 决策 D8）：「我喜欢」板块已删——它与「我的收藏」页重复；
           收藏能力本身在 store 与收藏页里，一点没动 -->
      <gene-panel />
    </div>
  </div>
</template>

<script lang="ts">
import { initUserCenter } from '@renderer/store/user/action'
import ProfileCard from './components/ProfileCard.vue'
import GenePanel from './components/GenePanel.vue'

/**
 * 我的音乐（M4，工单 10 后只剩两块）：账号卡 + 听歌基因。
 *
 * 这个文件只是壳。取数仍走页面级的 `initUserCenter()`（一次并发拉概览 + 基因 + 我喜欢 +
 * 各收藏列表），理由是那个 `isInited` 守卫是**全 store 共享**的、「我的收藏」页也依赖同一份
 * 状态——拆进子组件各拉一遍会把这次请求翻倍，绕开守卫又会让先访问本页后进收藏页看到空列表
 * （工单 10「事实」段专门点了这条）。所以：**别为了省这次请求去动 `isInited` 语义**。
 *
 * 富内容的渲染都在 `components/GenePanel.vue`；歌手跳转的取数与缓存见
 * `useGeneSingerJump.ts`。
 */
export default {
  name: 'UserCenter',
  components: {
    ProfileCard,
    GenePanel,
  },
  setup() {
    void initUserCenter()
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  // 路由页根容器带左右 padding 时必须 border-box：View.vue 给的是 width:100% + 默认 content-box，
  // 否则整块比窗口宽出 2×padding，右侧内容（按钮等）被挤出可视区
  box-sizing: border-box;
  // 左右留白**下放**给两个子块（工单 26）：滚动区自带 22px 后，6px 滚动条落到面板右边缘、
  // 与内容之间留出 22px 净空。根容器留左右 padding 的话，滚动区的右边缘就是内容右边缘，
  // 滚动条会**贴在内容上**（实测净空 −0.22px，即完全贴合），且它正好吊在账号卡分割线的右端下方
  padding: 16px 0 0;
  color: var(--color-font);
  // 账号卡固定、内容区自己滚（工单 02）——整页滚动的写法是 sticky 或整块 overflow，
  // 这里用最省事的 flex 列：第一行不可伸缩，第二行吃掉剩余高度并滚动
  display: flex;
  flex-flow: column nowrap;
}

// 内容区：`.scroll` 是全局类（滚动条样式），这里只负责高度、滚动与留白
.content {
  flex: auto;
  min-height: 0;
  overflow-y: auto;
  // 与歌手页 / 歌曲详情页同口径（那两页把 `padding: 16px 22px 30px` 直接挂在滚动容器上）：
  // 左右 22px 由滚动区自己出；底部 30px 留在可滚动区**内部**（引擎会把它算进 scrollHeight，
  // 实测 30.28px，不会贴底）
  padding: 0 22px 30px;
}
</style>
