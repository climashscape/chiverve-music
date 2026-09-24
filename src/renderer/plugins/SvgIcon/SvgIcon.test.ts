import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SvgIcon from './SvgIcon.vue'

/**
 * SvgIcon 的提示回归测试（工单 25）。
 *
 * 起因：SVG 元素上的 HTML `title` 属性**不产生原生提示**（浏览器只认 `<title>` 子元素）。
 * 上一轮「删应用气泡、统一原生 title」（工单 11）给 60 多处 `svg-icon` 传了 `:title`，
 * 但那些 `title` 全落在 `<svg>` 上，于是设置页的 `?` 图标「鼠标放上去没反应」。
 *
 * 这里只断言渲染结果：有没有 `<title>` 子元素、文本是不是传进来的值、`aria-hidden` 在不在。
 * 不碰 CSS Modules 类名那类实现细节（同 `components/base/Btn.test.ts` 的口径）。
 */
describe('plugins/SvgIcon/SvgIcon.vue', () => {
  it('传 title → 渲染 <title> 子元素，文本等于该值（原生提示的来源）', () => {
    const wrapper = mount(SvgIcon, { props: { name: 'help-circle-outline' }, attrs: { title: '音源优先级说明' } })

    const title = wrapper.find('title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('音源优先级说明')
    // 属性仍留在 <svg> 上（fallthrough），有的平台/工具链会读它
    expect(wrapper.attributes('title')).toBe('音源优先级说明')
    // 有名字的图标不能被 aria-hidden 摘出无障碍树，否则 aria-label 等于没写
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })

  it('只传 aria-label → 同样渲染 <title> 子元素，文本取 aria-label', () => {
    const wrapper = mount(SvgIcon, { props: { name: 'help-circle-outline' }, attrs: { 'aria-label': '仅有无障碍名' } })

    expect(wrapper.find('title').text()).toBe('仅有无障碍名')
    expect(wrapper.attributes('aria-label')).toBe('仅有无障碍名')
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })

  it('两者都不传 → 不渲染 <title>，保留 aria-hidden（纯装饰图标）', () => {
    const wrapper = mount(SvgIcon, { props: { name: 'angle-right-solid' } })

    expect(wrapper.find('title').exists()).toBe(false)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('空串与非字符串当作没传（不渲染空的 <title>）', () => {
    expect(mount(SvgIcon, { props: { name: 'plus' }, attrs: { title: '' } }).find('title').exists()).toBe(false)
    expect(mount(SvgIcon, { props: { name: 'plus' }, attrs: { title: {} as unknown as string } }).find('title').exists()).toBe(false)
  })

  it('仍然指向 symbol id（sprite 契约不变）', () => {
    const wrapper = mount(SvgIcon, { props: { name: 'music' } })

    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
    // 属性在 xlink 命名空间里（jsdom 序列化出来仍带 xlink: 前缀），这里断言序列化结果而不是 attributes()
    expect(wrapper.find('use').element.outerHTML).toContain('xlink:href="#icon-music"')
  })
})
