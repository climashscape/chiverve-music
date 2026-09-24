<template lang="pug">
dd
  h3#appearance_window {{ $t('setting__appearance_window_title') }}
  div
    //- 主窗口固定宽度（7 档；主窗口 resizable:false，这是唯一改窗口大小的途径）；全屏时禁用
    div.gap-top(data-setting-key="common.windowSizeId")
      .p.small
        | {{ $t('setting__basic_window_size') }}
        common-setting-help-icon(:text="$t('setting__basic_window_size_tip')" :label="$t('setting__basic_window_size')")
      div
        base-checkbox.gap-left(
          v-for="item in windowSizeList" :id="`setting_window_size_${item.id}`" :key="item.id"
          name="setting_window_size" need :model-value="appSetting['common.windowSizeId']" :disabled="isFullscreen" :value="item.id" :label="$t('setting__basic_window_size_' + item.name)"
          @update:model-value="updateSetting({'common.windowSizeId': $event})")
    //- 全屏启动会连带禁用上面的「窗口尺寸」与外观节的「字体大小」两项
    .gap-top(data-setting-key="common.startInFullscreen")
      base-checkbox(id="setting_start_in_fullscreen" :model-value="appSetting['common.startInFullscreen']" :label="$t('setting__basic_start_in_fullscreen')" @update:model-value="updateSetting({'common.startInFullscreen': $event})")
      common-setting-help-icon(:text="$t('setting__basic_start_in_fullscreen_tip')" :label="$t('setting__basic_start_in_fullscreen')")
    //- 改后要重启才生效；mac 默认 false（原生窗口），Linux/Win 默认 true
    .gap-top(data-setting-key="common.transparentWindow")
      base-checkbox(id="setting_transparent_window" :model-value="appSetting['common.transparentWindow']" :label="$t('setting__other_transparent_window')" @update:model-value="updateSetting({'common.transparentWindow': $event})")
      common-setting-help-icon(:text="$t('setting__other_transparent_window_tip')" :label="$t('setting__other_transparent_window')")
</template>

<script>
import { windowSizeList, isFullscreen } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'

/**
 * 外观 → 窗口（`appearance_window`）：窗口尺寸 + 全屏启动来自 SettingBasic.vue，
 * 「圆角及阴影」（`common.transparentWindow`）来自 SettingOther.vue 顶层那项。
 */
export default {
  name: 'AppearanceWindow',
  setup() {
    return {
      appSetting,
      updateSetting,
      windowSizeList,
      isFullscreen,
    }
  },
}
</script>
