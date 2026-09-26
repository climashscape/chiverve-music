import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18nPlugin } from '@renderer/plugins/i18n'
import zhCn from '@root/lang/zh-cn.json'
import SettingSectionHotKey from './index.vue'

/**
 * 快捷键录入框的接线（2026-09-26 复核的缺陷 8，**真 bug**）。
 *
 * 真机症状：设置 → 快捷键里点进任一录入框，键入一个键——focus 无提示、blur 不落盘、按键即抛。
 * 根因：`HotKeyGrid` 只 `$emit('focus', $event, item)`，而父组件的事件处理函数签名是
 * `(event, info, type)` → `type` 恒为 `undefined` → `hotKeyConfig.value[undefined][info.name]`
 * 直接抛 `TypeError`（在 `setTimeout` 里，异步抛出，界面上只表现为「没反应」）。
 *
 * 这里走完整条链路：真的 `HotKeyGrid`（只有 `base-input` 是替身）+ 父组件，
 * 聚焦 → 按键 → 失焦，断言**配置真的落了盘**（`hotKeySetConfig` 的 config 动作里带着新键）。
 * 这是一条「父组件按组名取值」的钉子：组名传丢就会在第一步抛错，后面的落盘断言都到不了。
 */
const mocks = vi.hoisted(() => ({
  allHotKeys: {
    local: [
      { name: 'player_toggle_play', action: 'music_play', type: 'winMain' },
      { name: 'player_prev', action: 'music_prev', type: 'winMain' },
    ],
    global: [
      { name: 'player_toggle_play', action: 'music_play', type: 'global' },
    ],
  },
  hotKeySetEnable: vi.fn(),
  hotKeySetConfig: vi.fn(),
  hotKeyGetStatus: vi.fn(),
}))

vi.mock('@renderer/utils/ipc', () => ({
  allHotKeys: mocks.allHotKeys,
  hotKeySetEnable: mocks.hotKeySetEnable,
  hotKeySetConfig: mocks.hotKeySetConfig,
  hotKeyGetStatus: mocks.hotKeyGetStatus,
}))

/** 真实值的形状：`window.lx.appHotKeyConfig`（`enable` + `keys: { 键名: { name, action, type } }`） */
const OLD_KEY = 'mod+f5'
const NEW_KEY = 'mod+f6'
const makeConfig = () => ({
  local: {
    enable: true,
    keys: { [OLD_KEY]: { name: 'player_toggle_play', action: 'music_play', type: 'winMain' } },
  },
  global: { enable: false, keys: {} },
})

const flushTimers = async() => {
  // 两个处理函数都在 `setTimeout` 里干活（避开 focus/blur 事件本身的时序），等一个宏任务就够
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

const mountSection = () => mount(SettingSectionHotKey, {
  global: {
    plugins: [i18nPlugin],
    stubs: {
      // 只留一个真 input：focus / blur / value 都要能用（`readonly` + 直接写 value 是它的用法）
      'base-input': { props: ['modelValue', 'placeholder'], template: '<input :value="modelValue">' },
      'base-checkbox': { props: ['label'], template: '<label>{{ label }}</label>' },
      'svg-icon': true,
    },
  },
})

let wrapper: ReturnType<typeof mountSection> | null = null

/**
 * 推一个应用级事件。`window.app_event` 的**类型**（`renderer/event/appEvent.ts`）只声明业务方法
 * （`keyDown(...)` → `emit('keyDown', ...)`），而测试环境挂的是 `test/setup/dom.ts` 的极简 hub，
 * 只有 `on` / `off` / `emit` 三个动作——所以这里显式走 hub 的 `emit`。
 */
const emitAppEvent = (name: string, payload: unknown) => {
  (window.app_event as unknown as { emit: (name: string, payload: unknown) => void }).emit(name, payload)
}

/** `hotKeySetConfig` 收到的 config 动作（落盘那一次） */
const savedConfig = () => mocks.hotKeySetConfig.mock.calls
  .map((call: any[]) => call[0])
  .find((action: any) => action?.action === 'config')

beforeEach(() => {
  mocks.hotKeySetEnable.mockReset().mockResolvedValue(undefined)
  mocks.hotKeySetConfig.mockReset().mockResolvedValue(undefined)
  mocks.hotKeyGetStatus.mockReset().mockResolvedValue({})
  // 组件会**原地改**这个对象（delete / 新增键），每个用例给一份新的，免得互相污染
  window.lx.appHotKeyConfig = makeConfig() as any
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('SettingSectionHotKey：录入一个热键能落盘', () => {
  it('聚焦 → 按键 → 失焦：新键写进配置并落盘，旧键被摘掉', async() => {
    wrapper = mountSection()
    const input = wrapper.get('input[data-setting-id="hot_key_local_player_toggle_play"]')

    // 聚焦：先给「请键入新的按键」的提示（这一步原来就抛 TypeError）
    await input.trigger('focus')
    await flushTimers()
    expect((input.element as HTMLInputElement).value).toBe(zhCn.setting__hot_key_tip_input)

    // 键入：主进程把按键推给窗口（`window.app_event` 的 keyDown），组件写进框里
    const event = { repeat: false, target: input.element, preventDefault: vi.fn() }
    emitAppEvent('keyDown', { event, key: NEW_KEY, type: 'down' })
    expect(event.preventDefault).toHaveBeenCalled()
    expect((input.element as HTMLInputElement).value).not.toBe(zhCn.setting__hot_key_tip_input)

    // 失焦：落盘
    await input.trigger('blur')
    await flushTimers()

    const saved = savedConfig()
    expect(saved).toBeTruthy()
    expect(saved.data.local.keys[NEW_KEY]).toMatchObject({ name: 'player_toggle_play', action: 'music_play' })
    expect(saved.data.local.keys[OLD_KEY]).toBeUndefined()
    expect(window.lx.appHotKeyConfig.local.keys[NEW_KEY]).toMatchObject({ name: 'player_toggle_play' })
  })

  it('全局组同样能落盘（组名 local / global 都要传对，不能只修一组）', async() => {
    wrapper = mountSection()
    // 全局组默认折叠（v-show），DOM 里仍然在
    const input = wrapper.get('input[data-setting-id="hot_key_global_player_toggle_play"]')

    await input.trigger('focus')
    await flushTimers()
    const event = { repeat: false, target: input.element, preventDefault: vi.fn() }
    emitAppEvent('keyDown', { event, key: 'mod+f8', type: 'down' })
    await input.trigger('blur')
    await flushTimers()

    const saved = savedConfig()
    expect(saved.data.global.keys['mod+f8']).toMatchObject({ name: 'player_toggle_play' })
  })
})
