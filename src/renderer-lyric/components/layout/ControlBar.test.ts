import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18nPlugin } from '@lyric/plugins/i18n'
import ControlBar from './ControlBar.vue'

/**
 * 桌面歌词控制条上 8 个图标键的**无障碍名**（2026-09-26 复核的缺陷 12）。
 *
 * 这些键原来只有 `title`（悬停提示），没有 `aria-label`：读屏器拿到的是「按钮」两个字，
 * 四个动态键（锁 / 居中放大 / 置顶）连提示都不看的话完全不知道自己在切什么。
 * 按 §2.5.1 规则 11，图标键必须**同时**有 aria-label 与 title，且取同一份 i18n key——
 * 所以这里逐键断言「两个属性都非空且相等」，动态键改文案时也不会两处漂移。
 */
describe('桌面歌词控制条：图标键的 aria-label 与 title', () => {
  it('每个图标键都有同一份文案的 aria-label 与 title', () => {
    const wrapper = mount(ControlBar, { global: { plugins: [i18nPlugin] } })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(8)

    const bad = buttons
      .map((node, index) => ({
        index,
        ariaLabel: node.attributes('aria-label') ?? '',
        title: node.attributes('title') ?? '',
      }))
      // 空白的 aria-label / title，或两者不一致，都算不合格
      .filter(item => !item.ariaLabel.trim() || item.ariaLabel !== item.title)

    // 一条断言里列出全部不合格项，红了能直接看出是第几个键
    expect(bad).toEqual([])
    wrapper.unmount()
  })
})
