import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VirtualizedList from './VirtualizedList.vue'

/**
 * `updateView()` 在组件卸载后被触发时的行为（工单 04）。
 *
 * 真机症状（2026-09-25 验收）：dev 实例的渲染进程报
 * `TypeError: Cannot read properties of null (reading 'scrollTop') at updateView`，
 * 且 dev 下这条未捕获异常会弹出 webpack-dev-server 的全屏 overlay（`position:fixed; inset:0`），
 * **把整窗的鼠标事件吞掉**——验收里两次「点了没反应」最后都归因到它。
 *
 * 根因：`updateView(currentScrollTop = dom_scrollContainer.value.scrollTop)` 的默认参数在
 * 调用时求值；三处调用都在异步回调里（`nextTick → requestAnimationFrame`、`ResizeObserver`），
 * 组件一卸载模板 ref 就是 null，回调再跑就抛。
 *
 * 这里把 rAF / ResizeObserver 的回调**收进队列**（不立刻执行），卸载后再统一硬跑一遍
 * ——修之前必抛，修之后必须安静。jsdom 没有 ResizeObserver，用一个假的顶上。
 */

const ITEM_HEIGHT = 30
const makeList = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, name: `song-${i}` }))

const mountList = (list = makeList(50)) => mount(VirtualizedList, {
  props: { itemHeight: ITEM_HEIGHT, keyName: 'id', list },
})

/** 收走 rAF 回调，交给用例决定什么时候跑（模拟「回调排进队列后组件才卸载」） */
const collectRaf = () => {
  const cbs: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    cbs.push(cb)
    return cbs.length
  })
  return cbs
}

/** 把队列跑空：`updateView` 内部还会再排一帧（写 views），一帧就跑完所有已排的回调是不够的 */
const drainRaf = (frames: FrameRequestCallback[]) => {
  let guard = 0
  while (frames.length && guard++ < 10) frames.shift()!(0)
}

/** 硬跑一遍已排进队列的回调（模拟「组件卸载后才轮到它们」） */
const runAll = (frames: Array<(t: number) => void>) => {
  frames.forEach(frame => {
    frame(0)
  })
}

/** 假的 ResizeObserver：只记下回调与实例，不自动触发 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }

  observe() {}

  unobserve() {}

  disconnect() {}
}

describe('VirtualizedList 卸载后触发 updateView（工单 04）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    FakeResizeObserver.instances = []
    vi.unstubAllGlobals()
  })

  it('挂载期排队的 rAF 回调在卸载后跑不抛（修之前：reading scrollTop of null）', async() => {
    const cbs = collectRaf()
    const wrapper = mountList()
    // 等 nextTick 跑完 → 回调已排进 rAF 队列（此时还没执行）
    await flushPromises()
    expect(cbs.length).toBeGreaterThan(0)

    wrapper.unmount()
    expect(() => {
      runAll(cbs)
    }).not.toThrow()
  })

  it('ResizeObserver 的回调在卸载后跑不抛（disconnect 拦不住已排队的回调）', async() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const wrapper = mountList()
    await flushPromises()
    expect(FakeResizeObserver.instances).toHaveLength(1)

    wrapper.unmount()
    const observer = FakeResizeObserver.instances[0]
    expect(() => {
      observer.callback([], observer as any)
    }).not.toThrow()
  })

  it('window.resize 排的定时器在卸载时被清掉，且即使被硬跑也不抛', async() => {
    const timers: Array<() => void> = []
    vi.spyOn(window, 'setTimeout').mockImplementation(((cb: () => void) => {
      timers.push(cb)
      return timers.length
    }) as any)
    const clearSpy = vi.spyOn(window, 'clearTimeout').mockImplementation((() => {}) as any)

    const wrapper = mountList()
    const before = timers.length
    window.dispatchEvent(new Event('resize'))
    const resizeTimers = timers.slice(before)
    expect(resizeTimers).toHaveLength(1)

    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
    expect(() => {
      resizeTimers.forEach(run => {
        run()
      })
    }).not.toThrow()
  })

  it('不回归：rAF 回调正常执行时仍渲染可视区（列表数据没变、卸载前一切照旧）', async() => {
    const cbs = collectRaf()
    const wrapper = mountList()
    await flushPromises()

    drainRaf(cbs)
    await flushPromises()

    // jsdom 没有排版引擎（clientHeight 恒 0）→ 区间至少渲染出第一行
    const content = wrapper.find('.virtualized-list-content')
    expect(content.exists()).toBe(true)
    expect(content.element.children.length).toBeGreaterThan(0)
    // 内容高度 = 列表长度 × 行高（虚拟滚动的滚动条长度靠它）
    expect(content.attributes('style')).toContain(`height: ${50 * ITEM_HEIGHT}px`)
  })
})
