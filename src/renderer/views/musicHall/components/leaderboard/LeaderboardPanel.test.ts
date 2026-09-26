import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LeaderboardPanel from './LeaderboardPanel.vue'

/**
 * 排行榜面板 `applyQuery` 的 rejection 收口（票 03b 同类）。
 *
 * watch 里是 `void applyQuery()`，而 `applyQuery` 里的 `getLeaderboardSetting` /
 * `setLeaderboardSetting` 都是 IPC 调用，失败即 reject——原来没人接就漏到顶层，dev 下
 * webpack-dev-server 据此弹全屏浮层（`position:fixed; inset:0`）吞掉真实鼠标输入。
 * 设置读不到时 route.query 仍照常驱动视图，所以只收口 + 留日志。
 *
 * query 里的 source 用已被移除的源（`kw`）：归一到 `tx` 后两者不等，必走
 * `getLeaderboardSetting()` 那条分支——正是要钉的路径。
 */

const { getLeaderboardSetting } = vi.hoisted(() => ({ getLeaderboardSetting: vi.fn() }))

vi.mock('@renderer/utils/data', () => ({
  getLeaderboardSetting,
  setLeaderboardSetting: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useRoute: () => ({ path: '/musicHall', query: { source: 'kw' } }),
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

const mountPanel = () => mount(LeaderboardPanel, {
  global: {
    stubs: { BoardList: true, MusicList: true },
    mocks: { $t: (key: string) => key },
  },
})

describe('musicHall/leaderboard/LeaderboardPanel 的 applyQuery 收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getLeaderboardSetting 失败 → 无未处理的 rejection，面板仍挂载', async() => {
    getLeaderboardSetting.mockRejectedValue(new Error('IPC 拒绝'))
    const unhandled = trackUnhandledRejection()

    const wrapper = mountPanel()
    await settle()
    unhandled.stop()

    expect(getLeaderboardSetting).toHaveBeenCalledTimes(1)
    expect(unhandled.reasons).toEqual([])
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
