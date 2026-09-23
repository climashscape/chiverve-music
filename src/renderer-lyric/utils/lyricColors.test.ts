import { describe, expect, it } from 'vitest'
import defaultSetting from '@common/defaultSetting'
import { resolveLyricColors } from './lyricColors'

/**
 * 歌词文字色的用户覆盖规则（工单 03，用户拍板）：
 * 三个颜色与内置默认值相同 → 用主题派生值；不同 → 用用户设置的那个。
 */

describe('resolveLyricColors（主题派生 vs 用户覆盖）', () => {
  it('三个颜色都是内置默认值时，全部走主题派生', () => {
    const colors = resolveLyricColors({})
    expect(colors['--color-lyric-unplay']).toBe('var(--color-1000)')
    expect(colors['--color-lyric-played']).toBe('var(--color-primary-dark-200)')
    expect(colors['--color-lyric-shadow']).toContain('color-mix')
  })

  it('用户改过未播放色 → 用用户值，其余仍走主题', () => {
    const colors = resolveLyricColors({ 'desktopLyric.style.lyricUnplayColor': 'rgba(255, 0, 0, 1)' })
    expect(colors['--color-lyric-unplay']).toBe('rgba(255, 0, 0, 1)')
    expect(colors['--color-lyric-played']).toBe('var(--color-primary-dark-200)')
  })

  it('用户改过描边色 → 用用户值，且字体模式的描边按同比例减淡', () => {
    const colors = resolveLyricColors({ 'desktopLyric.style.lyricShadowColor': 'rgba(0, 0, 0, 0.6)' })
    expect(colors['--color-lyric-shadow']).toBe('rgba(0, 0, 0, 0.6)')
    expect(colors['--color-lyric-shadow-font-mode']).toBe('rgba(0, 0, 0, 0.31)')
  })

  it('值等于内置默认值时视作没改过（不做改没改过的状态跟踪）', () => {
    const colors = resolveLyricColors({
      'desktopLyric.style.lyricUnplayColor': defaultSetting['desktopLyric.style.lyricUnplayColor'],
      'desktopLyric.style.lyricPlayedColor': defaultSetting['desktopLyric.style.lyricPlayedColor'],
      'desktopLyric.style.lyricShadowColor': defaultSetting['desktopLyric.style.lyricShadowColor'],
    })
    expect(colors['--color-lyric-unplay']).toBe('var(--color-1000)')
    expect(colors['--color-lyric-played']).toBe('var(--color-primary-dark-200)')
    expect(colors['--color-lyric-shadow']).toContain('color-mix')
  })
})
