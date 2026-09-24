<template lang="pug">
dd
  h3#appearance_font {{ $t('setting__appearance_font_title') }}
  div
    //- 全局根字号（rem 基准；列表行高 = 字号 × 2.3），全屏时禁用
    div.gap-top(data-setting-key="common.fontSize")
      .p.small {{ $t('setting__basic_font_size') }}
      div
        base-checkbox.gap-left(
          v-for="item in fontSizeList" :id="`setting_basic_font_size_${item.id}`" :key="item.id"
          name="setting_basic_font_size" need :model-value="appSetting['common.fontSize']" :value="item.id"
          :label="item.label" :disabled="isFullscreen" @update:model-value="updateSetting({'common.fontSize': $event})")
    //- 两个下拉拼成 "主字体, 备用字体" 串；只作用于主窗口，桌面歌词另有一份 `desktopLyric.style.font`
    div.gap-top(data-setting-key="common.font")
      .p.small
        | {{ $t('setting__basic_font') }}
        common-setting-help-icon(:text="$t('setting__basic_font_tip')" :label="$t('setting__basic_font')")
      div(style="--selection-width: 12rem;")
        base-selection.gap-left(:list="fontList" :model-value="fonts[0]" item-key="id" item-name="label" @update:model-value="updateFonts($event, fonts[1])")
        base-selection.gap-left(v-if="fonts[0]" :list="fontList" :model-value="fonts[1]" item-key="id" item-name="label" @update:model-value="updateFonts(fonts[0], $event)")
</template>

<script>
import { computed, ref } from '@common/utils/vueTools'
import { isFullscreen } from '@renderer/store'
import { useI18n } from '@renderer/plugins/i18n'
import { getSystemFonts } from '@renderer/utils/ipc'
import { appSetting, updateSetting } from '@renderer/store/setting'

/**
 * 外观 → 字体与字号（`appearance_font`）：原来的「字体大小」与「字体」两个 h3 合成一组。
 * 两个下拉框都没有标签（`setting__basic_font` 既是这一项的文案，也是旧 h3 的文案）——
 * 附 A6 要求补「主字体 / 备用字体」两个标签，属票 11 的文案活儿，本票只搬位置。
 */
export default {
  name: 'AppearanceFont',
  setup() {
    const t = useI18n()

    const systemFontList = ref([])
    const fontList = computed(() => {
      return [{ id: '', label: t('setting__desktop_lyric_font_default') }, ...systemFontList.value]
    })
    void getSystemFonts().then(fonts => {
      systemFontList.value = fonts.map(f => ({ id: f, label: f.replace(/(^"|"$)/g, '') }))
    })

    const fonts = computed(() => {
      if (!appSetting['common.font']) return ['', '']
      let [f1 = '', f2 = ''] = appSetting['common.font'].split(',')
      return [f1.trim(), f2.trim()]
    })
    const updateFonts = (font1, font2) => {
      let font = []
      if (font1) font.push(font1)
      if (font2) font.push(font2)
      updateSetting({ 'common.font': font.join(', ') })
    }
    const fontSizeList = computed(() => {
      return [
        { id: 14, label: t('setting__basic_font_size_14px') },
        { id: 15, label: t('setting__basic_font_size_15px') },
        { id: 16, label: t('setting__basic_font_size_16px') },
        { id: 17, label: t('setting__basic_font_size_17px') },
        { id: 18, label: t('setting__basic_font_size_18px') },
        { id: 19, label: t('setting__basic_font_size_19px') },
      ]
    })

    return {
      appSetting,
      updateSetting,
      fonts,
      updateFonts,
      fontList,
      isFullscreen,
      fontSizeList,
    }
  },
}
</script>
