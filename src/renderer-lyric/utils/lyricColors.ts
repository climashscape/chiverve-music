import defaultSetting from '@common/defaultSetting'
import { RGB_Alpha_Shade } from '@common/theme/colorUtils'

/**
 * 歌词文字色的取值规则（用户拍板，工单 03）：**一切跟随主题**，设置里那三个颜色只在
 * 「与内置默认值不同」时才生效——不做「是否被用户改过」的状态跟踪。
 * 副作用可接受：用户恰好手动选成默认值时，会看到主题色而不是他选的那个。
 *
 * 主题派生值写成 `var(--color-*)` 间接引用（几个主题变量由 `window.setTheme` 写在 `:root` 上），
 * 于是换主题/切亮暗时 CSS 自己就跟着变了，不需要 JS 逐个重算颜色：
 * - 未播放行 → `--color-1000`：主题的字体色（深色主题偏白、浅色主题偏黑），与面板底色同源
 * - 当前播放行 → `--color-primary-dark-200`：主窗口歌词高亮行用的就是它
 *   （`renderer/components/layout/PlayDetail/LyricPlayer.vue:238`）——这套 primary-dark 在浅色主题里
 *   是压深的强调色、在深色主题里是提亮的强调色，两边都能在各自的面板上读出来。
 *   （别用 `--color-theme`：深色主题下它是 primary-light-900，本机实测 black 主题只有 rgb(59,59,59)，
 *   压在深色面板上等于看不见。）
 * - 描边 → `--color-000`（字体色尺度的另一端）压到低透明度：文字亮则描边暗，反之亦然，
 *   所以切亮/暗主题时描边自动反向，不会出现「白字白描边」把对比度做坏
 */
export const THEME_LYRIC_COLORS = {
  '--color-lyric-unplay': 'var(--color-1000)',
  '--color-lyric-played': 'var(--color-primary-dark-200)',
  '--color-lyric-shadow': 'color-mix(in srgb, var(--color-000) 18%, transparent)',
}

/** 字体模式（逐字歌词）的描边比行模式更弱：与 `RGB_Alpha_Shade(0.49, …)` 同比例 */
const THEME_LYRIC_SHADOW_FONT_MODE = 'color-mix(in srgb, var(--color-000) 9%, transparent)'

export type LyricColorStyle = Record<'--color-lyric-unplay' | '--color-lyric-played' | '--color-lyric-shadow' | '--color-lyric-shadow-font-mode', string>

export const resolveLyricColors = (setting: Partial<LX.DesktopLyric.Config>): LyricColorStyle => {
  const unplayColor = setting['desktopLyric.style.lyricUnplayColor']
  const playedColor = setting['desktopLyric.style.lyricPlayedColor']
  const shadowColor = setting['desktopLyric.style.lyricShadowColor']

  const isUserShadow = shadowColor != null && shadowColor != defaultSetting['desktopLyric.style.lyricShadowColor']

  return {
    '--color-lyric-unplay': unplayColor == null || unplayColor == defaultSetting['desktopLyric.style.lyricUnplayColor']
      ? THEME_LYRIC_COLORS['--color-lyric-unplay']
      : unplayColor,
    '--color-lyric-played': playedColor == null || playedColor == defaultSetting['desktopLyric.style.lyricPlayedColor']
      ? THEME_LYRIC_COLORS['--color-lyric-played']
      : playedColor,
    '--color-lyric-shadow': isUserShadow ? shadowColor : THEME_LYRIC_COLORS['--color-lyric-shadow'],
    '--color-lyric-shadow-font-mode': isUserShadow ? RGB_Alpha_Shade(0.49, shadowColor) : THEME_LYRIC_SHADOW_FONT_MODE,
  }
}
