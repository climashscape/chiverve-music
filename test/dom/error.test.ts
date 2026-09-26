import { beforeEach, describe, expect, it, vi } from 'vitest'
// 模块顶层副作用：给 window 挂 unhandledrejection / error 两个监听（同时也会挂 Node 侧那两条）
import '@common/error'

/**
 * `src/common/error.ts` 的**渲染侧**兜底（票 03b 的收尾项）。
 *
 * 主进程那两条 `process.on(...)` 管不到渲染进程：渲染进程里没人接的 rejection 是 Blink 以
 * `unhandledrejection` 事件发到 `window` 的，`process.on('unhandledRejection')` 收不到。
 * ⚠️ 这个监听**只为可观测性**：2026-09-26 实测（票 03b），dev 下 webpack-dev-server 的全屏
 * 浮层（`position:fixed; inset:0`，会吞掉真实鼠标输入）不会因为有了它就不弹——该修的仍然是
 * 「调用方接住 rejection」。这里钉住「事件真的被记进 log.error」，不代表它会阻止浮层。
 */

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }))

vi.mock('@common/utils', () => ({
  log: { error: logError, info: vi.fn(), warn: vi.fn() },
}))
describe('common/error 的渲染侧未处理异常记录', () => {
  beforeEach(() => {
    logError.mockClear()
    // 模块里的记录会同时打到 console，用例里静音掉
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('window 的 unhandledrejection → reason 记进 log.error', () => {
    const reason = new Error('没人接的 rejection')
    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    event.reason = reason

    window.dispatchEvent(event)

    expect(logError).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith(reason)
  })

  it('window 的 error（带 error 对象）→ 走渲染侧那条分支并记进 log.error', () => {
    const error = new Error('渲染侧运行时异常')
    const consoleSpy = vi.spyOn(console, 'error')

    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }))

    // 渲染侧独有的标记（Node 侧那条是 'An uncaught error occurred!'）——只断言 logError 会被
    // jsdom 把异常转发给 process 的 uncaughtException 兜底顶掉，证明不了 window 监听生效
    expect(consoleSpy).toHaveBeenCalledWith('An uncaught error occurred in renderer!')
    expect(logError).toHaveBeenCalledWith(error)
  })

  it('资源加载类 error（没有 error/message）→ 仍记一条非空信息，不记 undefined', () => {
    window.dispatchEvent(new Event('error'))

    expect(logError).toHaveBeenCalledTimes(1)
    expect(typeof logError.mock.calls[0][0]).toBe('string')
    expect(logError.mock.calls[0][0]).not.toBe('')
  })
})
