<template>
  <!-- 详情类页面的动作键容器（工单 03）：把插槽内容 Teleport 到顶部工具栏搜索栏右侧的
       `#toolbar-actions`（`components/layout/Toolbar/index.vue` 里那个 div）。

       为什么用 Teleport，而不是 store / 事件总线 / 全局数组：
         - **卸载即清空**：切路由时页面组件卸载，Teleport 的内容跟着移除，动作区自动变空，
           不需要任何清理代码（这是「返回后动作区应清空」的唯一保证）；
         - 没有跨组件状态：路由页没有 keep-alive，同一时刻只有一个页面在渲染，动作区不会有第二份；
         - 页面自己的 DOM 里不占位（Teleport 只留一个空的文本锚点，见 Album 那种 flex 容器也不受影响）。

       ⚠️ 目标必须在**本组件挂载时**已经存在：`App.vue` 里 `layout-toolbar` 排在 `layout-view`
       之前，挂载顺序保证先有目标。若以后把工具栏挪到 View 之后，这里会静默拿不到目标
       （Vue 只在 dev 打一条 warn，生产环境什么都不显示）——届时把目标提到 `App.vue`。 -->
  <teleport to="#toolbar-actions">
    <div :class="$style.actions">
      <slot />
    </div>
  </teleport>
</template>

<script>
export default {
  name: 'ToolbarActions',
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

/**
 * 动作区（与搜索框同一行、同高）。
 *
 * 挂载点是工具栏里的一行，不是页内一行——所以下面每个尺寸都按「工具栏」口径取：
 * - 高度 = **搜索框的高度口径**（`components/material/SearchInput.vue` 的 `.container` 与
 *   `.form` 都是 `@height-toolbar * 0.52` = 28.08px @54px）。两边的盒中心因此都落在工具栏
 *   中线上（920 档实测：搜索框 cy 34.99、键 cy 34.99，逐位相同）。
 * - 页里那套「36px 高 + 大 padding」的键口径（工单 17/22）在工具栏里放不下，键一律走这一份。
 */
.actions {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: 8px;
}

/**
 * 插槽里的键统一外观——**尺寸由容器给，页面不要再写**（页面只保留文案 / :title / @click）。
 * 等宽口径 = 同高 + 同 padding + 同 gap + 同一套字体；**不做等分**：
 * `flex: 1 1 0` 那种等分实测在两档窗口都会截断中文文案（每键只剩 103.3@920 / 88.8@828，
 * 而「在 QQ 音乐打开」要 108.81px），见工单 03 的量取表。
 */
.actions button {
  flex: 0 1 auto;
  // 下限 60px：保护短文案键（「返回」44 / Back 52.81 / 뒤로 42）不被长键一起拖到截断。
  // 60 = 「返回」自然宽 44 + 一个字余量；且四键合计 344.4px 仍在 828 档的可用宽 355.2px 之内
  // （实测 828×540 中文四键无一处省略号）。
  min-width: 60px;
  height: @height-toolbar * 0.52;
  // line-height 与 height 取同一个表达式：单行文案居中，且不靠 flex 居中
  // （base-btn 是 inline-block，改成 inline-flex 会让文案变成匿名 flex item，
  //   `text-overflow: ellipsis` 对它失效 —— 实测整行文字被硬裁、没有省略号）
  line-height: @height-toolbar * 0.52;
  padding: 0 10px;
  font-size: 12px;
  // 文案不换行是硬要求（工单 17/22）：装不下就省略号，全文由页面模板上的 :title 兜
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
