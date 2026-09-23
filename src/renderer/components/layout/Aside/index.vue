<template>
  <div :class="[$style.aside, { [$style.fullscreen]: isFullscreen }]">
    <ControlBtns v-if="appSetting['common.controlBtnPosition'] == 'left'" />
    <!--
      品牌字标（用户可见显示名的变体规则见 AGENTS §8）：窄栏里上下两行——短名 `Ch'iverve` + 副行 `MUSIC`。
      用户 2026-09-23 明确「Ch'iverve / Music / Ch'iverve Music / MUSIC 在不同地方都可以用」，
      所以这里不是单一字符串，按场景挑。
    -->
    <div v-else :class="$style.logo">
      <span :class="$style.logoBrand">Ch'iverve</span>
      <span :class="$style.logoSub">MUSIC</span>
    </div>
    <NavBar />
  </div>
</template>

<script setup>
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'

import ControlBtns from './ControlBtns.vue'
import NavBar from './NavBar.vue'

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.aside {
  // box-shadow: 0 0 5px rgba(0, 0, 0, .3);
  transition: @transition-normal;
  transition-property: background-color;
  // background-color: @color-theme-sidebar;
  // background-color: @color-aside-background;
  // border-right: 2px solid var(--color-primary);
  -webkit-app-region: drag;
  -webkit-user-select: none;
  display: flex;
  flex-flow: column nowrap;

  &.fullscreen {
    -webkit-app-region: no-drag;
    .logo {
      display: none;
    }
  }
}

.logo {
  box-sizing: border-box;
  padding: 4px 2px 0;
  height: 50px;
  color: var(--color-nav-font);
  opacity: .85;
  flex: none;
  text-align: center;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
  // 左栏只有 @width-app-left（6.6%），两行小字才放得下
  white-space: nowrap;
  overflow: hidden;
  // -webkit-app-region: no-drag;
}
.logoBrand {
  font-size: 10px;
  font-weight: bold;
  line-height: 1.2;
}
.logoSub {
  // 副行做字距展开的小字，像唱片厂牌的行标
  font-size: 8px;
  letter-spacing: .18em;
  line-height: 1.4;
  color: var(--color-font-label);
}

</style>
