<template lang="pug">
.gap-top
  .gap-top
    //- 「当前版本」这行连点 5 次（1 秒内）打开 DevTools：有意隐藏的手势，勿「顺手清理」（归类表 §9.2）
    .p.small(@click="handleOpenDevTools") {{ $t('setting__update_current_label') }}{{ versionInfo.version }}
    .p.small(v-if="commit_id")
      | {{ $t('setting__update_commit_id') }}
      span.select {{ commit_id }}
    .p.small(v-if="commit_date") {{ $t('setting__update_commit_date') }}{{ commit_date }}

  .p.small.gap-top
    | {{ $t('setting__update_latest_label') }}{{ versionInfo.newVersion && versionInfo.newVersion.version != '0.0.0' ? versionInfo.newVersion.version : $t('setting__update_unknown') }}
  .p.small(v-if="downloadProgress" :class="$style.progress")
    | {{ $t('setting__update_downloading') }}
    br
    | {{ $t('setting__update_progress') }}{{ downloadProgress }}
  template(v-if="versionInfo.newVersion")
    .p(v-if="versionInfo.isLatest")
      span {{ $t('setting__update_latest') }}
    .p(v-else-if="versionInfo.isUnknown")
      span {{ $t('setting__update_unknown_tip') }}
    .p(v-else-if="versionInfo.status != 'downloading'")
      span {{ $t('setting__update_new_version') }}
    .p
      base-btn.btn.gap-left(min @click="showUpdateModal") {{ $t('setting__update_open_version_modal_btn') }}
  .p.small(v-else-if="versionInfo.status == 'checking'") {{ $t('setting__update_checking') }}
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { versionInfo } from '@renderer/store'
import { dateFormat, sizeFormate } from '@common/utils/common'
import { openDevTools } from '@renderer/utils/ipc'
import { useI18n } from '@renderer/plugins/i18n'

/**
 * 「更新与关于 → 版本信息」：只读展示（版本 / 代码版本 / 提交日期 / 最新版本 + 打开更新窗口），
 * 全是**非 key 控件**（没有 `defaultSetting` key，所以没有 `data-setting-key`）。
 *
 * ⚠️ `handleOpenDevTools` 是**有意的隐藏手势**：「当前版本」一行 1 秒内连点 5 次开 DevTools，
 * 上游遗留的排查入口，归类表 §9.2 明确要求保留，不要当成无用代码删掉。
 */
export default {
  name: 'SettingAboutVersionInfo',
  setup() {
    let lastClickTime = 0
    let clickNum = 0
    const commit_id = COMMIT_ID
    const commit_date = dateFormat(COMMIT_DATE)

    const t = useI18n()

    const handleOpenDevTools = () => {
      if (window.performance.now() - lastClickTime > 1000) {
        if (clickNum > 0) clickNum = 0
      } else {
        if (clickNum > 4) {
          openDevTools()
          clickNum = 0
          return
        }
      }
      clickNum++
      lastClickTime = window.performance.now()
    }

    const downloadProgress = computed(() => {
      return versionInfo.status == 'downloading'
        ? versionInfo.downloadProgress
          ? `${versionInfo.downloadProgress.percent.toFixed(2)}% - ${sizeFormate(versionInfo.downloadProgress.transferred)}/${sizeFormate(versionInfo.downloadProgress.total)} - ${sizeFormate(versionInfo.downloadProgress.bytesPerSecond)}/s`
          : t('setting__update_init')
        : ''
    })

    const showUpdateModal = () => {
      versionInfo.showModal = true
    }

    return {
      versionInfo,
      downloadProgress,
      handleOpenDevTools,
      showUpdateModal,
      commit_id,
      commit_date,
    }
  },
}
</script>

<style lang="less" module>
.progress {
  line-height: 1.5;
}
</style>
