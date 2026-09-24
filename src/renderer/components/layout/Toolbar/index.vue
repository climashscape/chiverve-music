<template>
  <div :class="[$style.toolbar, { [$style.fullscreen]: isFullscreen }, appSetting['common.controlBtnPosition'] == 'left' ? $style.controlBtnLeft : $style.controlBtnRight]">
    <SearchInput />
    <!-- 详情类页面的动作键落点（工单 03）：页面用 `<common-toolbar-actions>` Teleport 进这个 div。
         位置在搜索框右侧、窗口键左侧；没有页面投放动作时它是个 0 宽元素（对其它页面零影响）。 -->
    <div id="toolbar-actions" :class="$style.actions" />
    <div v-if="appSetting['common.controlBtnPosition'] == 'left'" :class="$style.logo">C M</div>
    <ControlBtns v-else />
  </div>
</template>

<script setup>
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import ControlBtns from './ControlBtns.vue'
import SearchInput from './SearchInput.vue'

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.toolbar {
  display: flex;
  height: @height-toolbar;
  align-items: center;
  justify-content: space-between;
  padding-left: 15px;
  -webkit-app-region: drag;
  z-index: 2;

  &.fullscreen {
    -webkit-app-region: no-drag;
    .logo {
      display: none;
    }
  }

  &.controlBtnLeft {
    .control {
      display: none;
    }
  }
  &.controlBtnRight {
    justify-content: space-between;
  }
}

.logo {
  box-sizing: border-box;
  padding: 0 @height-toolbar * .4;
  height: @height-toolbar;
  color: var(--color-primary);
  flex: none;
  text-align: center;
  line-height: @height-toolbar;
  font-weight: bold;
  // -webkit-app-region: no-drag;
}

/**
 * 动作区落点（工单 03）：里面放的是页面 Teleport 过来的动作键（尺寸/外观由
 * `components/common/ToolbarActions.vue` 给，两边高度口径都是 `@height-toolbar * .52`）。
 *
 * - `flex: 1 1 auto` + `min-width: 0`：吃掉工具栏的剩余空间（`.toolbar` 的 `space-between`
 *   因此不再产生空隙），窄窗时允许收缩——键走省略号，而不是把工具栏撑破；
 * - `margin: 0 12px`：与搜索框、窗口键各留 12px（宽窗下动作区右侧本来就有大片留白，
 *   这两段间距只在窄窗/长文案把动作区顶满时才看得见，920 档英文四键实测正好停在这 12px 上）；
 * - `-webkit-app-region: no-drag` **必须写**：`.toolbar` 整条是拖拽区，不写的话里面的键按不动
 *   （SearchInput 的 `.container`、ControlBtns 的 `.control` 都是各自加的）。
 */
.actions {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  margin: 0 12px;
  -webkit-app-region: no-drag;
}

</style>
