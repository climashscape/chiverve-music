<template lang="pug">
//- §5.4 搜索行为：五项（元数据顺序）——前三项属「搜索设置」，后两项原是「强迫症设置」（附 A11：该节消失）
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding
div
  .gap-top
    base-checkbox(id="setting_search_showHot_enable" data-setting-key="search.isShowHotSearch" :model-value="appSetting['search.isShowHotSearch']" :label="$t('setting__search_hot')" @update:model-value="updateSetting({'search.isShowHotSearch': $event})")
  .gap-top
    base-checkbox(id="setting_search_showHistory_enable" data-setting-key="search.isShowHistorySearch" :model-value="appSetting['search.isShowHistorySearch']" :label="$t('setting__search_history')" @update:model-value="updateSetting({'search.isShowHistorySearch': $event})")
  .gap-top
    base-checkbox(id="setting_search_focusSearchBox_enable" data-setting-key="search.isFocusSearchBox" :model-value="appSetting['search.isFocusSearchBox']" :label="$t('setting__search_focus_search_box')" @update:model-value="updateSetting({'search.isFocusSearchBox': $event})")
  .gap-top
    base-checkbox(id="setting_odc_isAutoClearSearchInput" data-setting-key="odc.isAutoClearSearchInput" :model-value="appSetting['odc.isAutoClearSearchInput']" :label="$t('setting__odc_clear_search_input')" @update:model-value="updateSetting({'odc.isAutoClearSearchInput': $event})")
  .gap-top
    base-checkbox(id="setting_odc_isAutoClearSearchList" data-setting-key="odc.isAutoClearSearchList" :model-value="appSetting['odc.isAutoClearSearchList']" :label="$t('setting__odc_clear_search_list')" @update:model-value="updateSetting({'odc.isAutoClearSearchList': $event})")
</template>

<script>
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'MyMusicSearchGroup',
  setup() {
    return {
      appSetting,
      updateSetting,
    }
  },
}
</script>
