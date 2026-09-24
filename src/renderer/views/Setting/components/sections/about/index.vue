<template lang="pug">
dt#about {{ $t('setting__update_about') }}
dd
  h3#about_update {{ $t('setting__update') }}
  div
    .gap-top
      base-checkbox(
        id="setting__update_tryAutoUpdate" data-setting-key="common.tryAutoUpdate"
        :model-value="appSetting['common.tryAutoUpdate']" :label="$t('setting__update_try_auto_update')"
        @update:model-value="updateSetting({'common.tryAutoUpdate': $event})"
      )
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__update_try_auto_update_tip')" :title="$t('setting__update_try_auto_update_tip')")
    .gap-top
      base-checkbox(
        id="setting__update_showChangeLog" data-setting-key="common.showChangeLog"
        :model-value="appSetting['common.showChangeLog']" :label="$t('setting__update_show_change_log')"
        @update:model-value="updateSetting({'common.showChangeLog': $event})"
      )
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__update_show_change_log_tip')" :title="$t('setting__update_show_change_log_tip')")
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
import { appSetting, updateSetting } from '@renderer/store/setting'

import SettingAboutVersionInfo from './VersionInfo.vue'

/**
 * 更新与关于（`about`）节：更新 / 版本信息 / 许可三组，照元数据顺序渲染。
 *
 * - 「更新」两项的文案要与实情一致（启动自动检查更新被刻意关闭，见 AGENTS §9 品牌隔离）：
 *   两个开关都带 `?` 帮助讲清「什么时候才会检查」，开关标签本身票 04 也改成了「检查到新版本时…」
 *   （不再读成「应用会自己去发现新版本」）。
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
      appSetting,
      updateSetting,
      handleShowPact,
    }
  },
}
</script>
