<template>
  <svg class="svg-icon" :aria-hidden="ariaHidden">
    <!-- 提示必须做成 `<title>` 子元素：SVG 元素上的 HTML `title` 属性**不产生原生提示**
         （浏览器只认 <title> 子元素），上一轮删掉应用气泡后设置页 `?` 图标「悬停没反应」
         就是这个原因。父组件传的 `title` 属性照旧留在 <svg> 上（fallthrough），无害。
         值与 `aria-label` 二选一，都没有时不渲染（纯装饰图标）。 -->
    <title v-if="hint">{{ hint }}</title>
    <use :xlink:href="id" />
  </svg>
</template>

<script>

export default {
  name: 'SvgIcon',
  props: {
    name: {
      type: String,
      required: true,
    },
  },
  computed: {
    id() {
      return `#icon-${this.name}`
    },
    /**
     * 提示文本：`title` 优先，其次 `aria-label`（设置页那些 `?` 图标两者给的是同一句文案）。
     * 只认非空字符串——传了对象之类的值时当作没传，免得渲染出 "[object Object]"。
     */
    hint() {
      const attrs = this.$attrs
      const title = typeof attrs.title === 'string' ? attrs.title : ''
      const ariaLabel = typeof attrs['aria-label'] === 'string' ? attrs['aria-label'] : ''
      return title || ariaLabel
    },
    /**
     * 有提示就不设 `aria-hidden`：否则 svg 被整棵摘出无障碍树，父组件传的 `aria-label`
     * 形同虚设（AGENTS §2.5.1 要求图标键可访问；SVG 的可用名正来自 `<title>` 子元素
     * 与 `aria-label`）。没提示的是纯装饰图标，照旧摘掉。
     */
    ariaHidden() {
      return this.hint ? null : 'true'
    },
  },
}
</script>

<style>
.svg-icon {
  width: 1.2em;
  height: 1.2em;
  vertical-align: -0.25em;
  fill: currentColor;
  overflow: hidden;
}
</style>
