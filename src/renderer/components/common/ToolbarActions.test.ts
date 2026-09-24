import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ToolbarActions from './ToolbarActions.vue'

/**
 * 动作区容器（工单 03）的渲染测试。
 *
 * 测的是**行为契约**，不是实现细节：
 *   1. 插槽内容真的落在 `#toolbar-actions` 里（机制生效）；
 *   2. 页面自己的 DOM 子树里**不**渲染这些键（不会在页内留一份）；
 *   3. 容器卸载（= 切路由）后动作区清空——这是「返回后动作区应清空」的唯一保证。
 *
 * 真实场景里 `#toolbar-actions` 由 `components/layout/Toolbar/index.vue` 渲染、且在页面
 * 之前挂载；这里用同样 id 的宿主元素顶替（Teleport 的 `to` 只是个选择器，与谁渲染无关）。
 * 不断言 CSS Modules 生成的类名（那是实现细节，见 components/base/Btn.test.ts 的口径）。
 */
const mountHost = (slots: string) => mount({
  components: { ToolbarActions },
  template: `<div class="page-root"><toolbar-actions>${slots}</toolbar-actions></div>`,
})

describe('components/common/ToolbarActions.vue', () => {
  let target: HTMLElement

  beforeEach(() => {
    target = document.createElement('div')
    target.id = 'toolbar-actions'
    document.body.appendChild(target)
  })
  afterEach(() => {
    target.remove()
  })

  it('插槽里的键被送进 #toolbar-actions，页面自己的 DOM 里不渲染', () => {
    const wrapper = mountHost('<button type="button">返回</button><button type="button">收藏到 QQ</button>')

    expect(target.querySelectorAll('button')).toHaveLength(2)
    expect(target.textContent).toContain('返回')
    expect(target.textContent).toContain('收藏到 QQ')
    // 页内不留一份：wrapper 的子树里没有按钮
    expect(wrapper.element.querySelector('button')).toBeNull()
    // 页内也**不多出元素节点**：Album 的页面根是 flex column，多一个元素盒子就会多占一行
    // （Teleport 在页内只留一个零长文本锚点，不生成盒子）
    expect(wrapper.element.children).toHaveLength(0)

    wrapper.unmount()
  })

  it('插槽内容装在容器的同一个元素里（等宽/等高/间距的统一落点）', () => {
    const wrapper = mountHost('<button type="button">返回</button><button type="button">在 QQ 音乐打开</button>')

    const buttons = [...target.querySelectorAll('button')]
    expect(buttons).toHaveLength(2)
    // 同一个父元素 → 容器上的 gap / 键上的统一尺寸都作用到每一个键
    expect(buttons[0].parentElement).not.toBeNull()
    expect(buttons[0].parentElement).toBe(buttons[1].parentElement)
    expect(buttons[0].parentElement).toBe(target.firstElementChild)

    wrapper.unmount()
  })

  it('容器卸载后动作区清空（切路由时自动收走，不需要页面自己清理）', () => {
    const wrapper = mountHost('<button type="button">返回</button>')
    expect(target.querySelector('button')).not.toBeNull()

    wrapper.unmount()

    expect(target.querySelector('button')).toBeNull()
    expect(target.textContent).toBe('')
  })
})
