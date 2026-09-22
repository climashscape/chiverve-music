import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Btn from './Btn.vue'

/**
 * SFC 渲染测试的样板：证明 `@vitejs/plugin-vue` + jsdom + `@vue/test-utils` 这条链
 * 在本工程可用（组件里的 `<style lang="less" module>` 靠 `test.css: false` 退化成
 * 「键名即类名」的代理，不需要 less 变量与真实资源）。
 *
 * 断言不写死 CSS Modules 生成的类名（那是实现细节）：`outline`/`min` 各多挂一个
 * 类、基础类在所有挂载间保持一致，就足以证明 props 确实作用到了 class 绑定上。
 */
describe('components/base/Btn.vue', () => {
  it('能挂载并渲染默认插槽内容', () => {
    const wrapper = mount(Btn, { slots: { default: '播放' } })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.text()).toBe('播放')
  })

  it('props 生效：outline / min 各多挂一个类，基础类不变', () => {
    const base = mount(Btn).classes()
    const outline = mount(Btn, { props: { outline: true } }).classes()
    const min = mount(Btn, { props: { min: true } }).classes()

    expect(base).toHaveLength(1)
    expect(base[0]).toBeTruthy()
    expect(outline).toHaveLength(2)
    expect(min).toHaveLength(2)
    expect(outline).toContain(base[0])
    expect(min).toContain(base[0])
  })

  it('disabled 透传到原生 button 元素', () => {
    expect(mount(Btn).element.disabled).toBe(false)
    expect(mount(Btn, { props: { disabled: true } }).element.disabled).toBe(true)
  })

  it('点击能触发 click 事件（组件没声明 emits，监听器透传到根元素）', async() => {
    const onClick = vi.fn()
    const wrapper = mount(Btn, { attrs: { onClick } })

    await wrapper.trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
