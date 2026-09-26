import { beforeEach, describe, expect, it, vi } from 'vitest'
import useMenu from './useMenu'

/**
 * 榜单左栏右键菜单两个动作的 rejection 收口（票 03b 同类）。
 *
 * `menuClick` 里的 `playSongListDetail` / `addSongListDetail` 都要先拉整榜
 * （`getListDetailAll`），网络失败即 reject；原来两个调用既不 await 也不接，
 * rejection 直接漏到顶层——dev 下 webpack-dev-server 据此弹全屏浮层（`fixed; inset:0`）
 * 吞掉真实鼠标输入，生产下是未处理异常。
 *
 * ⚠️ 动作桩用**普通函数**返回裸 `Promise.reject`，不用 `vi.fn().mockRejectedValue`：
 * Vitest 会给 mock 的返回值挂结果跟踪的处理器、提前吞掉「没人接的 rejection」
 * （实测：vi.fn 版本在修复前也收不到 `unhandledRejection`，钉子会假绿）。
 */

const { actions } = vi.hoisted(() => {
  const actions = {
    calls: [] as Array<{ name: string, args: unknown[] }>,
    shouldFail: false,
    async run(name: string, args: unknown[]) {
      actions.calls.push({ name, args })
      if (actions.shouldFail) throw new Error(`${name} 失败`)
    },
  }
  return { actions }
})

vi.mock('../action', () => ({
  playSongListDetail: async(...args: unknown[]) => actions.run('playSongListDetail', args),
  addSongListDetail: async(...args: unknown[]) => actions.run('addSongListDetail', args),
}))
vi.mock('@renderer/plugins/i18n', () => ({ useI18n: () => (key: string) => key }))

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

const boards = [{ id: 'tx__1', name: '巅峰榜' }]

describe('leaderboard/BoardList/useMenu 的 rejection 收口', () => {
  beforeEach(() => {
    actions.calls.length = 0
    actions.shouldFail = false
  })

  it('播放榜单失败 → 无未处理的 rejection', async() => {
    actions.shouldFail = true
    const unhandled = trackUnhandledRejection()

    const { menuClick } = useMenu({ emit: vi.fn(), list: boards })
    menuClick({ action: 'play' }, 0, 'tx')
    await settle()
    unhandled.stop()

    expect(actions.calls).toEqual([{ name: 'playSongListDetail', args: ['tx__1'] }])
    expect(unhandled.reasons).toEqual([])
  })

  it('收藏榜单失败 → 无未处理的 rejection', async() => {
    actions.shouldFail = true
    const unhandled = trackUnhandledRejection()

    const { menuClick } = useMenu({ emit: vi.fn(), list: boards })
    menuClick({ action: 'collect' }, 0, 'tx')
    await settle()
    unhandled.stop()

    expect(actions.calls).toEqual([{ name: 'addSongListDetail', args: ['tx__1', '巅峰榜', 'tx'] }])
    expect(unhandled.reasons).toEqual([])
  })
})
