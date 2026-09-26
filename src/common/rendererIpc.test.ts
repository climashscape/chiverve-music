import { describe, expect, it, vi } from 'vitest'
import { ipcRenderer } from 'electron'
import { __ipcRendererEmit } from '../../test/stubs/electron'
import { rendererOff, rendererOn, rendererOnce } from './rendererIpc'

/**
 * 监听器必须真能被摘掉。
 *
 * 曾经的实现把**原始 listener** 交给 `removeListener`，而 `ipcRenderer.on` 收到的是包了一层的
 * 闭包——按引用匹配永远删不掉，34 处 `rendererOff` 全是空操作（组件卸载后监听器继续回调）。
 * 这三条用例钉住「注册 → 摘掉 → listenerCount 归零且不再收到事件」。
 */
describe('rendererOn / rendererOff', () => {
  it('rendererOff 之后监听器真的被摘掉（不再收到事件）', () => {
    const name = 'unit_test_renderer_off'
    const listener = vi.fn()

    rendererOn(name, listener)
    expect(ipcRenderer.listenerCount(name)).toBe(1)

    __ipcRendererEmit(name, { hello: 'world' })
    expect(listener).toHaveBeenCalledTimes(1)
    // 派发形态是 `{ event, params }`（与主进程 mainSend 的包装约定一致）
    expect(listener.mock.calls[0][0].params).toEqual({ hello: 'world' })

    rendererOff(name, listener)
    expect(ipcRenderer.listenerCount(name)).toBe(0)
    // 桩在没有监听者时会抛错——正好当作「真的摘掉了」的第二重断言
    expect(() => { __ipcRendererEmit(name, { hello: 'again' }) }).toThrow()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rendererOnce 在触发前也能被摘掉', () => {
    const name = 'unit_test_renderer_off_once'
    const listener = vi.fn()

    rendererOnce(name, listener)
    expect(ipcRenderer.listenerCount(name)).toBe(1)

    rendererOff(name, listener)
    expect(ipcRenderer.listenerCount(name)).toBe(0)
  })

  it('同一个 listener 注册两次再摘一次，只摘掉对应的那一个（不误伤）', () => {
    const name = 'unit_test_renderer_off_duplicate'
    const listener = vi.fn()

    rendererOn(name, listener)
    rendererOn(name, listener)
    expect(ipcRenderer.listenerCount(name)).toBe(2)

    rendererOff(name, listener)
    expect(ipcRenderer.listenerCount(name)).toBe(1)

    rendererOff(name, listener)
    expect(ipcRenderer.listenerCount(name)).toBe(0)
  })
})
