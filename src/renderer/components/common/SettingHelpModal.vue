<template lang="pug">
//- 帮助弹窗。只挂一份（设置页根部），60+ 个 `?` 共用这一份状态 —— 见 useSettingHelp.ts
material-modal(:show="helpVisible" bg-close teleport="#view" max-width="60%" @close="closeSettingHelp")
  main(:class="$style.main")
    h2(:class="$style.title") {{ helpLabel || $t('setting__help_title') }}
    p(:class="$style.text") {{ helpText }}
    div(:class="$style.footer")
      //- 长文案看完了要有个明确的出口：✕（material-modal 自带）/ 点背景 / Esc 都能关，
      //- 但用户找的是「关掉」这个键
      base-btn(:class="$style.footerBtn" :aria-label="$t('btn_close')" :title="$t('btn_close')" @click="closeSettingHelp") {{ $t('btn_close') }}
</template>

<script>
import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { helpLabel, helpText, helpVisible, closeSettingHelp } from './useSettingHelp'

/** Esc 关弹窗：`material-modal` 本身**没有**键盘能力（2026-09-24 实查，全仓无 Escape 处理），
 *  所以在这里自己听——键事件挂在 document 上（弹窗是 teleport 走的，挂在自己根节点上收不到）。 */
const handleKeyDown = (event) => {
  if (event.key != 'Escape' || !helpVisible.value) return
  closeSettingHelp()
}

export default {
  name: 'SettingHelpModal',
  setup() {
    // 只在打开期间监听：常驻监听会让「Esc」在弹窗没开时也走一遍判断（无害但没必要），
    // 更重要的是关掉之后 listener 不该还在
    const stopWatch = watch(helpVisible, visible => {
      if (visible) document.addEventListener('keydown', handleKeyDown)
      else document.removeEventListener('keydown', handleKeyDown)
    })

    onBeforeUnmount(() => {
      stopWatch()
      document.removeEventListener('keydown', handleKeyDown)
      // 页面切走时状态要清掉：状态是模块级的，留着会在切回设置页时凭空弹出来
      closeSettingHelp()
    })

    return {
      helpLabel,
      helpText,
      helpVisible,
      closeSettingHelp,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 15px;
  min-width: 0;
  h2 {
    font-size: 14px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
  }
}
.text {
  padding-top: 12px;
  font-size: 13px;
  color: var(--color-font);
  line-height: 1.5;
  // 帮助文案可能是一段说明，换行照原样断，不缩进
  white-space: pre-wrap;
  word-break: break-word;
}
.footer {
  margin-top: 20px;
  display: flex;
  flex-flow: row nowrap;
}
.footerBtn {
  flex: auto;
  height: 36px;
  line-height: 36px;
  padding: 0 10px !important;
  .mixin-ellipsis-1();
}
</style>
