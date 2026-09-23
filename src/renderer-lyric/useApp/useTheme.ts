import { onBeforeUnmount } from '@common/utils/vueTools'
import { onThemeChange } from '@lyric/utils/ipc'
import { resolveLyricColors } from '@lyric/utils/lyricColors'

export default () => {
  // 歌词文字色只由主题派生（ADR-0007，见 utils/lyricColors.ts），注入一次就够：值是 `var(--color-*)`
  // 间接引用，主题一变 CSS 自己重算，不需要再跑一遍 JS（也就没有「改主题要重启歌词窗」这回事）
  window.setLyricColor(resolveLyricColors())

  const rThemeChange = onThemeChange(({ params: themeSetting }) => {
    window.setTheme(themeSetting.theme.colors)
  })

  onBeforeUnmount(() => {
    rThemeChange()
  })
}
