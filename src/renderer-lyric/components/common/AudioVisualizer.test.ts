import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AudioVisualizer from './AudioVisualizer.vue'

/**
 * 频谱柱颜色的回落（2026-09-26 复核）。
 *
 * 旧实现读 `getComputedStyle(canvas).color`，再 `color || 'rgba(255,255,255,.12)'` 兜底——
 * 但 `color` 永远返回解析后的 used value（CSS 变量缺失时会回落到继承的 color），**不是空串**，
 * 于是「拿不到主题色就用白色」这条分支永远不可达，注释与实现不符。
 * 现在改为读 `:root` 上主题变量的字面量（`getPropertyValue` 在变量没定义时真的返回空串）。
 *
 * ⚠️ jsdom 对 CSS 变量只做了很浅的解析（`getComputedStyle(el).color` 甚至会把 `var(...)`
 * 原样返回），所以这里不模拟「浏览器里变量缺失 → color 回落」的机制，直接钉组件的输出行为：
 * 主题变量**在** → 用它；**不在** → 用兜底的白色。改回读 `color` 时第一条会红。
 */

const mocks = vi.hoisted(() => ({
  handler: null as null | ((event: { action: string, data: number[] }) => void),
  getAnalyserDataArray: vi.fn(),
}))
vi.mock('@lyric/core/mainWindowChannel', () => ({
  useEvent: (fn: (event: { action: string, data: number[] }) => void) => { mocks.handler = fn },
  getAnalyserDataArray: mocks.getAnalyserDataArray,
}))

/** canvas 的 2d 上下文：jsdom 不装 canvas 包时 `getContext` 返回 null，用假的接住绘制调用 */
const ctx = {
  fillStyle: '' as string | CanvasGradient | CanvasPattern,
  clearRect: vi.fn(),
  fillRect: vi.fn(),
}

const emitAnalyserData = () => mocks.handler?.({ action: 'send_analyser_data_array', data: [255, 128, 0, 64] })

let themeStyle: HTMLStyleElement | null = null

beforeEach(() => {
  mocks.handler = null
  mocks.getAnalyserDataArray.mockClear()
  ctx.fillStyle = ''
  ctx.clearRect.mockClear()
  ctx.fillRect.mockClear()
  ;(HTMLCanvasElement.prototype as any).getContext = () => ctx
  // 组件 onMounted 会 MutationObserver.observe(window.dom_style_theme, …)：
  // 真实歌词窗里由 index.html 建好，测试里补一个（`window.dom_style_theme` 只有运行时字段，
  // 类型声明里没有 → 这里按 any 挂）
  ;(window as any).dom_style_theme = document.createElement('style')
})

afterEach(() => {
  themeStyle?.remove()
  themeStyle = null
})

describe('AudioVisualizer 的主题色与兜底', () => {
  it('主题变量有值 → 频谱柱用主题色（读的是字面量，不是 canvas 的 used color）', () => {
    themeStyle = document.createElement('style')
    // 值按 jsdom 的计算样式序列化形态写（空格的写法会被规范成不带空格）
    themeStyle.textContent = ':root { --color-primary-light-200-alpha-800: rgba(1,2,3,0.5); }'
    document.head.appendChild(themeStyle)

    const wrapper = mount(AudioVisualizer)
    emitAnalyserData()

    expect(ctx.fillStyle).toBe('rgba(1,2,3,0.5)')
    wrapper.unmount()
  })

  it('主题变量缺失（拿到空串）→ 回落 rgba(255,255,255,.12)（旧实现在这里不会回落）', () => {
    const wrapper = mount(AudioVisualizer)
    emitAnalyserData()

    expect(ctx.fillStyle).toBe('rgba(255, 255, 255, .12)')
    wrapper.unmount()
  })
})
