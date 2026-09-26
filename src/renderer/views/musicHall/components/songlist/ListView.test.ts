import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ListView from './ListView.vue'

/**
 * 歌单广场「列表」取数的 rejection 收口（票 03b 同类）。
 *
 * `getListData` 被 watch 里 `void getListData(...)` 调用，原来 `await getAndSetList(...)`
 * 的 rejection 顺着 async 函数漏到顶层——dev 下 webpack-dev-server 据此弹全屏浮层
 * （`position:fixed; inset:0`）吞掉真实鼠标输入，生产下是未处理异常。
 *
 * 这里挂载真组件（子组件换桩），把 store 的 `getAndSetList` 换成 reject 的桩，钉住
 * 「取数失败后顶层收不到 rejection」（可读提示由 store 写进 listInfo.noItemLabel）。
 */

const { getAndSetList } = vi.hoisted(() => ({ getAndSetList: vi.fn() }))

vi.mock('@renderer/store/songList/action', () => ({ getAndSetList }))
vi.mock('@renderer/components/common/SongCardGrid.vue', () => ({
  // 桩里补上 `scrollTo` / `getScrollTop`：成功路径会通过 `list_ref` 调它们
  default: { name: 'SongCardGrid', props: ['listInfo'], template: '<div />', methods: { scrollTo: () => {}, getScrollTop: () => 0 } },
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useRoute: () => ({ path: '/musicHall', query: {} }),
  onBeforeRouteLeave: vi.fn(),
}))

const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

const settle = async() => { await new Promise(resolve => setTimeout(resolve, 0)) }

describe('musicHall/songlist/ListView 的取数收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAndSetList 失败 → 无未处理的 rejection', async() => {
    getAndSetList.mockRejectedValue(new Error('歌单广场接口挂了'))
    const unhandled = trackUnhandledRejection()

    const wrapper = mount(ListView, {
      props: { source: 'tx', tagId: '', sortId: 'hot', page: 1 },
    })
    await settle()
    unhandled.stop()

    expect(getAndSetList).toHaveBeenCalledWith('tx', '', 'hot', 1)
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })

  it('正常取数不回归：按 source/tagId/sortId/page 发起取数', async() => {
    getAndSetList.mockResolvedValue(undefined)
    const unhandled = trackUnhandledRejection()

    const wrapper = mount(ListView, {
      props: { source: 'tx', tagId: 'tag1', sortId: 'hot', page: 2 },
    })
    await settle()
    unhandled.stop()

    expect(getAndSetList).toHaveBeenCalledWith('tx', 'tag1', 'hot', 2)
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })
})
