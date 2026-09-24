<template lang="pug">
//- §4.4 格式与编码：只留编码一项（只管写出的 .lrc 文件，不管嵌入）
div
  div(data-setting-key="download.lrcFormat")
    .p
      | {{ $t('setting__download_lyric_format') }}
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__download_lyric_format_tip')" :title="$t('setting__download_lyric_format_tip')")
    base-checkbox.gap-left(
      v-for="item in lrcFormatList" :id="`setting_download_lrcFormat_${item.id}`" :key="item.id"
      name="setting_download_lrcFormat" need :model-value="appSetting['download.lrcFormat']" :value="item.id" :label="item.name"
      @update:model-value="updateSetting({'download.lrcFormat': $event})")
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'DownloadFormatGroup',
  setup() {
    const t = useI18n()

    const lrcFormatList = computed(() => {
      return [
        { id: 'utf8', name: t('setting__download_lyric_format_utf8') },
        { id: 'gbk', name: t('setting__download_lyric_format_gbk') },
      ]
    })

    return {
      appSetting,
      updateSetting,
      lrcFormatList,
    }
  },
}
</script>
