<template lang="pug">
dt#appearance {{ $t('setting__basic') }}
//- 分组顺序 = settingMetadata 的 SETTING_SECTIONS[appearance].groups 顺序，不许重排
AppearanceTheme
AppearanceFont
AppearanceLang
AppearanceWindow
AppearanceAnimation
AppearanceControlBar
AppearanceTray
</template>

<script>
import AppearanceTheme from './AppearanceTheme.vue'
import AppearanceFont from './AppearanceFont.vue'
import AppearanceLang from './AppearanceLang.vue'
import AppearanceWindow from './AppearanceWindow.vue'
import AppearanceAnimation from './AppearanceAnimation.vue'
import AppearanceControlBar from './AppearanceControlBar.vue'
import AppearanceTray from './AppearanceTray.vue'

/**
 * 外观节（设置页重构票 03）：7 个分组各一个子组件（AGENTS §2.5 每块一个子组件）。
 *
 * 契约（票 02 立、本票接着守）：
 * - 分组的 DOM 锚点 id = `settingMetadata` 的 `group.id`，写在分组自己的 `h3` 上；
 * - 每个设置项的控件带 `data-setting-key="<item.key>"`（搜索命中高亮按它定位，见 useSettingToc.ts）。
 * 内容来源：SettingBasic 全部（除「定时暂停」按钮 → 播放节）+ SettingOther 的 `transparentWindow` / 托盘图标两项。
 * 旧组件 `SettingBasic.vue` / `SettingOther.vue` 已退场（票 03 摘内容、票 04 删文件）。
 */
export default {
  name: 'SettingSectionAppearance',
  components: {
    AppearanceTheme,
    AppearanceFont,
    AppearanceLang,
    AppearanceWindow,
    AppearanceAnimation,
    AppearanceControlBar,
    AppearanceTray,
  },
}
</script>
