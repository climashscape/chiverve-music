<template lang="pug">
dd
  h3#appearance_control_bar {{ $t('setting__appearance_control_bar_title') }}
  div
    //- 指**窗口三连按钮**（隐藏/最小化/关闭）贴哪一侧，不是播放控制按钮（附 A4 会改名）
    div.gap-top(data-setting-key="common.controlBtnPosition")
      .p.small {{ $t('setting__basic_control_btn_position') }}
      div
        base-checkbox.gap-left(
          v-for="item in controlBtnPositionList" :id="`setting_basic_control_btn_position_${item.id}`" :key="item.id"
          name="setting_basic_control_btn_position" need :model-value="appSetting['common.controlBtnPosition']" :value="item.id" :label="item.name" @update:model-value="updateSetting({'common.controlBtnPosition': $event})")
    //- 切换播放栏**三套完整布局组件**（迷你/中等/全宽），不是「进度条粗细」
    div.gap-top(data-setting-key="common.playBarProgressStyle")
      .p.small {{ $t('setting__basic_playbar_progress_style') }}
      div
        base-checkbox.gap-left(
          id="setting_basic_playbar_progress_style_mini" name="setting_basic_playbar_progress_style"
          need :model-value="appSetting['common.playBarProgressStyle']" value="mini" :label="$t('setting__basic_playbar_progress_style_mini')" @update:model-value="updateSetting({'common.playBarProgressStyle': $event})")
        base-checkbox.gap-left(
          id="setting_basic_playbar_progress_style_middle" name="setting_basic_playbar_progress_style"
          need :model-value="appSetting['common.playBarProgressStyle']" value="middle" :label="$t('setting__basic_playbar_progress_style_middle')" @update:model-value="updateSetting({'common.playBarProgressStyle': $event})")
        base-checkbox.gap-left(
          id="setting_basic_playbar_progress_style_full" name="setting_basic_playbar_progress_style"
          need :model-value="appSetting['common.playBarProgressStyle']" value="full" :label="$t('setting__basic_playbar_progress_style_full')" @update:model-value="updateSetting({'common.playBarProgressStyle': $event})")
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'

/** 外观 → 控制按钮与播放栏（`appearance_control_bar`）：SettingBasic.vue 的两组复选按钮，合成一个分组。 */
export default {
  name: 'AppearanceControlBar',
  setup() {
    const t = useI18n()

    const controlBtnPositionList = computed(() => {
      return [
        { id: 'left', name: t('setting__basic_control_btn_position_left') },
        { id: 'right', name: t('setting__basic_control_btn_position_right') },
      ]
    })

    return {
      appSetting,
      updateSetting,
      controlBtnPositionList,
    }
  },
}
</script>
