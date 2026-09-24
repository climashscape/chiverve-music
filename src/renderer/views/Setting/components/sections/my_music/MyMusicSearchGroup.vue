<template lang="pug">
//- §5.4 搜索行为：六项（元数据顺序）——「显示历史搜索记录」后面紧跟新增的条数上限；
//- 后两项原是「强迫症设置」（附 A11：该节消失）
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding
div
  .gap-top
    base-checkbox(id="setting_search_showHot_enable" data-setting-key="search.isShowHotSearch" :model-value="appSetting['search.isShowHotSearch']" :label="$t('setting__search_hot')" @update:model-value="updateSetting({'search.isShowHotSearch': $event})")
  .gap-top
    base-checkbox(id="setting_search_showHistory_enable" data-setting-key="search.isShowHistorySearch" :model-value="appSetting['search.isShowHistorySearch']" :label="$t('setting__search_history')" @update:model-value="updateSetting({'search.isShowHistorySearch': $event})")
  //- 搜索历史条数上限（票 09）：紧挨着上面的开关——先决定记不记，再决定最多记几条（0 = 不记历史）
  .gap-top(data-setting-key="search.historyMaxNum")
    .p.small
      | {{ $t('setting__search_history_max_num') }}
      common-setting-help-icon(:text="$t('setting__search_history_max_num_tip')" :label="$t('setting__search_history_max_num')")
    div
      base-input(:class="$style.numInput" type="number" :model-value="appSetting['search.historyMaxNum']" :placeholder="$t('setting__search_history_max_num')" @update:model-value="setHistoryMaxNum")
  .gap-top
    base-checkbox(id="setting_search_focusSearchBox_enable" data-setting-key="search.isFocusSearchBox" :model-value="appSetting['search.isFocusSearchBox']" :label="$t('setting__search_focus_search_box')" @update:model-value="updateSetting({'search.isFocusSearchBox': $event})")
  .gap-top
    base-checkbox(id="setting_odc_isAutoClearSearchInput" data-setting-key="odc.isAutoClearSearchInput" :model-value="appSetting['odc.isAutoClearSearchInput']" :label="$t('setting__odc_clear_search_input')" @update:model-value="updateSetting({'odc.isAutoClearSearchInput': $event})")
  .gap-top
    base-checkbox(id="setting_odc_isAutoClearSearchList" data-setting-key="odc.isAutoClearSearchList" :model-value="appSetting['odc.isAutoClearSearchList']" :label="$t('setting__odc_clear_search_list')" @update:model-value="updateSetting({'odc.isAutoClearSearchList': $event})")
</template>

<script>
import { debounce } from '@common/utils/common'
import {
  SEARCH_HISTORY_MAX_NUM_MAX,
  SEARCH_HISTORY_MAX_NUM_MIN,
} from '@common/settings/searchHistory'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'MyMusicSearchGroup',
  setup() {
    // 落盘防抖 500ms（同 PlayStability 的阈值输入）；量程与规整口径来自单来源模块
    const setHistoryMaxNum = debounce(value => {
      // 输入框被清空时 Number('') 是 0 —— 不落盘，免得「擦掉重打」的中间态把上限写成 0
      if (!value) return
      const num = Number(value)
      if (!Number.isFinite(num)) return
      updateSetting({ 'search.historyMaxNum': Math.min(Math.max(Math.trunc(num), SEARCH_HISTORY_MAX_NUM_MIN), SEARCH_HISTORY_MAX_NUM_MAX) })
    }, 500)

    return {
      appSetting,
      updateSetting,
      setHistoryMaxNum,
    }
  },
}
</script>

<style lang="less" module>
.numInput {
  width: 120px;
}
</style>
