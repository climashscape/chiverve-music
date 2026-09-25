<template lang="pug">
//- §5.3 列表与收藏行为：五项（顺序 = 元数据顺序）
//- 「来源显示」两项（isShowSource / sourceNameType）票 05 收口时已拆到 `MyMusicSourceGroup.vue`
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding
div
  //- 列表每页条数（票 09）：档位与默认值来自 common/settings/pageSize.ts 的单来源；
  //- 改完不强制刷新已加载的列表，下次进页 / 翻页生效（帮助文案里对用户也是这么说的）
  div(data-setting-key="list.pageSize")
    .p.small
      | {{ $t('setting__list_page_size') }}
      common-setting-help-icon(:text="$t('setting__list_page_size_tip')" :label="$t('setting__list_page_size')")
    div
      base-selection.gap-left(:model-value="appSetting['list.pageSize']" :list="pageSizeOptions" item-key="id" item-name="id" @update:model-value="updateSetting({'list.pageSize': $event})")
  .gap-top
    base-checkbox(id="setting_list_actionButtonsVisible_enable" data-setting-key="list.actionButtonsVisible" :model-value="appSetting['list.actionButtonsVisible']" :label="$t('setting__list_action_btn')" @update:model-value="updateSetting({'list.actionButtonsVisible': $event})")
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
import { PAGE_SIZE_OPTIONS } from '@common/settings/pageSize'
import { appSetting, updateSetting } from '@renderer/store/setting'

/**
 * 我的音乐 → 列表与收藏行为（`my_music_list`）：五项，顺序照 `@common/settingMetadata`。
 * 「来源显示」两项已拆到同目录的 `MyMusicSourceGroup.vue`（各自一个锚点组），本文件不再管它们。
 */
export default {
  name: 'MyMusicListGroup',
  setup() {
    return {
      appSetting,
      updateSetting,
      // 档位来自单来源模块（10 / 20 / 30 / 50 / 100），别在模板里另抄一份数字。
      // 用 `{ id }` 对象而不是纯数字数组：`base-selection` 显示当前值时要读 `item[itemName]`，
      // 纯数字数组会渲染出一个空标签（同 DownloadConcurrentNamingGroup 的 maxNums）
      pageSizeOptions: PAGE_SIZE_OPTIONS.map(id => ({ id })),
    }
  },
}
</script>
