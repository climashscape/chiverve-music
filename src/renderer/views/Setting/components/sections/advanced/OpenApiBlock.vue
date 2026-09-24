<template lang="pug">
div
  .p
    base-checkbox(
      id="setting_open_api_enable" data-setting-key="openAPI.enable"
      :model-value="appSetting['openAPI.enable']" :label="$t('setting__open_api_enable')"
      @update:model-value="updateSetting({ 'openAPI.enable': $event })"
    )
    common-setting-help-icon(:text="$t('setting__open_api_tip')" :label="$t('setting__open_api_enable')")
  .p
    base-checkbox(
      id="setting_open_api_bind_lan" data-setting-key="openAPI.bindLan"
      :model-value="appSetting['openAPI.bindLan']" :label="$t('setting__open_api_bind_lan')"
      @update:model-value="updateSetting({ 'openAPI.bindLan': $event })"
    )
    common-setting-help-icon(:text="$t('setting__open_api_bind_lan_tip')" :label="$t('setting__open_api_bind_lan')")
  .p
    .p.small {{ $t('setting__open_api_port') }}
    div
      base-input(
        data-setting-key="openAPI.port"
        :class="$style.portInput" type="number" :model-value="appSetting['openAPI.port']" :placeholder="$t('setting__open_api_port_tip')"
        @update:model-value="setPort"
      )
      common-setting-help-icon(:text="$t('setting__open_api_port_tip')" :label="$t('setting__open_api_port')")
  //- 服务地址与错误信息是运行时状态（`openAPI.address` / `openAPI.message`），不是设置项
  .p.small
    | {{ $t('setting__open_api_address') }}
    span.select {{ openAPI.address }}
  .p.small(v-if="openAPI.message") {{ openAPI.message }}
</template>

<script>
import { openAPI } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { debounce } from '@common/utils'

/**
 * 「高级 → 开放 API」：三项照元数据顺序（启用 / 允许局域网 / 端口）+ 运行时状态展示。
 *
 * 该功能是**本地 HTTP 服务**：默认只绑回环，开了「允许来自局域网的访问」后绑 0.0.0.0，
 * 局域网内任何设备都能调用且**没有鉴权**（帮助文案里点明了）；改端口会重启服务。
 * `setting__open_api_tip` 的「悬空冒号」票 04 已改掉：这句话现在直说本应用不提供对外接口文档。
 */
export default {
  name: 'SettingAdvancedOpenApi',
  setup() {
    // 端口逐字落盘会重启服务，故与旧实现一致做 500ms 防抖
    const setPort = debounce(port => {
      updateSetting({ 'openAPI.port': port.trim() })
    }, 500)

    return {
      appSetting,
      updateSetting,
      openAPI,
      setPort,
    }
  },
}
</script>

<style lang="less" module>
.portInput[disabled], .hostInput[disabled] {
  opacity: .8 !important;
}
</style>
