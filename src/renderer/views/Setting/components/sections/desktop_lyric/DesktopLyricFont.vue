<template lang="pug">
dd
  h3#desktop_lyric_font {{ $t('setting__desktop_lyric_font_title') }}
  div
    //- 与主窗 playDetail.style.align 独立（用户最常改错地方的一对）
    div.gap-top(data-setting-key="desktopLyric.style.align")
      .p.small {{ $t('setting__desktop_lyric_align') }}
      div
        base-checkbox.gap-left(id="setting_desktop_lyric_align_left" :model-value="appSetting['desktopLyric.style.align']" need value="left" :label="$t('setting__desktop_lyric_align_left')" @update:model-value="updateSetting({ 'desktopLyric.style.align': $event })")
        base-checkbox.gap-left(id="setting_desktop_lyric_align_center" :model-value="appSetting['desktopLyric.style.align']" need value="center" :label="$t('setting__desktop_lyric_align_center')" @update:model-value="updateSetting({ 'desktopLyric.style.align': $event })")
        base-checkbox.gap-left(id="setting_desktop_lyric_align_right" :model-value="appSetting['desktopLyric.style.align']" need value="right" :label="$t('setting__desktop_lyric_align_right')" @update:model-value="updateSetting({ 'desktopLyric.style.align': $event })")
    //- 默认 = 主题字体；与主窗 common.font 无关
    div.gap-top(data-setting-key="desktopLyric.style.font")
      .p.small {{ $t('setting__desktop_lyric_font') }}
      div
        base-selection.gap-left(:list="fontList" :model-value="appSetting['desktopLyric.style.font']" item-key="id" item-name="label" @update:model-value="updateSetting({ 'desktopLyric.style.font': $event })")
    //- 行距 0–25，现只有加减按钮（夹取在 changeLineGap 里）；上限提示属票 11 的文案活儿
    div.gap-top(data-setting-key="desktopLyric.style.lineGap")
      .p.small {{ $t('setting__desktop_lyric_line_gap', { num: appSetting['desktopLyric.style.lineGap'] }) }}
      .p
        base-btn.btn(min @click="changeLineGap(-1)") {{ $t('setting__desktop_lyric_line_gap_dec') }}
        base-btn.btn(min @click="changeLineGap(1)") {{ $t('setting__desktop_lyric_line_gap_add') }}
    //- 开 = 超长歌词截断不折行（窄窗 + 长句时观感差异明显）
    .gap-top(data-setting-key="desktopLyric.style.ellipsis")
      base-checkbox(id="setting_desktop_lyric_ellipsis" :model-value="appSetting['desktopLyric.style.ellipsis']" :label="$t('setting__desktop_lyric_ellipsis')" @update:model-value="updateSetting({ 'desktopLyric.style.ellipsis': $event })")
    //- 默认 true；与主窗 playDetail.isZoomActiveLrc（默认 false）是两个值。
    //- 文案 key 用元数据的 `setting__desktop_lyric_font_zoom`（与主窗那条成对），票 11 补它的帮助文案
    .gap-top(data-setting-key="desktopLyric.style.isZoomActiveLrc")
      base-checkbox(id="setting_desktop_lyric_zoom" :model-value="appSetting['desktopLyric.style.isZoomActiveLrc']" :label="$t('setting__desktop_lyric_font_zoom')" @update:model-value="updateSetting({ 'desktopLyric.style.isZoomActiveLrc': $event })")
    //- 「对哪些歌词加粗」三项：旧的那个「加粗字体」分组（拿 i18n key 当 DOM id 的那个）并进本组，
    //- 这行说明文字的四语文案票 04 已改成「对哪些歌词加粗」；三个复选框各自带 data-setting-key
    .p.small.gap-top {{ $t('setting__desktop_lyric_font_weight') }}
    div
      base-checkbox.gap-left(id="setting_setting__desktop_lyric_font_weight_font" :model-value="appSetting['desktopLyric.style.isFontWeightFont']" :label="$t('setting__desktop_lyric_font_weight_font')" data-setting-key="desktopLyric.style.isFontWeightFont" @update:model-value="updateSetting({ 'desktopLyric.style.isFontWeightFont': $event })")
      base-checkbox.gap-left(id="setting_setting__desktop_lyric_font_weight_line" :model-value="appSetting['desktopLyric.style.isFontWeightLine']" :label="$t('setting__desktop_lyric_font_weight_line')" data-setting-key="desktopLyric.style.isFontWeightLine" @update:model-value="updateSetting({ 'desktopLyric.style.isFontWeightLine': $event })")
      base-checkbox.gap-left(id="setting_setting__desktop_lyric_font_weight_extended" :model-value="appSetting['desktopLyric.style.isFontWeightExtended']" :label="$t('setting__desktop_lyric_font_weight_extended')" data-setting-key="desktopLyric.style.isFontWeightExtended" @update:model-value="updateSetting({ 'desktopLyric.style.isFontWeightExtended': $event })")
    //- 字号 10–80 / 不透明度 6–100：歌词窗控制条上能改同一个值（夹取也在 ControlBar.vue:86-102），设置页入口由票 05 补
    div.gap-top(data-setting-key="desktopLyric.style.fontSize")
      .p.small {{ $t('setting__desktop_lyric_font_size') }} {{ appSetting['desktopLyric.style.fontSize'] }}
      div
        base-input(type="number" :model-value="appSetting['desktopLyric.style.fontSize']" :placeholder="$t('setting__desktop_lyric_font_size')" @update:model-value="setFontSize")
    div.gap-top(data-setting-key="desktopLyric.style.opacity")
      .p.small {{ $t('setting__desktop_lyric_opacity') }} {{ appSetting['desktopLyric.style.opacity'] }}
      div
        base-input(type="number" :model-value="appSetting['desktopLyric.style.opacity']" :placeholder="$t('setting__desktop_lyric_opacity')" @update:model-value="setOpacity")
