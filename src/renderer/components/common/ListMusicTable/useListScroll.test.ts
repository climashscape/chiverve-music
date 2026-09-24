import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent } from 'vue'
import { nextTick, reactive, ref } from '@common/utils/vueTools'
import useListScroll from './useListScroll'

/**
 * 深链的两套口径（ui-polish-3 工单 08）：
 * - `scrollIndex`：**老口径**，顶部留 150px 上边距（点播放栏进度区的深链）——不能回归；
 * - `scrollIndex + center=1`：**新口径**，把那一行摆到列表中间（播放栏「定位到正在播放」）。
 *
 * 消费点有两处，都要验：
 * 1. 挂载时（`onMounted`，老代码只有这一处）；
 * 2. 页面内换列表时（`props.listId` 变、组件不重建）——「在别的列表页点定位」走的就是这条路：
 *    先跳 `/list?id=A`、再靠它接住；只留 onMounted 的话这一步会静默失效。
 *
 * 这里只测「消费语义」（谁被调用、参数是什么、query 清没清）；滚到哪由
 * `usePlayingRowLocate.test.ts` 与 `utils/playingRowLocate.test.ts` 负责。
 */
const makeHarness = async({ path = '/playlists?id=A', listIds = ['a', 'b', 'c'] }: { path?: string, listIds?: string[] } = {}) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/playlists', component: defineComponent({ render: () => null }) }],
  })
  await router.push(path)
  await router.isReady()

  const centered = vi.fn()
  const scrollToIndex = vi.fn()
  const restored: any[][] = []
  const list = ref(listIds.map(id => ({ id })))
  const props = reactive({ listId: new URLSearchParams(path.split('?')[1] ?? '').get('id') ?? '' })

  let api: ReturnType<typeof useListScroll>
  const Wrapper = defineComponent({
    setup() {
      api = useListScroll({
        props,
        listRef: ref({ scrollToIndex, scrollTo: vi.fn(), getScrollTop: () => 0 }),
        list,
        handleRestoreScroll: (...args: any[]) => { restored.push(args) },
        scrollToIndexCentered: centered,
      })
      return () => null
    },
  })
  const wrapper = mount(Wrapper, { global: { plugins: [router] } })

  return {
    router,
    wrapper,
    props,
    centered,
    scrollToIndex,
    restored,
    api: () => api!,
    /** 消费后的 URL（看两个深链键有没有被清掉） */
    query: () => router.currentRoute.value.query,
  }
}

describe('useListScroll：深链的消费', () => {
  it('带 center=1 时记下「要居中」，并立刻清掉两个深链键（别的 query 保留）', async() => {
    const h = await makeHarness({ path: '/playlists?id=A&scrollIndex=8&center=1&tab=local' })

    expect(h.restored).toEqual([[8, false, true]])
    await flushPromises() // 清参走的是 router.replace（异步导航），等它落地再看 URL
    const query = h.query()
    expect(query.scrollIndex).toBeUndefined()
    expect(query.center).toBeUndefined()
    // 宿主页自己的参数不动（「我的歌单」靠 id / tab 选列表）
    expect(query.id).toBe('A')
    expect(query.tab).toBe('local')
    h.wrapper.unmount()
  })

  it('不带 center 的老深链：按老口径记下（顶部留 150px 上边距那一路）', async() => {
    const h = await makeHarness({ path: '/playlists?id=A&scrollIndex=8' })

    expect(h.restored).toEqual([[8, false, false]])
    await flushPromises()
    expect(h.query().scrollIndex).toBeUndefined()
    h.wrapper.unmount()
  })

  it('恢复滚动：center=false 走 scrollToIndex(-150)，center=true 走居中那条路', async() => {
    const h = await makeHarness()

    await h.api().restoreScroll(8, false, false)
    expect(h.scrollToIndex).toHaveBeenCalledWith(8, -150, false, expect.any(Function))
    expect(h.centered).not.toHaveBeenCalled()

    await h.api().restoreScroll(8, false, true)
    expect(h.centered).toHaveBeenCalledWith(8, false)
    h.wrapper.unmount()
  })

  it('页面内换列表（props.listId 变）也消费深链——「在别的列表页点定位」靠它', async() => {
    const h = await makeHarness({ path: '/playlists?id=A' })
    expect(h.restored).toEqual([])

    // 跳到 B 的列表并带居中深链；props 跟着 query 变（真实链路里由 LocalListsPanel 驱动）
    await h.router.push('/playlists?id=B&scrollIndex=5&center=1')
    h.props.listId = 'B'
    await nextTick()

    expect(h.restored).toEqual([[5, false, true]])
    await flushPromises()
    expect(h.query().scrollIndex).toBeUndefined()
    expect(h.query().center).toBeUndefined()
    h.wrapper.unmount()
  })

  it('同一 id 换到时也不重复消费（清参那一趟不再触发一次滚动）', async() => {
    const h = await makeHarness({ path: '/playlists?id=A&scrollIndex=3&center=1' })
    expect(h.restored).toEqual([[3, false, true]])

    h.props.listId = 'A'
    await nextTick()

    expect(h.restored).toEqual([[3, false, true]])
    h.wrapper.unmount()
  })

  it('没有深链时不动 query（不无谓 replace）', async() => {
    const h = await makeHarness({ path: '/playlists?id=A' })

    expect(h.restored).toEqual([])
    expect(h.query().updated).toBeUndefined()
    h.wrapper.unmount()
  })
})
