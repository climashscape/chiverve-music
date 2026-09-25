<template lang="pug">
//- §5.3b 来源显示：两项（顺序 = 元数据顺序）——先决定挂不挂那一列，再决定列里写别名还是原名
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding
div
  .gap-top
    base-checkbox(id="setting_list_showSource_enable" data-setting-key="list.isShowSource" :model-value="appSetting['list.isShowSource']" :label="$t('setting__list_source')" @update:model-value="updateSetting({'list.isShowSource': $event})")
  div.gap-top(data-setting-key="common.sourceNameType")
    .p
      | {{ $t('setting__list_source_name_type') }}
      common-setting-help-icon(:text="$t('setting__list_source_tip')" :label="$t('setting__list_source_name_type')")
    base-checkbox.gap-left(
      v-for="item in sourceNameTypeList" :id="`setting_list_source_name_type_${item.id}`" :key="item.id"
      name="setting_list_source_name_type" need :model-value="appSetting['common.sourceNameType']" :value="item.id" :label="item.name"
      @update:model-value="updateSetting({'common.sourceNameType': $event})")
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'

/**
 * 我的音乐 → 来源显示（`my_music_source`，票 05 收口时从 `MyMusicListGroup.vue` 拆成独立锚点组）：
 * 两项搬过来，行为一字未改，只换了安放位置（原先挤在「列表与收藏行为」里，搜索「来源」只能落到那个大组）。
 *
 * 两项的分工（归类表附 B7）：
 * - `list.isShowSource` = 列表行里挂不挂来源小标签（消费点 `ListMusicTable/useListInfo.js`）；
 * - `common.sourceNameType` = 标签里写别名（小秋音乐）还是原名（企鹅音乐），消费点
 *   `store/index.ts` 的 `getSourceName()`——列表标签必须走它，别直接渲染内部值 `tx`。
 */
export default {
  name: 'MyMusicSourceGroup',
  setup() {
    const t = useI18n()

    // 两项就是 getSourceName 的两条分支（store/index.ts：alias → source_alias_*，real → source_*）
    const sourceNameTypeList = computed(() => {
      return [
        { id: 'alias', name: t('setting__list_source_name_type_alias') },
        { id: 'real', name: t('setting__list_source_name_type_real') },
      ]
    })

    return {
      appSetting,
      updateSetting,
      sourceNameTypeList,
    }
  },
}
</script>
