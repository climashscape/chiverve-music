<template lang="pug">
//- §4.2 并发与命名：三项（元数据顺序）——任务数 / 同名跳过 / 命名方式
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding
div
  .p(data-setting-key="download.maxDownloadNum")
    | {{ $t('setting__download_max_num') }}
    svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__download_max_num_tooltip')" :title="$t('setting__download_max_num_tooltip')")
    base-selection.gap-left(:class="$style.selectWidth" :model-value="appSetting['download.maxDownloadNum']" :list="maxNums" item-key="id" item-name="id" @change="handleUpdateMaxNum")
  .gap-top
    base-checkbox(id="setting_download_skip_exist_file" data-setting-key="download.skipExistFile" :model-value="appSetting['download.skipExistFile']" :label="$t('setting__download_skip_exist_file')" @update:model-value="updateSetting({'download.skipExistFile': $event})")
  div(data-setting-key="download.fileName")
    .p {{ $t('setting__download_name') }}
    base-checkbox.gap-left(
      v-for="item in musicNames" :id="`setting_download_musicName_${item.value}`" :key="item.value" name="setting_download_musicName" :value="item.value"
      need :model-value="appSetting['download.fileName']" :label="item.name" @update:model-value="updateSetting({'download.fileName': $event})")
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { dialog } from '@renderer/plugins/Dialog'

export default {
  name: 'DownloadConcurrentNamingGroup',
  setup() {
    const t = useI18n()

    const maxNums = new Array(6).fill(null).map((_, i) => ({ id: i + 1 }))
    const handleUpdateMaxNum = async({ id }) => {
      if (id > 3) {
        if (!await dialog.confirm(t('setting__download_max_num_tip'))) return
      }
      updateSetting({ 'download.maxDownloadNum': id })
    }

    const musicNames = computed(() => {
      return [
        { value: '歌名 - 歌手', name: t('setting__download_name1') },
        { value: '歌手 - 歌名', name: t('setting__download_name2') },
        { value: '歌名', name: t('setting__download_name3') },
      ]
    })

    return {
      appSetting,
      updateSetting,
      maxNums,
      handleUpdateMaxNum,
      musicNames,
    }
  },
}
</script>

<style lang="less" module>
.selectWidth {
  width: 60px;
}
</style>
