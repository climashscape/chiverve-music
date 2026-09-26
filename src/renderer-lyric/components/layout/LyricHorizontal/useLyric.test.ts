import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from '@common/utils/vueTools'
import { lyric } from '@lyric/store/lyric'
import { setting } from '@lyric/store/state'
import LyricHorizontal from './index.vue'

/**
 * 卸载时的定时器清理（2026-09-26 审查）——水平歌词这一份与垂直版同源同款。
 *
 * 症状面：切 `desktopLyric.direction`（垂直 ⇄ 水平）会**卸载重挂**歌词组件，而 useLyric 里
 * 三条定时链原先一条都没清——3s 的自动滚动恢复（`timeout`）、600ms 的延迟滚动
 * （`delayScrollTimeout`）、`scrollTo` 内部 10ms 一步的滚动动画（`cancelScrollFn`）。
 * 旧的滚动动画还会在已脱离文档的元素上再跑约 300ms。
 *
 * 这里用假定时器 + `scrollTo` 的桩把三件事钉住：
 *   1. 滚轮后挂起的 3s 定时器，卸载时被清掉（`vi.getTimerCount()` 归零）；
 *   2. 开了「延迟滚动」时的 600ms 定时器，卸载时被清掉；
 *   3. 挂载后拿到的滚动取消函数，卸载时被调用（10ms 的动画链不再继续）。
 *
 * `scrollTo` 是 useLyric 唯一的滚动出口，桩掉它就不必碰真实 DOM 的滚动行为
 * （jsdom 的 scrollTop 可写但没有真正的滚动动画）。
 */
const { scrollTo } = vi.hoisted(() => ({ scrollTo: vi.fn() }))
vi.mock('@common/utils/renderer', () => ({ scrollTo }))

/** `lyric.lines` 的一项：`setLyric` 会把它 append 进歌词容器，并要求带 `line-content` 类 */
const makeLine = () => {
  const dom_line = document.createElement('div')
  dom_line.className = 'line-content'
  return { text: '歌词', time: 0, extendedLyrics: [] as string[], dom_line }
}

const originDelayScroll = setting['desktopLyric.isDelayScroll']

beforeEach(() => {
  vi.useFakeTimers()
  scrollTo.mockReset()
  lyric.lines = []
  lyric.line = 0
  setting['desktopLyric.isDelayScroll'] = false
})

afterEach(() => {
  setting['desktopLyric.isDelayScroll'] = originDelayScroll
  lyric.lines = []
  lyric.line = 0
  vi.useRealTimers()
})

describe('LyricHorizontal/useLyric 的卸载清理', () => {
  it('卸载清掉滚轮后的 3s 自动滚动定时器（重挂后没有旧定时器在跑）', async() => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const wrapper = mount(LyricHorizontal)
    await nextTick()

    wrapper.vm.handleWheel({ deltaY: 10 })
    // 3s 后才恢复自动滚动：这一刻有一条挂起的定时器
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    // 修复前这里是 1：定时器活着，重挂后它还会在已脱离文档的实例上触发
    expect(vi.getTimerCount()).toBe(0)
    log.mockRestore()
  })

  it('卸载清掉「延迟滚动」的 600ms 定时器', async() => {
    setting['desktopLyric.isDelayScroll'] = true
    lyric.lines = [makeLine()]
    const wrapper = mount(LyricHorizontal)
    await nextTick()
    await nextTick()

    // 0 → 1 是相邻行，走 600ms 延迟分支
    lyric.line = 1
    await nextTick()
    // 跑掉 scrollLine 里的 setImmediate，只留那条 600ms 的
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('卸载调用滚动动画的取消函数（10ms 一步的动画不再往已脱离文档的元素上写）', async() => {
    const cancel = vi.fn()
    scrollTo.mockReturnValue(cancel)
    lyric.lines = [makeLine()]
    const wrapper = mount(LyricHorizontal)
    await nextTick()
    await nextTick()

    // 挂载后按当前行定位一次，取消函数就是这一次动画的
    expect(scrollTo).toHaveBeenCalled()

    wrapper.unmount()
    expect(cancel).toHaveBeenCalled()
  })
})
