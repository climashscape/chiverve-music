import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SongListPanel from './SongListPanel.vue'

/**
 * 歌单广场面板 `applyQuery` 的 rejection 收口（票 03b 同类）。
 *
 * watch 里是 `void applyQuery()`，而 `applyQuery` 里的 `getSongListSetting` /
 * `setSongListSetting` 都是 IPC 调用，失败即 reject——原来没人接就漏到顶层，dev 下
 * webpack-dev-server 据此弹全屏浮层（`position:fixed; inset:0`）吞掉真实鼠标输入。
 * 设置读不到时 route.query 仍照常驱动视图，所以只收口 + 留日志。
 *
 * route.query 为空（外部直接进 `/musicHall?tab=songlist`）且 store 没有上次选择时，
 * 必走 `getSongListSetting()` 那条分支——正是要钉的路径。
 */

const { getSongListSetting } = vi.hoisted(() => ({ getSongListSetting: vi.fn() }))

vi.mock('@renderer/utils/data', () => ({
  getSongListSetting,
  setSongListSetting: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useRoute: () => ({ path: '/musicHall', query: {} }),
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

const mountPanel = () => mount(SongListPanel, {
  global: {
    stubs: { TagList: true, SortTab: true, ListView: true, OpenListModal: true },
    mocks: { $t: (key: string) => key },
  },
})

describe('musicHall/songlist/SongListPanel 的 applyQuery 收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getSongListSetting 失败 → 无未处理的 rejection，面板仍挂载', async() => {
    getSongListSetting.mockRejectedValue(new Error('IPC 拒绝'))
    const unhandled = trackUnhandledRejection()

    const wrapper = mountPanel()
    await settle()
    unhandled.stop()

    expect(getSongListSetting).toHaveBeenCalledTimes(1)
    expect(unhandled.reasons).toEqual([])
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