</template>

<script>
import { ref, computed } from '@common/utils/vueTools'
import { debounce } from '@common/utils'
import { getSystemFonts } from '@renderer/utils/ipc'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { useI18n } from '@renderer/plugins/i18n'

/** 桌面歌词 → 排版与字体（`desktop_lyric_font`）：对齐 / 字体 / 字号 / 行距 / 不透明度 / 截断 / 放大 + 三个「加粗对象」开关。 */
export default {
  name: 'DesktopLyricFont',
  setup() {
    const t = useI18n()

    const changeLineGap = (step) => {
      let gap = appSetting['desktopLyric.style.lineGap'] + step
      updateSetting({ 'desktopLyric.style.lineGap': Math.min(Math.max(gap, 0), 25) })
    }

    // 量程照歌词窗控制条的夹取（`ControlBar.vue:86-102`：字号 10–80、不透明度 6–100），落盘防抖 500ms
    const clampSetting = (key, value, min, max) => {
      const num = Number(value)
      if (!Number.isFinite(num)) return
      updateSetting({ [key]: Math.min(Math.max(Math.trunc(num), min), max) })
    }
    const setFontSize = debounce(value => { clampSetting('desktopLyric.style.fontSize', value, 10, 80) }, 500)
    const setOpacity = debounce(value => { clampSetting('desktopLyric.style.opacity', value, 6, 100) }, 500)

    const systemFontList = ref([])
    const fontList = computed(() => {
      return [{ id: '', label: t('setting__desktop_lyric_font_default') }, ...systemFontList.value]
    })
    void getSystemFonts().then(fonts => {
      systemFontList.value = fonts.map(f => ({ id: f, label: f.replace(/(^"|"$)/g, '') }))
    })

    return {
      appSetting,
      updateSetting,
      changeLineGap,
      fontList,
      setFontSize,
      setOpacity,
    }
  },
}
</script>
