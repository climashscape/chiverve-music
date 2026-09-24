<template lang="pug">
//- 设置项旁边那个 `?`：悬停出原生提示（title），点击弹长文案（SettingHelpModal）。
//- 用裸 button 而不是 base-btn：这里是行内一个图标，base-btn 的 padding / 背景 / 圆角
//- 会把这一行的行盒与间距改掉（原来 .help-icon 的 margin 就是全部间距）。
button(
  type="button" :class="$style.helpBtn"
  :aria-label="text" :title="text"
  @click="handleClick"
)
  //- 不给 svg 传 title / aria-label：无障碍名与提示都在按钮上（SvgIcon 因此把它当装饰图标）。
  //- `help-icon` 这个类留着 —— 设置页 `:global` 里那条 `margin: 0 0.4em` 靠它取间距
  svg-icon(class="help-icon" name="help-circle-outline")
</template>

<script>
import { openSettingHelp } from './useSettingHelp'

export default {
  name: 'SettingHelpIcon',
  props: {
    /** 该项的 `helpI18nKey` 文案：既是弹窗正文，也是按钮的原生 `title`（悬停提示）与 `aria-label` */
    text: {
      type: String,
      required: true,
    },
    /** 该项的设置项名，用作弹窗标题；调用点没有名字可给时留空（弹窗退到「帮助」） */
    label: {
      type: String,
      default: '',
    },
  },
  methods: {
    handleClick() {
      openSettingHelp(this.text, this.label)
    },
  },
}
</script>

<style lang="less" module>
.helpBtn {
  // display: inline + 字体/行高继承 = 让按钮对排版完全透明（行盒仍由里面那个 svg 决定），
  // 换成 inline-block 的默认样式会让 `?` 相对文字基线上下挪几像素
  display: inline;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  font: inherit;
  line-height: inherit;
  color: inherit;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.7;
  }
}
</style>
