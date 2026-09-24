<template lang="pug">
dd
  h3#appearance_animation {{ $t('setting__appearance_animation_title') }}
  div
    //- 总闸：关掉后全局过渡/动画失效，且「弹出层随机动画」被禁用且不再生效
    .gap-top(data-setting-key="common.isShowAnimation")
      base-checkbox(id="setting_show_animate" :model-value="appSetting['common.isShowAnimation']" :label="$t('setting__basic_show_animation')" @update:model-value="updateSetting({'common.isShowAnimation': $event})")
    //- 只影响 material-modal 的弹窗动画，不影响页面切换
    .gap-top(data-setting-key="common.randomAnimate")
      base-checkbox(id="setting_animate" :disabled="!appSetting['common.isShowAnimation']" :model-value="appSetting['common.randomAnimate']" :label="$t('setting__basic_animation')" @update:model-value="updateSetting({'common.randomAnimate': $event})")
</template>

<script>
import { appSetting, updateSetting } from '@renderer/store/setting'

/** 外观 → 动画（`appearance_animation`）：从 SettingBasic.vue 顶层那两个开关搬来（原与其它裸开关挤在一起）。 */
export default {
  name: 'AppearanceAnimation',
  setup() {
    return {
      appSetting,
      updateSetting,
    }
  },
}
</script>
