import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import SoundEffectBlock from './SoundEffectBlock.vue'

/**
 * 音效面板弹窗的 teleport 落点（2026-09-26 复核的缺陷 11）。
 *
 * `material-modal` 默认 `teleport="#root"`，而**视图内**弹窗必须显式 `teleport="#view"`（§2.5.1 第 2 条）：
 * `#root` 是应用根，`#view` 才是路由内容区——落到 `#root` 会让整窗压暗（`#root.show-modal > .view-container`），
 * 视觉上像换了一页，而不是在设置页里开了一个面板。
 *
 * 断的是**传给 `material-modal` 的 teleport 值**（不是渲染后的 DOM 落点）：这条链的契约就是这个属性，
 * 「弹窗最后挂在哪个节点」由 `material-modal` 决定（它自己有单测/真机验收）。
 */
vi.mock('@renderer/plugins/player', () => ({
  convolutions: [],
  setMediaDeviceId: vi.fn(),
}))

/** `material-modal` 替身：把收到的 `teleport` 原样标在 DOM 上（真件会 teleport 到 `#root`，jsdom 里没有锚点） */
const MaterialModalStub = defineComponent({
  name: 'material-modal',
  props: {
    show: { type: Boolean, default: false },
    teleport: { type: String, default: '#root' },
  },
  template: '<div v-if="show" class="modal-stub" :data-teleport="teleport"><slot /></div>',
})

const stubs = {
  'material-modal': MaterialModalStub,
  // 四个面板组件各有一整套取数/交互，与本用例无关
  AudioConvolution: true,
  PitchShifter: true,
  AudioPanner: true,
  BiquadFilter: true,
  'base-btn': { template: '<button><slot /></button>' },
  'base-selection': true,
  'base-checkbox': true,
  'base-slider-bar': true,
  'common-setting-help-icon': true,
}

let wrapper: ReturnType<typeof mount> | null = null

beforeEach(() => {
  wrapper = mount(SoundEffectBlock, {
    global: { plugins: [i18nPlugin], stubs },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('SettingAdvancedSoundEffect：音效面板弹窗', () => {
  it('打开时 teleport 到 #view（不是 #root，后者会把整窗压暗）', async() => {
    // 「打开音效面板」按钮把 isShowPanel 置真（按钮本身在 base-btn 桩里，这里直接改状态）
    ;(wrapper!.vm as unknown as { isShowPanel: boolean }).isShowPanel = true
    await nextTick()

    expect(wrapper!.get('.modal-stub').attributes('data-teleport')).toBe('#view')
  })
})
