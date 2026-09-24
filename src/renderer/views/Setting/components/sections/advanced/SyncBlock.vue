<template lang="pug">
div
  .p
    base-checkbox(
      id="setting_sync_enable" data-setting-key="sync.enable"
      :model-value="appSetting['sync.enable']" :label="$t('setting__sync_enable')"
      @update:model-value="updateSetting({ 'sync.enable': $event })"
    )

  h3 {{ $t('setting__sync_mode') }}
  //- 服务端 / 客户端是同一项（`sync.mode` 二选一），所以 `data-setting-key` 落在包住两个单选的这一行上
  .p(data-setting-key="sync.mode")
    base-checkbox(
      id="setting_sync_mode_server" :disabled="sync.enable"
      :model-value="appSetting['sync.mode']" need value="server" :label="$t('setting__sync_mode_server')"
      @update:model-value="updateSetting({ 'sync.mode': $event })"
    )
    base-checkbox(
      id="setting_sync_mode_client" :disabled="sync.enable"
      :model-value="appSetting['sync.mode']" need value="client" :label="$t('setting__sync_mode_client')"
      @update:model-value="updateSetting({ 'sync.mode': $event })"
    )

  //- 两种模式的内容各自是一整个子组件（`SettingSync/SyncServer`、`SettingSync/SyncClient`，票 03 原样复用）。
  //- ⚠️ 端口 / 服务地址的输入框在**这两个子组件内部**（不能改它们），`data-setting-key` 只能挂在包住
  //- 对应子块的容器上——搜索命中时高亮的是「服务端块 / 客户端块」，控件就在块里（票 02 的退路本来
  //- 也是「找不到控件就闪分组」，这样至少比只闪分组精确）。
  template(v-if="sync.mode == 'client'")
    div(data-setting-key="sync.client.host")
      SettingSyncClient
  template(v-else)
    div(data-setting-key="sync.server.port")
      SettingSyncServer
    //- spec §3：`sync.server.maxSsnapshotNum` 原本无入口但主进程真读（服务端每个用户保留的快照数上限），
    //- 本票补上入口。下限夹到 1：0 或负数会让服务端保留 0 份快照（同步历史直接清空）。
    .p
      .p.small {{ $t('setting__sync_server_max_snapshot_num') }}
      div
        base-input(
          data-setting-key="sync.server.maxSsnapshotNum"
          :class="$style.numInput" type="number" :model-value="appSetting['sync.server.maxSsnapshotNum']" :placeholder="$t('setting__sync_server_max_snapshot_num')"
          @update:model-value="setMaxSnapshotNum"
        )
        svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__sync_server_max_snapshot_num_tip')" :title="$t('setting__sync_server_max_snapshot_num_tip')")
</template>

<script>
import { sync } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { debounce } from '@common/utils/common'

import SettingSyncServer from '../../SettingSync/SyncServer.vue'
import SettingSyncClient from '../../SettingSync/SyncClient.vue'

/**
 * 「高级 → 数据同步」：`sync.enable` / `sync.mode` / 服务端 `port` / 客户端 `host` 四项照元数据顺序，
 * 外加快照上限（`sync.server.maxSsnapshotNum`，spec §3 要求补的入口）。
 *
 * 复用方式：**模式相关的整块内容原样复用 `SettingSync/SyncServer.vue` 与 `SettingSync/SyncClient.vue`**
 * （它们本来就是「一个子组件 = 一种模式」的切分，模板是 `dd`，可直接嵌进本组），本文件只负责
 * 总开关、模式二选一与快照上限。`SettingSync/index.vue`（自带 `dt#advanced_sync` 与裸开关的票 03 前形态）
 * 已随票 04 删除，`SettingSync/` 目录只留这三个被复用的子组件（含 `ServerDeviceListModal.vue`）。
 *
 * 行为保留：模式与端口 / 服务地址在「已开启同步」期间被 `:disabled`（要先关掉才能改）——端口与服务
 * 地址的 disabled 在复用的子组件里，模式二选一的在这里。
 */
export default {
  name: 'SettingAdvancedSync',
  components: {
    SettingSyncServer,
    SettingSyncClient,
  },
  setup() {
    const setMaxSnapshotNum = debounce(value => {
      const num = Math.floor(Number(value))
      // 输入框被清空时 Number('') 是 0 —— 不落盘，免得「擦掉重打」的中间态把上限写成 1
      if (!value || !Number.isFinite(num)) return
      updateSetting({ 'sync.server.maxSsnapshotNum': Math.max(num, 1) })
    }, 500)

    return {
      appSetting,
      updateSetting,
      sync,
      setMaxSnapshotNum,
    }
  },
}
</script>

<style lang="less" module>
.numInput {
  min-width: 160px;
}
</style>
