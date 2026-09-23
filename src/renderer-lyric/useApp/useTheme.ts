import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { setting } from '@lyric/store/state'
import { onThemeChange } from '@lyric/utils/ipc'
import { resolveLyricColors } from '@lyric/utils/lyricColors'

export default () => {
  // 歌词文字色：设置项只在「与内置默认值不同」时才算用户覆盖，否则用主题派生色（见 utils/lyricColors.ts）
  const applyLyricColors = () => {
    window.setLyricColor(resolveLyricColors(setting))
  }

  const rThemeChange = onThemeChange(({ params: themeSetting }) => {
    window.setTheme(themeSetting.theme.colors)
    // 主题派生色是 `var(--color-*)` 间接引用，主题一换 CSS 自己就跟着变；这里重算一次是为了
    // 让「用户覆盖」的分支也能重新判定（三个颜色都没改过时结果不变，只是把同一份声明重写一遍）
    applyLyricColors()
  })

  watch(() => [setting['desktopLyric.style.lyricUnplayColor'], setting['desktopLyric.style.lyricPlayedColor'], setting['desktopLyric.style.lyricShadowColor']], applyLyricColors, {
    immediate: true,
  })

  onBeforeUnmount(() => {
    rThemeChange()
  })
}
