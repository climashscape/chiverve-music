import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { appSetting } from '@renderer/store/setting'
import PlayAudioDevice from './PlayAudioDevice.vue'

/**
 * 换音频输出设备要**落盘**（2026-09-26 复核的缺陷 9）。
 *
 * 真机症状：设置 → 播放 → 音频输出里换了设备，当次播放生效，**重启又回到旧设备**。
 * 根因：那个分支直改 `appSetting['player.mediaDeviceId']`（渲染侧的响应式副本），绕过了
 * `updateSetting` 这条唯一会把值写进主进程配置的通道——同目录其它设置项都走它。
 *
 * 钉住的是「调用哪个通道」，不是「值有没有变」：这里把 `updateSetting` 换成探针（不落盘），
 * 断言 handler 一定经它提交，且不再依赖直改本地副本。
 */
const mocks = vi.hoisted(() => ({
  updateSetting: vi.fn(),
  saveMediaDeviceId: vi.fn(),
  hasInitedAdvancedAudioFeatures: vi.fn(() => false),
}))

// 真 `appSetting` 留着（组件读它），只把两个写入通道换成探针
vi.mock('@renderer/store/setting', async(importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  updateSetting: mocks.updateSetting,
  saveMediaDeviceId: mocks.saveMediaDeviceId,
}))
vi.mock('@renderer/plugins/player', () => ({
  hasInitedAdvancedAudioFeatures: mocks.hasInitedAdvancedAudioFeatures,
  setMediaDeviceId: vi.fn(),
}))
vi.mock('@renderer/plugins/Dialog', () => ({
  dialog: Object.assign(vi.fn(), { confirm: vi.fn().mockResolvedValue(true) }),
}))

/** jsdom 没有 `navigator.mediaDevices`（组件在 setup 里就 enumerate），照最小可用形状补一个 */
const stubMediaDevices = () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'audiooutput', deviceId: 'default', label: '默认' },
        { kind: 'audiooutput', deviceId: 'device-2', label: '第二个设备' },
      ]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
}

const mountDevice = () => mount(PlayAudioDevice, {
  global: {
    plugins: [i18nPlugin],
    stubs: {
      'base-selection': true,
      'base-checkbox': true,
      'common-setting-help-icon': true,
    },
  },
})

beforeEach(() => {
  stubMediaDevices()
  mocks.updateSetting.mockReset()
  mocks.saveMediaDeviceId.mockReset()
  mocks.hasInitedAdvancedAudioFeatures.mockReturnValue(false)
  appSetting['player.mediaDeviceId'] = 'default'
  appSetting['player.audioVisualization'] = false
})

afterEach(() => {
  appSetting['player.mediaDeviceId'] = 'default'
})

describe('PlayAudioDevice：换输出设备走落盘通道', () => {
  it('选了新设备 → updateSetting 提交 player.mediaDeviceId（不再直改 appSetting）', async() => {
    const wrapper = mountDevice()
    await flushPromises()

    const vm = wrapper.vm as unknown as { mediaDeviceId: string, handleMediaDeviceIdChnage: () => Promise<void> }
    vm.mediaDeviceId = 'device-2'
    await vm.handleMediaDeviceIdChnage()

    expect(mocks.updateSetting).toHaveBeenCalledWith({ 'player.mediaDeviceId': 'device-2' })
    // 本地副本不再被直改：值回到渲染侧只通过主进程的 config 回推（测试里没回推，所以还是旧值）
    expect(appSetting['player.mediaDeviceId']).toBe('default')
    wrapper.unmount()
  })

  it('设备列表来自 enumerateDevices（顺带钉住 setup 里那次取数没被绊住）', async() => {
    const wrapper = mountDevice()
    await flushPromises()

    const vm = wrapper.vm as unknown as { mediaDevices: Array<{ deviceId: string }> }
    expect(vm.mediaDevices.map(device => device.deviceId)).toEqual(['default', 'device-2'])
    wrapper.unmount()
  })
})
