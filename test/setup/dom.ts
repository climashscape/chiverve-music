/**
 * dom（jsdom）环境的公共 setup —— 由 vitest.config.ts 的 `dom` project 的
 * `setupFiles` 加载，在每个 dom 测试文件之前执行一次。
 *
 * 为什么需要它：渲染进程代码从一开始就假定「运行在 Electron 渲染进程里」，
 * 启动时由 `src/renderer/core/globalData.ts` 与 `src/renderer/event/index.ts`
 * 往 window 上挂运行时单例（`window.lx` / `window.lxData` / 事件总线）。
 * 测试里不能跑那两个文件——`globalData.ts` 会 `createWorkers()` 真的去起 worker，
 * `event/index.ts` 会走 IPC 拉快捷键配置。所以这里只补**最小可用**的一份：
 * 字段与真实实现同名同形，值为空壳；模块顶层真的会读到的字段一个都不能少
 * （漏了就是 `Cannot read properties of undefined`，见 AGENTS.md §2.10 的响应式纪律）。
 *
 * 这里只放「所有 dom 测试都需要的桩」。某个测试特有的夹具请写在测试文件里，
 * 别往这里堆。
 */
import { vi } from 'vitest'

/** 极简事件总线：够 `window.app_event.on('x', h)` / `.emit('x')` 这类用法跑通 */
const createEventHub = () => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const hub = {
    on: (name: string, listener: (...args: any[]) => void) => {
      const set = listeners.get(name) ?? new Set()
      listeners.set(name, set)
      set.add(listener)
      return hub
    },
    off: (name: string, listener: (...args: any[]) => void) => {
      listeners.get(name)?.delete(listener)
      return hub
    },
    emit: (name: string, ...args: any[]) => {
      for (const listener of [...(listeners.get(name) ?? [])]) listener(...args)
    },
    // 仓库里的事件总线是「同名方法直接调用」风格（window.app_event.focus() 等），
    // 用 Proxy 兜住未显式列出的动作名，避免未知动作直接抛错
  }
  return new Proxy(hub, {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop]
      return () => {}
    },
  })
}

/** 与 src/renderer/core/globalData.ts 的 window.lx 字段对齐（worker 除外） */
window.lx = {
  isEditingHotKey: false,
  isPlayedStop: false,
  appHotKeyConfig: {
    local: { enable: false, keys: {} },
    global: { enable: false, keys: {} },
  },
  songListInfo: {
    fromName: '',
    searchKey: null,
    searchPosition: 0,
    songlistKey: null,
    songlistPosition: 0,
  },
  restorePlayInfo: null,
  // 测试里不启动 worker：需要 worker 的测试自己用 vi.mock 覆盖
  worker: {} as any,
  isProd: false,
  rootOffset: 8,
  // 三元组形态见 AGENTS.md §2.6 硬约束 4
  apiInitPromise: [Promise.resolve(false), true, () => {}] as [Promise<boolean>, boolean, (success: boolean) => void],
}

// store/setting.ts 会往 window.lxData.appSetting 上挂，store/index.ts 会挂 versionInfo，
// 所以这个对象本身必须先存在（后续由各模块按需填字段）
window.lxData = {}

window.dt = false
window.shouldUseDarkColors = false
window.setTheme = vi.fn()
window.setLang = vi.fn()
// 只有 store/index.ts 的 sourceNames 计算属性会用到；测试里不关心真实文案
window.i18n = { t: (key: string) => key } as any
window.app_event = createEventHub() as any
window.key_event = createEventHub() as any
