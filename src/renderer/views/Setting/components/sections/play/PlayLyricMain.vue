<template lang="pug">
dd
  h3#play_lyric_main {{ $t('setting__play_lyric_main_title') }}
  div
    //- 本地歌的歌词来源优先级（票 09）：只影响本地歌，两个值都是「先查哪一侧」，另一侧作为回落
    div.gap-top(data-setting-key="lyric.sourcePriority")
      .p.small
        | {{ $t('setting__lyric_source_priority') }}
        common-setting-help-icon(:text="$t('setting__lyric_source_priority_tip')" :label="$t('setting__lyric_source_priority')")
      div
        base-checkbox.gap-left(
          v-for="item in lyricSourcePriorityList" :id="`setting_lyric_source_priority_${item}`" :key="item"
          name="setting_lyric_source_priority" need :model-value="appSetting['lyric.sourcePriority']" :value="item"
          :label="$t(`setting__lyric_source_priority_${item}`)"
          @update:model-value="updateSetting({'lyric.sourcePriority': $event})")
    //- 下面 4 项（翻译 / 罗马音 / 调换 / 逐字）的 key 与桌面歌词窗是**同一个值**（附 B12 有意不拆）：
    //- 前三项共用一条「跨窗共用」帮助（元数据的 helpI18nKey 是同一个 key），第 4 项有自己的性能提示
    .gap-top(data-setting-key="player.isShowLyricTranslation")
      base-checkbox(id="setting_player_lyric_transition" :model-value="appSetting['player.isShowLyricTranslation']" :label="$t('setting__play_lyric_transition')" @update:model-value="updateSetting({'player.isShowLyricTranslation': $event})")
      common-setting-help-icon(:text="$t('setting__help_shared_with_lyric_window')" :label="$t('setting__play_lyric_transition')")
    .gap-top(data-setting-key="player.isShowLyricRoma")
      base-checkbox(id="setting_player_lyric_roma" :model-value="appSetting['player.isShowLyricRoma']" :label="$t('setting__play_lyric_roma')" @update:model-value="updateSetting({'player.isShowLyricRoma': $event})")
      common-setting-help-icon(:text="$t('setting__help_shared_with_lyric_window')" :label="$t('setting__play_lyric_roma')")
    .gap-top(data-setting-key="player.isSwapLyricTranslationAndRoma")
      base-checkbox(id="setting_player_awap_lyric_trans_roma" :model-value="appSetting['player.isSwapLyricTranslationAndRoma']" :label="$t('setting__player_swap_lyric_trans_roma')" @update:model-value="updateSetting({'player.isSwapLyricTranslationAndRoma': $event})")
      common-setting-help-icon(:text="$t('setting__help_shared_with_lyric_window')" :label="$t('setting__player_swap_lyric_trans_roma')")
    .gap-top(data-setting-key="player.isPlayLxlrc")
      base-checkbox(id="setting_player_lyric_play_lxlrc" :model-value="appSetting['player.isPlayLxlrc']" :label="$t('setting__play_lyric_lxlrc')" @update:model-value="updateSetting({'player.isPlayLxlrc': $event})")
      common-setting-help-icon(:text="$t('setting__play_lyric_lxlrc_tip')" :label="$t('setting__play_lyric_lxlrc')")
    //- 是转换不是显示开关：它同时影响**下载的歌词**（文案由票 11 注明）
    .gap-top(data-setting-key="player.isS2t")
      base-checkbox(id="setting_player_lyric_s2t" :model-value="appSetting['player.isS2t']" :label="$t('setting__play_lyric_s2t')" @update:model-value="updateSetting({'player.isS2t': $event})")
      common-setting-help-icon(:text="$t('setting__play_lyric_s2t_tip')" :label="$t('setting__play_lyric_s2t')")
    //- 主窗「当前行放大」；与桌面歌词的 desktopLyric.style.isZoomActiveLrc 是两个独立开关
    .gap-top(data-setting-key="playDetail.isZoomActiveLrc")
      base-checkbox(id="setting_play_detail_font_zoom_enable" :model-value="appSetting['playDetail.isZoomActiveLrc']" :label="$t('setting__play_detail_font_zoom')" @update:model-value="updateSetting({'playDetail.isZoomActiveLrc': $event})")
      common-setting-help-icon(:text="$t('setting__play_detail_font_zoom_tip')" :label="$t('setting__play_detail_font_zoom')")
    //- 逐行滚动延迟 600ms；与桌面歌词的 desktopLyric.isDelayScroll 同名不同物
    .gap-top(data-setting-key="playDetail.isDelayScroll")
      base-checkbox(id="setting_play_detail_lyric_delayScroll" :model-value="appSetting['playDetail.isDelayScroll']" :label="$t('setting__play_detail_lyric_delay_scroll')" @update:model-value="updateSetting({ 'playDetail.isDelayScroll': $event })")
      common-setting-help-icon(:text="$t('setting__play_detail_lyric_delay_scroll_tip')" :label="$t('setting__play_detail_lyric_delay_scroll')")
    //- 主窗歌词对齐；歌词右键菜单里有同一项的入口（改的是同一个值），与桌面歌词那份独立
    div.gap-top(data-setting-key="playDetail.style.align")
      .p.small
        | {{ $t('setting__play_detail_align') }}
        common-setting-help-icon(:text="$t('setting__play_detail_align_tip')" :label="$t('setting__play_detail_align')")
      div
        base-checkbox.gap-left(id="setting_play_detail_align_left" :model-value="appSetting['playDetail.style.align']" need value="left" :label="$t('setting__play_detail_align_left')" @update:model-value="updateSetting({ 'playDetail.style.align': $event })")
        base-checkbox.gap-left(id="setting_play_detail_align_center" :model-value="appSetting['playDetail.style.align']" need value="center" :label="$t('setting__play_detail_align_center')" @update:model-value="updateSetting({ 'playDetail.style.align': $event })")
        base-checkbox.gap-left(id="setting_play_detail_align_right" :model-value="appSetting['playDetail.style.align']" need value="right" :label="$t('setting__play_detail_align_right')" @update:model-value="updateSetting({ 'playDetail.style.align': $event })")
    //- 允许拖拽歌词 seek（误拖会跳歌位，关掉可防手滑）
    .gap-top(data-setting-key="playDetail.isShowLyricProgressSetting")
      base-checkbox(id="setting_play_detail_lyric_progress_enable" :model-value="appSetting['playDetail.isShowLyricProgressSetting']" :label="$t('setting__play_detail_lyric_progress')" @update:model-value="updateSetting({'playDetail.isShowLyricProgressSetting': $event})")
    //- 主窗歌词字号 70–200：歌词右键菜单里改的是同一个值（夹取也在 LyricMenu.vue:117,121），设置页入口由票 05 补
    div.gap-top(data-setting-key="playDetail.style.fontSize")
      .p.small {{ $t('setting__play_detail_font_size') }} {{ appSetting['playDetail.style.fontSize'] }}
      div
        base-input(type="number" :model-value="appSetting['playDetail.style.fontSize']" :placeholder="$t('setting__play_detail_font_size')" @update:model-value="setFontSize")
</template>

<script>
import { debounce } from '@common/utils'
import { LYRIC_SOURCE_PRIORITIES } from '@common/settings/lyricSource'
import { appSetting, updateSetting } from '@renderer/store/setting'

/** 播放 → 歌词显示（主窗）（`play_lyric_main`）：票 09 的歌词来源优先级 + SettingPlay.vue 的 5 个歌词开关 + SettingPlayDetail.vue 全部。 */
export default {
  name: 'PlayLyricMain',
  setup() {
    // 量程照歌词右键菜单的夹取（`LyricMenu.vue:117,121` 的 70–200），落盘防抖 500ms（同 SettingOpenAPI 的端口输入）
    const setFontSize = debounce(value => {
      const num = Number(value)
      if (!Number.isFinite(num)) return
      updateSetting({ 'playDetail.style.fontSize': Math.min(Math.max(Math.trunc(num), 70), 200) })
    }, 500)

    return {
      appSetting,
      updateSetting,
      setFontSize,
      // 取值清单来自 common/settings/lyricSource.ts（单项标签 = `setting__lyric_source_priority_<值>`）
      lyricSourcePriorityList: LYRIC_SOURCE_PRIORITIES,
    }
  },
}
</script>
