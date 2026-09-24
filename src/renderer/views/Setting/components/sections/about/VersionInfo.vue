<template lang="pug">
.gap-top
  //- 「当前版本」这行连点 5 次（1 秒内）打开 DevTools：有意隐藏的手势，勿「顺手清理」（归类表 §9.2）
  .p.small(@click="handleOpenDevTools") {{ $t('setting__update_current_label') }}{{ versionInfo.version }}
  .p.small(v-if="commit_id")
    | {{ $t('setting__update_commit_id') }}
    span.select {{ commit_id }}
  .p.small(v-if="commit_date") {{ $t('setting__update_commit_date') }}{{ commit_date }}
</template>

<script>
import { versionInfo } from '@renderer/store'
import { dateFormat } from '@common/utils/common'
import { openDevTools } from '@renderer/utils/ipc'

/**
 * 「关于 → 版本信息」：只读展示（版本 / 代码版本 / 提交日期），全是**非 key 控件**
 * （没有 `defaultSetting` key，所以没有 `data-setting-key`）。
 *
 * 这里**只剩版本号本身**：原先的「最新版本 / 检查更新 / 下载进度 + 打开更新窗口」那一套
 * 已于 2026-09-24 随应用内更新链路整体删除（用户裁定；ADR-0008 不对外发布任何打包版），
 * 别再从上游把 `useUpdate` / `UpdateModal` / `utils/update.js` 那一套搬回来。
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

    return {
      versionInfo,
      handleOpenDevTools,
      commit_id,
      commit_date,
    }
  },
}
</script>
