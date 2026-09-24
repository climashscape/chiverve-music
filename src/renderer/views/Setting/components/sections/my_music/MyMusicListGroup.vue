<template lang="pug">
//- §5.3 列表与收藏行为：六项（元数据顺序）
//- 「来源显示」两项相邻：先决定挂不挂那一列（isShowSource），再决定列里写别名还是原名（sourceNameType，附 B7）
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding
div
  .gap-top
    base-checkbox(id="setting_list_actionButtonsVisible_enable" data-setting-key="list.actionButtonsVisible" :model-value="appSetting['list.actionButtonsVisible']" :label="$t('setting__list_action_btn')" @update:model-value="updateSetting({'list.actionButtonsVisible': $event})")
  .gap-top
    base-checkbox(id="setting_list_showSource_enable" data-setting-key="list.isShowSource" :model-value="appSetting['list.isShowSource']" :label="$t('setting__list_source')" @update:model-value="updateSetting({'list.isShowSource': $event})")
  div(data-setting-key="common.sourceNameType")
    .p
      | {{ $t('setting__list_source_name_type') }}
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__list_source_tip')" :title="$t('setting__list_source_tip')")
    base-checkbox.gap-left(
      v-for="item in sourceNameTypeList" :id="`setting_list_source_name_type_${item.id}`" :key="item.id"
      name="setting_list_source_name_type" need :model-value="appSetting['common.sourceNameType']" :value="item.id" :label="item.name"
      @update:model-value="updateSetting({'common.sourceNameType': $event})")
  .gap-top
    base-checkbox(id="setting_list_scroll_enable" data-setting-key="list.isSaveScrollLocation" :model-value="appSetting['list.isSaveScrollLocation']" :label="$t('setting__list_scroll')" @update:model-value="updateSetting({'list.isSaveScrollLocation': $event})")
  .gap-top
    base-checkbox(id="setting_list_clickAction_enable" data-setting-key="list.isClickPlayList" :model-value="appSetting['list.isClickPlayList']" :label="$t('setting__list_click_action')" @update:model-value="updateSetting({'list.isClickPlayList': $event})")
  div(data-setting-key="list.addMusicLocationType")
    .p {{ $t('setting__list_add_music_location_type') }}
    base-checkbox.gap-left(
      id="setting_list_add_music_location_type_top" name="setting_list_add_music_location_type" need
      :model-value="appSetting['list.addMusicLocationType']" value="top" :label="$t('setting__list_add_music_location_type_top')"
      @update:model-value="updateSetting({'list.addMusicLocationType': $event})")
    base-checkbox.gap-left(
      id="setting_list_add_music_location_type_bottom" name="setting_list_add_music_location_type" need
      :model-value="appSetting['list.addMusicLocationType']" value="bottom" :label="$t('setting__list_add_music_location_type_bottom')"
      @update:model-value="updateSetting({'list.addMusicLocationType': $event})")
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'MyMusicListGroup',
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
