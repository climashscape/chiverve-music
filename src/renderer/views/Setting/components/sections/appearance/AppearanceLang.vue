<template lang="pug">
dd
  //- 帮助图标挂在分组标题上：这一项的文案就是标题，元数据的 helpI18nKey 讲「两个窗口共用同一个值」
  h3#appearance_lang
    | {{ $t('setting__basic_lang') }}
    common-setting-help-icon(:text="$t('setting__help_shared_with_lyric_window')" :label="$t('setting__basic_lang')")
  div
    //- 改语言会同时换掉托盘菜单 / 桌面歌词窗 / 右键菜单；这个 key 与桌面歌词窗是同一个值（附 B12 有意不拆）
    //- 这一项没有独立标签行：它的文案（`setting__basic_lang`）就是本组标题，再写一遍是同文重复
    div.gap-top(data-setting-key="common.langId")
      base-checkbox.gap-left(
        v-for="item in langList" :id="`setting_lang_${item.locale}`" :key="item.locale" name="setting_lang"
        need :model-value="appSetting['common.langId']" :value="item.locale" :label="item.name" @update:model-value="updateSetting({'common.langId': $event})")
</template>

<script>
import { langList } from '@root/lang'
import { appSetting, updateSetting } from '@renderer/store/setting'

/** 外观 → 语言（`appearance_lang`）：从 SettingBasic.vue 原样搬来。 */
export default {
  name: 'AppearanceLang',
  setup() {
    return {
      appSetting,
      updateSetting,
      langList,
    }
  },
}
</script>
