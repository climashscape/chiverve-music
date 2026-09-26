import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appSetting } from '@renderer/store/setting'
import BlankView from './BlankView.vue'

/**
 * 搜索页空态「搜索历史」读取的 rejection 收口（票 03b 同类）。
 *
 * `setup` 里 `void getHistoryList()` 读的是 IPC（搜索历史文件），失败即 reject；原来没人接
 * 就漏到顶层——dev 下 webpack-dev-server 据此弹全屏浮层（`position:fixed; inset:0`）
 * 吞掉真实鼠标输入，生产下是未处理异常。历史读不到不影响搜索本身，只收口 + 留日志。
 *
 * ⚠️ `getHistoryList` 桩用**普通函数**返回裸 `Promise.reject`，不用 `vi.fn().mockRejectedValue`：
 * Vitest 会给 mock 的返回值挂结果跟踪的处理器、提前吞掉「没人接的 rejection」
 * （实测：vi.fn 版本在修复前也收不到 `unhandledRejection`，钉子会假绿）。
 *
 * 热词那条 `getList` 走的是自带 catch 的 `store/hotSearch`，这里一并关掉设置，
 * 让用例只盯历史这一条。
 */

const { historyMock } = vi.hoisted(() => {
  const historyMock = {
    calls: 0,
    shouldFail: false,
  }
  return { historyMock }
})

vi.mock('@renderer/store/search/action', () => ({
  getHistoryList: async() => {
    historyMock.calls++
    if (historyMock.shouldFail) throw new Error('历史文件读失败')
  },
  removeHistoryWord: () => {},
  clearHistoryList: () => {},
}))
vi.mock('@renderer/store/hotSearch', () => ({ getList: async() => [] }))
vi.mock('@common/utils/vueRouter', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

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

const mountBlankView = () => mount(BlankView, {
  props: { visible: true, source: 'tx' },
  global: { mocks: { $t: (key: string) => key } },
})

describe('Search/BlankView 的搜索历史收口', () => {
  beforeEach(() => {
    historyMock.calls = 0
    historyMock.shouldFail = false
    appSetting['search.isShowHotSearch'] = false
    appSetting['search.isShowHistorySearch'] = true
  })

  it('getHistoryList 失败 → 无未处理的 rejection', async() => {
    historyMock.shouldFail = true
    const unhandled = trackUnhandledRejection()

    const wrapper = mountBlankView()
    await settle()
    unhandled.stop()

    expect(historyMock.calls).toBe(1)
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })

  it('正常返回不回归：仍会调用一次历史读取', async() => {
    const unhandled = trackUnhandledRejection()

    const wrapper = mountBlankView()
    await settle()
    unhandled.stop()

    expect(historyMock.calls).toBe(1)
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })
})
