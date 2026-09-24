<template lang="pug">
//- §4.1 总开关与路径：三项（元数据顺序）——开关 / 路径 / 按列表名建子目录
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding（旧方案在每个 dd 下写同一个 div）
div
  .gap-top
    base-checkbox(id="setting_download_enable" data-setting-key="download.enable" :model-value="appSetting['download.enable']" :label="$t('setting__download_enable')" @update:model-value="updateSetting({'download.enable': $event})")
  //- 路径是「只读展示 + 一个更改按钮」的组合：展示行点击在文件管理器里打开（隐藏操作写进 title）
  div(data-setting-key="download.savePath")
    .p
      | {{ $t('setting__download_path_label') }}
      span.auto-hidden.hover(:aria-label="$t('setting__download_path_open_label')" :title="$t('setting__download_path_open_label')" @click="openDirInExplorer(appSetting['download.savePath'])") {{ appSetting['download.savePath'] }}
      common-setting-help-icon(:text="$t('setting__download_path_tip')" :label="$t('setting__download_path_label')")
    .p
      base-btn.btn(min @click="handleChangeSavePath") {{ $t('setting__download_path_change_btn') }}
  .gap-top
    base-checkbox(id="setting_download_save_group_list_name" data-setting-key="download.isSavePathGroupByListName" :model-value="appSetting['download.isSavePathGroupByListName']" :label="$t('setting_download_save_group_list_name')" @update:model-value="updateSetting({'download.isSavePathGroupByListName': $event})")
</template>

<script>
import { showSelectDialog, openDirInExplorer } from '@renderer/utils/ipc'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'DownloadSwitchPathGroup',
  setup() {
    const t = useI18n()

    const handleChangeSavePath = () => {
      void showSelectDialog({
        title: t('setting__download_select_save_path'),
        defaultPath: appSetting['download.savePath'],
        properties: ['openDirectory'],
      }).then(result => {
        if (result.canceled) return
        updateSetting({ 'download.savePath': result.filePaths[0] })
      })
    }

    return {
      appSetting,
      updateSetting,
      openDirInExplorer,
      handleChangeSavePath,
    }
  },
}
</script>
