<template lang="pug">
dt#network {{ $t('setting__network') }}
dd
  h3#network_proxy {{ $t('setting__network_proxy_title') }}
  div
    .p
      base-checkbox(
        id="setting_network_proxy_enable" data-setting-key="network.proxy.enable"
        :model-value="appSetting['network.proxy.enable']" :label="$t('setting__is_enable')"
        @update:model-value="updateSetting({'network.proxy.enable': $event})"
      )
    .p
      .p.small {{ $t('setting__network_proxy_host') }}
      div
        base-input(
          data-setting-key="network.proxy.host"
          :model-value="appSetting['network.proxy.host']" :placeholder="proxy.envProxy ? proxy.envProxy.host : $t('setting__network_proxy_host')"
          @update:model-value="setHost"
        )
        common-setting-help-icon(:text="$t('setting__network_proxy_host_tip')" :label="$t('setting__network_proxy_host')")
    .p
      .p.small {{ $t('setting__network_proxy_port') }}
      div
        base-input(
          data-setting-key="network.proxy.port"
          :model-value="appSetting['network.proxy.port']" :placeholder="proxy.envProxy ? proxy.envProxy.port : $t('setting__network_proxy_port')"
          @update:model-value="setPort"
        )
        common-setting-help-icon(:text="$t('setting__network_proxy_port_tip')" :label="$t('setting__network_proxy_port')")
dd
  h3#network_timeout {{ $t('setting__network_timeout_title') }}
</template>

<script>
import { onBeforeUnmount } from '@common/utils/vueTools'
import { proxy } from '@renderer/store'
import { debounce } from '@common/utils'

import { appSetting, updateSetting } from '@renderer/store/setting'

/**
 * 网络（`network`）节：`network_proxy` 与 `network_timeout` 两组照元数据顺序渲染。
 *
 * - 代理列表项是**全局生效**的：主窗 session / 开放 API 子 session / worker 请求 / userApi 子窗口
 *   统一套这份代理（`main/app.ts`、`winMain/index.ts`、`userApi/main.ts`），所以组标题自带
 *   「乱设置软件将无法联网」的警告——不要「顺手」把它挪走或弱化。
 * - `port` 留空按 80 处理、`host` 为空时即使 `enable` 开着也不生效（`main/utils/index.ts`）：
 *   两条都写进了 `?` 帮助文案。
 * - `onBeforeUnmount` 的收尾是**既有行为**：离开本页时若「开着代理但没填 host」，把运行时开关
 *   也关掉（`proxy.enable = false`），避免留下一个必然失败的代理配置。
 * - `network_timeout` 是**票 06 的新组**（`player.getUrlTimeout` 归「播放 → 播放稳定性」，
 *   在线请求统一超时还写死在 `musicSdk/utils/request.js`），此刻只有组标题保锚点。
 */
export default {
  name: 'SettingSectionNetwork',
  setup() {
    // 输入框逐字更新设置会触发主进程重设代理，故与旧实现一致做 500ms 防抖
    const setHost = debounce(host => {
      updateSetting({ 'network.proxy.host': host.trim() })
    }, 500)
    const setPort = debounce(port => {
      updateSetting({ 'network.proxy.port': port.trim() })
    }, 500)

    onBeforeUnmount(() => {
      if (appSetting['network.proxy.enable'] && !appSetting['network.proxy.host']) proxy.enable = false
    })

    return {
      appSetting,
      updateSetting,
      setHost,
      setPort,
      proxy,
    }
  },
}
</script>
