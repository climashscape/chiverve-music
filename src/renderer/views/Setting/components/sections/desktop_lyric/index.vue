<template lang="pug">
dt#desktop_lyric {{ $t('setting__desktop_lyric') }}
//- 分组顺序 = settingMetadata 的 SETTING_SECTIONS[desktop_lyric].groups 顺序，不许重排
DesktopLyricShow
DesktopLyricInteract
DesktopLyricFont
DesktopLyricReset
</template>

<script>
import DesktopLyricShow from './DesktopLyricShow.vue'
import DesktopLyricInteract from './DesktopLyricInteract.vue'
import DesktopLyricFont from './DesktopLyricFont.vue'
import DesktopLyricReset from './DesktopLyricReset.vue'

/**
 * 桌面歌词节（设置页重构票 03）：元数据里本节 4 个分组——`desktop_lyric_show` / `_interact` /
 * `_font` / `_reset`（13 个裸开关按语义拆进前两组，「加粗对象」三项并进排版与字体）。
 *
 * 颜色组（`desktop_lyric_color`）按 ADR-0007 **整组不存在**（元数据里也没有这个 Group）：三个取色器与
 * 渲染侧的覆盖判定都已下架，颜色只由主题派生。那句「歌词颜色跟随主题、可在『外观 → 主题』中调整」的说明
 * 由票 10 补回，渲染在 `DesktopLyricFont.vue` 末尾（用户找不到颜色设置时的指路牌）。
 *
 * 契约（票 02 立、本票接着守）：
 * - 分组的 DOM 锚点 id = `settingMetadata` 的 `group.id`，写在分组自己的 `h3` 上；
 * - 每个设置项的控件带 `data-setting-key="<item.key>"`（搜索命中高亮按它定位，见 useSettingToc.ts）。
 * 旧组件 `SettingDesktopLyric.vue` 已退场（票 03 摘内容、票 04 删文件）。
 */
export default {
  name: 'SettingSectionDesktopLyric',
  components: {
    DesktopLyricShow,
    DesktopLyricInteract,
    DesktopLyricFont,
    DesktopLyricReset,
  },
}
</script>
