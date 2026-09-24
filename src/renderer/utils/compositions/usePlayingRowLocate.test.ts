import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { computed, ref, type Ref } from '@common/utils/vueTools'
import { locatePlayingRow as locateCurrentPlayingRow } from '@renderer/utils/playingRowLocate'
import usePlayingRowLocate from './usePlayingRowLocate'

/**
 * 列表侧的「定位到正在播放」（ui-polish-3 工单 08）。
 *
 * 这里守住两件纯函数守不住的事：
 * 1. **容器几何当场量**（不写死像素）：行高 / 可见高变了，滚到的位置要跟着变；
 * 2. **登记的生命周期**：挂载后播放栏才点得动它，卸载后必须注销（否则切走的列表还会接答）。
 *
 * 列表组件用桩：`$el` 给一份能读 clientHeight/scrollHeight 的假容器，`scrollTo` 记下实参。
 * 登记表是模块级的，所以每个用例结束都卸载 —— 不然前一个用例的登记会替后面的接答。
 */
const mounted: Array<{ wrapper: ReturnType<typeof mount>, scrolled: number[] }> = []

afterEach(() => {
  while (mounted.length) mounted.pop()!.wrapper.unmount()
})

/** 假的滚动容器：只给列表组件真正读的三个字段 */
interface FakeContainer {
  clientHeight: number
  scrollHeight: number
  offsetParent: unknown
}

// 形参必须标注：`src/renderer/**` 下的测试文件会被构建期 ts-loader 一起做类型检查（同 csv 时代的
// `settingsEntries.test.ts`），解构形参不标注会以 TS7031 让 `npm run build` 失败。
const mountWithLocator = ({ playingRowIndex, itemHeight = 40, clientHeight = 400, scrollHeight = 4000, visible = true }: {
  playingRowIndex: Ref<number>
  itemHeight?: number
  clientHeight?: number
  scrollHeight?: number
  visible?: boolean
}) => {
  const scrolled: number[] = []
  const el: FakeContainer = { clientHeight, scrollHeight, offsetParent: visible ? document.body : null }
  const listRef = ref({ $el: el, scrollTo: (top: number) => { scrolled.push(top) } })

  const wrapper = mount(defineComponent({
    setup() {
      usePlayingRowLocate({
        listRef,
        listItemHeight: computed(() => itemHeight),
        playingRowIndex,
      })
      return () => null
    },
  }))
  mounted.push({ wrapper, scrolled })

  return { scrolled, el, wrapper }
}

describe('usePlayingRowLocate', () => {
  it('挂载后播放栏点得动：滚到「行中点落在容器中线」的位置', () => {
    const { scrolled } = mountWithLocator({ playingRowIndex: ref(5) })

    expect(locateCurrentPlayingRow()).toBe(true)
    expect(scrolled).toEqual([5 * 40 - (400 - 40) / 2])
  })

  it('几何跟着容器与行高走（改行高 / 改窗口就滚到别处，不是写死的像素）', () => {
    const first = mountWithLocator({ playingRowIndex: ref(5), itemHeight: 40, clientHeight: 400 })
    expect(locateCurrentPlayingRow()).toBe(true)

    const second = mountWithLocator({ playingRowIndex: ref(5), itemHeight: 60, clientHeight: 300 })
    expect(locateCurrentPlayingRow()).toBe(true)

    expect(first.scrolled).toEqual([5 * 40 - (400 - 40) / 2])
    expect(second.scrolled).toEqual([5 * 60 - (300 - 60) / 2])
  })

  it('这首歌不在本列表里（行号 -1）→ 不接答，也不滚动', () => {
    const { scrolled } = mountWithLocator({ playingRowIndex: ref(-1) })

    expect(locateCurrentPlayingRow()).toBe(false)
    expect(scrolled).toEqual([])
  })

  it('列表被 v-show 藏着（没有盒子）→ 不接答（同一页另一份列表在显示时不该抢）', () => {
    const { scrolled } = mountWithLocator({ playingRowIndex: ref(3), visible: false })

    expect(locateCurrentPlayingRow()).toBe(false)
    expect(scrolled).toEqual([])
  })

  it('卸载后注销：切走的列表不再接答', () => {
    const { wrapper, scrolled } = mountWithLocator({ playingRowIndex: ref(3) })
    expect(locateCurrentPlayingRow()).toBe(true)

    wrapper.unmount()
    expect(locateCurrentPlayingRow()).toBe(false)
    expect(scrolled).toHaveLength(1)
  })

  it('暴露的 locatePlayingRow 自己也能调（不带登记那一路）', () => {
    const scrolled: number[] = []
    const listRef = ref({
      $el: { clientHeight: 400, scrollHeight: 4000, offsetParent: document.body },
      scrollTo: (top: number) => { scrolled.push(top) },
    })
    let locate: ((animate?: boolean) => void) | undefined
    const wrapper = mount(defineComponent({
      setup() {
        locate = usePlayingRowLocate({
          listRef,
          listItemHeight: computed(() => 40),
          playingRowIndex: computed(() => 10),
        }).locatePlayingRow
        return () => null
      },
    }))
    mounted.push({ wrapper, scrolled })

    locate?.(false)
    expect(scrolled).toEqual([10 * 40 - (400 - 40) / 2])
  })
})
