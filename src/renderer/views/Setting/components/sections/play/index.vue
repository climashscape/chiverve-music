<template lang="pug">
dt#play {{ $t('setting__play') }}
//- 分组顺序 = settingMetadata 的 SETTING_SECTIONS[play].groups 顺序，不许重排
PlayBehavior
PlayDefaults
PlayLyricMain
PlayQuality
PlayAudioDevice
PlayStability
PlayTimeout
</template>

<script>
import PlayBehavior from './PlayBehavior.vue'
import PlayDefaults from './PlayDefaults.vue'
import PlayLyricMain from './PlayLyricMain.vue'
import PlayQuality from './PlayQuality.vue'
import PlayAudioDevice from './PlayAudioDevice.vue'
import PlayStability from './PlayStability.vue'
import PlayTimeout from './PlayTimeout.vue'

/**
 * 播放节（设置页重构票 03）：元数据里本节 7 个分组，7 个都有内容（各一个子组件）。
 *
 * 契约（票 02 立、本票接着守）：
 * - 分组的 DOM 锚点 id = `settingMetadata` 的 `group.id`，写在分组自己的 `h3` 上；
 * - 每个设置项的控件带 `data-setting-key="<item.key>"`（搜索命中高亮按它定位，见 useSettingToc.ts）。
 * 内容来源：SettingPlay 全部 + SettingPlayDetail 全部 + SettingBasic 的「定时暂停」按钮 +
 * 票 05 补的「播放控制默认值」组（5 个只有浮层入口的 key）+ 票 06 的「播放稳定性」组
 * （9 个阈值 + 1 个失败策略，key 由该票新建）。
 * 旧组件 `SettingPlay.vue` / `SettingPlayDetail.vue` 已退场（票 03 摘内容、票 04 删文件）。
 */
export default {
  name: 'SettingSectionPlay',
  components: {
    PlayBehavior,
    PlayDefaults,
    PlayLyricMain,
    PlayQuality,
    PlayAudioDevice,
    PlayStability,
    PlayTimeout,
  },
}
</script>
