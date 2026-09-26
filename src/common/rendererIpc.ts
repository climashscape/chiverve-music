import { ipcRenderer } from 'electron'

export function rendererSend(name: string): void
export function rendererSend<T>(name: string, params: T): void
export function rendererSend<T>(name: string, params?: T): void {
  ipcRenderer.send(name, params)
}

export function rendererSendSync(name: string): void
export function rendererSendSync<T>(name: string, params: T): void
export function rendererSendSync<T>(name: string, params?: T): void {
  ipcRenderer.sendSync(name, params)
}

export async function rendererInvoke(name: string): Promise<void>
export async function rendererInvoke<V>(name: string): Promise<V>
export async function rendererInvoke<T>(name: string, params: T): Promise<void>
export async function rendererInvoke<T, V>(name: string, params: T): Promise<V>
export async function rendererInvoke <T, V>(name: string, params?: T): Promise<V> {
  return ipcRenderer.invoke(name, params)
}

/**
 * `ipcRenderer` 收到的是包了一层的闭包（把 event/params 收成 `{ event, params }`），
 * 而 `removeListener` 是**按引用**匹配的——把原始 listener 交给它永远删不掉那个闭包。
 * 那样一来所有 `rendererOff` 都是空操作：组件卸载后监听器还在，回调里握着已销毁的组件状态。
 *
 * 这里记住「原始 listener → 包装闭包」的对应关系，`rendererOff` 才能按引用摘掉真身。
 * 用数组是因为同一个 listener 允许注册多次，`rendererOff` 每次摘掉最后一次注册的那个
 * （与 Electron `removeListener` 一次摘一个的语义一致）；WeakMap 的键是弱引用，
 * listener 被回收时这条例目自然消失，不会反过来把组件钉在内存里。
 * （2026-09-26 全历史自审查发现：`rendererOff` 有 34 处调用点，此前一处都删不掉。）
 */
const wrappedListeners = new WeakMap<(...args: any[]) => any, Array<(event: any, params: any) => void>>()

const wrapListener = <T>(listener: LX.IpcRendererEventListenerParams<T>) =>
  ((event, params) => { listener({ event, params }) }) as (event: any, params: any) => void

const rememberWrapper = (listener: (...args: any[]) => any, wrapper: (event: any, params: any) => void) => {
  const list = wrappedListeners.get(listener) ?? []
  list.push(wrapper)
  wrappedListeners.set(listener, list)
}

export function rendererOn(name: string, listener: LX.IpcRendererEventListener): void
export function rendererOn<T>(name: string, listener: LX.IpcRendererEventListenerParams<T>): void
export function rendererOn<T>(name: string, listener: LX.IpcRendererEventListenerParams<T>): void {
  const wrapper = wrapListener(listener)
  rememberWrapper(listener, wrapper)
  ipcRenderer.on(name, wrapper)
}

export function rendererOnce(name: string, listener: LX.IpcRendererEventListener): void
export function rendererOnce<T>(name: string, listener: LX.IpcRendererEventListenerParams<T>): void
export function rendererOnce<T>(name: string, listener: LX.IpcRendererEventListenerParams<T>): void {
  const wrapper = wrapListener(listener)
  rememberWrapper(listener, wrapper)
  ipcRenderer.once(name, wrapper)
}

export const rendererOff = (name: string, listener: (...args: any[]) => any) => {
  const list = wrappedListeners.get(listener)
  const wrapper = list?.pop()
  if (wrapper != null) {
    if (list!.length === 0) wrappedListeners.delete(listener)
    ipcRenderer.removeListener(name, wrapper)
    return
  }
  // 兜底：容许摘掉「不是经 rendererOn/rendererOnce 注册的」监听器（保持旧行为）
  ipcRenderer.removeListener(name, listener)
}

export const rendererOffAll = (name: string) => {
  ipcRenderer.removeAllListeners(name)
}
