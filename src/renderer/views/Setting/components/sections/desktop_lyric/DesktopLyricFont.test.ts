import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { appSetting } from '@renderer/store/setting'
import DesktopLyricFont from './DesktopLyricFont.vue'
import PlayLyricMain from '../play/PlayLyricMain.vue'

/**
 * 数字输入的空值与越界（2026-09-26 复核的缺陷 10）。
 *
 * 原来两个组件都写 `Number(value)` 再夹取，于是：
 *   - **空输入**：`Number('') === 0` → 夹成下限（字号 10 / 70、不透明度 6）并落盘；
 *   - **越界**：夹取结果与当前值相同时主进程 `mergeSetting` 跳过该 key（不落盘也不回推），
 *     框停在越界文本上（显示 999、实际 200），用户以为改成功了。
 *
 * 这里钉三件事：空输入**不写**、越界值**夹取后落盘**、越界后**框里回推成生效值**。
 * 防抖 500ms 用假定时器推。
 */
const mocks = vi.hoisted(() => ({ updateSetting: vi.fn() }))

vi.mock('@renderer/store/setting', async(importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  updateSetting: mocks.updateSetting,
}))
// 组件 setup 里就会取系统字体（真件走 IPC，测试环境没人应答）
vi.mock('@renderer/utils/ipc', () => ({
  getSystemFonts: vi.fn().mockResolvedValue([]),
}))

/**
 * `base-input` 替身：既要能 `setValue`（写进 DOM），也要像真件那样把输入**回传**给父组件
 * （`update:modelValue`）——不回传的话 `v-model` 与 `@update:model-value` 都不会跑，测试是假绿。
 */
const stubs = {
  'base-input': {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
  'base-checkbox': { props: ['label'], template: '<label>{{ label }}</label>' },
  'base-btn': { template: '<button><slot /></button>' },
  'base-selection': true,
  'common-setting-help-icon': true,
}

const mountWith = (component: unknown) => mount(component as never, {
  global: { plugins: [i18nPlugin], stubs },
})

/** 定住 500ms 防抖（两个组件的落盘都是 500ms） */
const runDebounce = async() => {
  vi.advanceTimersByTime(600)
  await nextTick()
}

/** 取某个 `data-setting-key` 那一行里的输入框 */
const inputOf = (wrapper: ReturnType<typeof mountWith>, key: string) => wrapper.get(`[data-setting-key="${key}"] input`)

beforeEach(() => {
  vi.useFakeTimers()
  mocks.updateSetting.mockReset()
  appSetting['desktopLyric.style.fontSize'] = 30
  appSetting['desktopLyric.style.opacity'] = 50
  appSetting['playDetail.style.fontSize'] = 100
})

afterEach(() => {
  vi.useRealTimers()
})

describe('桌面歌词排版：字号 / 不透明度的数字输入', () => {
  it('清空输入框不落盘（不把空输入夹成下限 10）', async() => {
    const wrapper = mountWith(DesktopLyricFont)
    const input = inputOf(wrapper, 'desktopLyric.style.fontSize')

    await input.setValue('')
    await runDebounce()

    expect(mocks.updateSetting).not.toHaveBeenCalled()
    expect(appSetting['desktopLyric.style.fontSize']).toBe(30)
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('越界值被夹取后落盘，并把框里的内容回推成生效值', async() => {
    const wrapper = mountWith(DesktopLyricFont)
    const input = inputOf(wrapper, 'desktopLyric.style.fontSize')

    await input.setValue('999')
    await runDebounce()

    expect(mocks.updateSetting).toHaveBeenCalledWith({ 'desktopLyric.style.fontSize': 80 })
    expect((input.element as HTMLInputElement).value).toBe('80')
    wrapper.unmount()
  })

  it('不透明度同样：空不写、越界回推（下限 6 / 上限 100）', async() => {
    const wrapper = mountWith(DesktopLyricFont)
    const input = inputOf(wrapper, 'desktopLyric.style.opacity')

    await input.setValue('')
    await runDebounce()
    expect(mocks.updateSetting).not.toHaveBeenCalled()

    await input.setValue('-5')
    await runDebounce()
    expect(mocks.updateSetting).toHaveBeenCalledWith({ 'desktopLyric.style.opacity': 6 })
    expect((input.element as HTMLInputElement).value).toBe('6')
    wrapper.unmount()
  })
})

describe('主窗歌词字号：数字输入', () => {
  it('清空输入框不落盘（不把空输入夹成下限 70）', async() => {
    const wrapper = mountWith(PlayLyricMain)
    const input = inputOf(wrapper, 'playDetail.style.fontSize')

    await input.setValue('')
    await runDebounce()

    expect(mocks.updateSetting).not.toHaveBeenCalled()
    expect(appSetting['playDetail.style.fontSize']).toBe(100)
    wrapper.unmount()
  })

  it('越界值被夹取后落盘，并把框里的内容回推成生效值', async() => {
    const wrapper = mountWith(PlayLyricMain)
    const input = inputOf(wrapper, 'playDetail.style.fontSize')

    await input.setValue('999')
    await runDebounce()

    expect(mocks.updateSetting).toHaveBeenCalledWith({ 'playDetail.style.fontSize': 200 })
    expect((input.element as HTMLInputElement).value).toBe('200')
    wrapper.unmount()
  })
})
