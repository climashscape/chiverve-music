<template lang="pug">
dd
  h3#desktop_lyric_reset {{ $t('setting__desktop_lyric_reset') }}
  div
    //- 本组没有带 key 的项：4 个几何 key（desktopLyric.width/height/x/y）是 INTERNAL_ONLY_KEYS，
    //- 由拖拽/缩放直接写入，设置页只留这个「重置窗口设置」按钮（写回 450×300 + x/y=null）
    .p.gap-top
      base-btn.btn(min @click="resetWindowSetting") {{ $t('setting__desktop_lyric_reset_window') }}
</template>

<script>
import { updateSetting } from '@renderer/store/setting'

/** 桌面歌词 → 重置（`desktop_lyric_reset`）：从 SettingDesktopLyric.vue 搬来，行为不变。 */
export default {
  name: 'DesktopLyricReset',
  setup() {
    const resetWindowSetting = () => {
      updateSetting({
        'desktopLyric.width': 450,
        'desktopLyric.height': 300,
        'desktopLyric.x': null,
        'desktopLyric.y': null,
      })
    }

    return {
      resetWindowSetting,
    }
  },
}
</script>
