<template lang="pug">
dt#data {{ $t('setting__data_storage') }}
dd
  h3#data_cache {{ $t('setting__data_cache_title') }}
  div
    SettingDataCacheClear
dd
  h3#data_lyric_offset {{ $t('lyric_menu__offset', { offset: currentOffset }) }}
  div
    .p.small(:class="$style.tip") {{ $t('setting__data_lyric_offset_tip') }}
dd
  h3#data_dislike {{ $t('setting__other_dislike_list') }}
  div
    .p
      | {{ $t('setting__other_dislike_list_label') }}
      span.auto-hidden {{ dislikeRuleCount }}
    .p
      base-btn.btn(min @click="isShowDislikeList = true") {{ $t('setting__other_dislike_list_show_btn') }}
  DislikeListModal(v-model="isShowDislikeList")
dd
  h3#data_list {{ $t('setting__other_listdata') }}
  div
    .p
      base-btn.btn(min @click="handleClearListData") {{ $t('setting__other_listdata_clear_btn') }}
dd
  h3#data_backup {{ $t('setting__backup') }}
  div
    SettingDataBackup
dd
  h3#data_cache_policy {{ $t('setting__data_cache_policy_title') }}
</template>

<script>
import { ref, computed } from '@common/utils/vueTools'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { overwriteListFull } from '@renderer/store/list/listManage'
import { dislikeRuleCount } from '@renderer/store/dislikeList'
import { musicInfo } from '@renderer/store/player/state'

import DislikeListModal from '../../DislikeListModal.vue'
import SettingDataCacheClear from './CacheClearTable.vue'
import SettingDataBackup from './BackupBlock.vue'

// 与歌词右键菜单（LyricMenu.vue）读的是同一个 `[offset:]` 标签——本组只**显示**当前值，
// 改值仍在播放页歌词上右键（归类表附 B10：本组 = 动作说明 + 指向右键菜单）。
const offsetTagRxp = /(?:^|\n)\s*\[offset:\s*(\S+(?:\d+)*)\s*\]/

/**
 * 数据与存储（`data`）节：6 组全部来自元数据表 `SETTING_SECTIONS` 的 data 节，顺序即元数据顺序。
 *
 * 本节 **0 个 `defaultSetting` key**（清理 / 备份 / 偏移都是动作），所以**没有 `data-setting-key`**：
 * 元数据里这 6 组的 `items` 都是空数组，`Item.key` 必填的约束装不下这 20 个非 key 控件
 * （4 组清理行 + 编辑规则 + 清空列表 + 8 个备份按钮 + 歌词偏移说明）。清单见票 03 的回报。
 *
 * `data_cache_policy` 是**票 08 的新组**（`cache.musicUrlKeepDays` / `cache.maxSizeMB` 还没进
 * `defaultSetting`），此刻只渲染组标题保住锚点，票 08 补 key 后再填控件。
 */
export default {
  name: 'SettingSectionData',
  components: {
    DislikeListModal,
    SettingDataCacheClear,
    SettingDataBackup,
  },
  setup() {
    const t = useI18n()

    const currentOffset = computed(() => {
      const matched = offsetTagRxp.exec(musicInfo.lrc ?? '')
      const offset = matched ? parseInt(matched[1]) : 0
      return Number.isNaN(offset) ? 0 : offset
    })

    const isShowDislikeList = ref(false)

    const handleClearListData = async() => {
      if (!await dialog.confirm({
        message: t('setting__other_listdata_clear_tip_confirm'),
        cancelButtonText: t('cancel_button_text'),
        confirmButtonText: t('setting__other_resource_cache_confirm'),
      })) return
      void overwriteListFull({
        defaultList: [],
        loveList: [],
        userList: [],
        tempList: [],
      })
    }

    return {
      dislikeRuleCount,
      currentOffset,
      isShowDislikeList,
      handleClearListData,
    }
  },
}
</script>

<style lang="less" module>
.tip {
  font-size: 12px;
  line-height: 1.3;
  opacity: .7;
}
</style>
