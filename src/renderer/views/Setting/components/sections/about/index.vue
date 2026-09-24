<template lang="pug">
dt#about {{ $t('setting__update_about') }}
dd
  h3#about_version {{ $t('setting__about_version_title') }}
  div
    SettingAboutVersionInfo
dd
  h3#about_license {{ $t('setting__about_license_title') }}
  div
    .p.small {{ $t('setting__about_product') }}
    .p.small {{ $t('setting__about_based_on') }}
    //- 许可原文不可改（AGENTS §8）：这句既是协议签署状态展示（`common.isAgreePact` 是内部机制键，
    //- 不给开关），也是打开协议原文的入口。票 11 按附 A13 把「半截句 + 按钮」拼成完整的两段：
    //- 上面一句是状态（已完整成句），下面一行只放按钮，避免「你已……的 查看协议。」这种断句。
    .p.small {{ $t('setting__about_pact_tip') }}
    .p.small
      base-btn(min @click="handleShowPact") {{ $t('setting__about_pact_btn') }}
</template>

<script>
import { isShowPact } from '@renderer/store'

import SettingAboutVersionInfo from './VersionInfo.vue'

/**
 * 关于（`about`）节：版本信息 / 许可两组，照元数据顺序渲染。
 *
 * - **没有「软件更新」组**：应用内更新链路（检查更新 / 更新日志 / 下载更新）已于 2026-09-24
 *   整体删除（ADR-0008 不对外发布任何打包版），原 `common.tryAutoUpdate` /
 *   `common.showChangeLog` 两个开关随之退场，别再按上游那套加回来。
 * - 「版本信息」「许可」两组的内容都是非 key 控件（只读展示 + 动作按钮），元数据里 items 为空。
 */
export default {
  name: 'SettingSectionAbout',
  components: {
    SettingAboutVersionInfo,
  },
  setup() {
    const handleShowPact = () => {
      isShowPact.value = true
    }
    return {
      handleShowPact,
    }
  },
}
</script>
