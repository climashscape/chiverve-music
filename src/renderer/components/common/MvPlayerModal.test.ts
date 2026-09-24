import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MvPlayerModal from './MvPlayerModal.vue'

/**
 * MV 播放弹窗（ui-polish-3 工单 01）：
 *   1. **直链要真的落到 `<video>` 上**——「MV 无法播放」的一半怀疑面是播放器自己没接上 src。
 *      这里钉住 url → src 的绑定、以及 `controls`/`autoplay` 两个属性（autoplay 是「点开就播」）。
 *   2. **播放失败要分型**：`<video>` 的解码/格式错误（`MEDIA_ERR_DECODE(3)` /
 *      `MEDIA_ERR_SRC_NOT_SUPPORTED(4)`）与「直链过期/网络错误」不是一回事——H.265 档在
 *      本机就是前者，而旧实现一律提示「播放地址已失效，可重新获取」，把人往错方向带。
 *
 * 只测本组件的模板与逻辑：`material-modal` / `base-btn` 是全局注册的（`components/index.ts`），
 * 这里用桩替掉，`useMusicJump` 也只用到跳歌手（本用例不测跳转，桩掉以免引入 router）。
 */
// import 写在前面、vi.mock 在后面：vitest 会把 vi.mock 提到顶部（hoist），顺序不影响生效，
// 但这样过得了 lint 的 import/first
vi.mock('@renderer/utils/compositions/useMusicJump', () => ({
  default: () => ({ jumpToSingerList: vi.fn() }),
}))

const URL = 'http://aqqmusic.tc.qq.com/amobile.music.tc.qq.com/M500.f40.264.mp4?vkey=v'

const stubs = {
  'material-modal': { template: '<div><slot /></div>' },
  'base-btn': { template: '<button><slot /></button>' },
}
// 文案断言用 i18n 的 key（`window.i18n` 桩在 test/setup/dom.ts 里也是 key 直通）：
// 钉的是「哪一条文案」，措辞改了不会误伤
const mocks = { $t: (key: string) => key }

const mountModal = (props: Record<string, unknown> = {}) => mount(MvPlayerModal, {
  props: { show: true, ...props },
  global: { stubs, mocks },
})

/** 造一个带 `error.code` 的媒体错误事件（jsdom 不会真的去解码，只能自己挂）。 */
const failWith = async(wrapper: ReturnType<typeof mountModal>, code: number) => {
  const video = wrapper.get('video')
  Object.defineProperty(video.element, 'error', { value: { code }, configurable: true })
  await video.trigger('error')
}

describe('components/common/MvPlayerModal.vue', () => {
  it('有直链时把 url 绑到 <video src> 上，并带 controls/autoplay', () => {
    const wrapper = mountModal({ url: URL })
    const video = wrapper.get('video')

    expect(video.attributes('src')).toBe(URL)
    expect(video.attributes('controls')).toBeDefined()
    expect(video.attributes('autoplay')).toBeDefined()
  })

  it('没有直链时只出占位文本，不渲染空的 <video>', () => {
    const loading = mountModal({ url: '', isLoading: true })
    expect(loading.find('video').exists()).toBe(false)
    expect(loading.text()).toContain('list__loading')

    const failed = mountModal({ url: '', urlError: 'mv__url_unavailable' })
    expect(failed.text()).toContain('mv__url_unavailable')

    const empty = mountModal({ url: '' })
    expect(empty.text()).toContain('no_item')
  })

  it('解码/格式不支持（error.code 3/4）提示「编码解不开」，别误导成直链过期', async() => {
    const unsupported = mountModal({ url: URL })
    await failWith(unsupported, 4)
    expect(unsupported.text()).toContain('mv__codec_unsupported')
    expect(unsupported.text()).not.toContain('mv__url_expired')

    const decodeError = mountModal({ url: URL })
    await failWith(decodeError, 3)
    expect(decodeError.text()).toContain('mv__codec_unsupported')
  })

  it('网络/直链过期（error.code 2）仍旧提示可重新获取', async() => {
    const wrapper = mountModal({ url: URL })
    await failWith(wrapper, 2)
    expect(wrapper.text()).toContain('mv__url_expired')
    expect(wrapper.text()).not.toContain('mv__codec_unsupported')
  })

  it('重新获取到新地址后清掉上一次的失败提示', async() => {
    const wrapper = mountModal({ url: URL })
    await failWith(wrapper, 4)
    expect(wrapper.text()).toContain('mv__codec_unsupported')

    await wrapper.setProps({ url: `${URL}&retry=1` })
    expect(wrapper.text()).not.toContain('mv__codec_unsupported')
    expect(wrapper.get('video').attributes('src')).toBe(`${URL}&retry=1`)
  })

  it('重新获取按钮在加载中禁用、无直链时「用系统播放器打开」禁用', async() => {
    const wrapper = mountModal({ url: '', isLoading: true })
    const [retry, openExternal] = wrapper.findAll('button')
    expect(retry.attributes('disabled')).toBeDefined()
    expect(openExternal.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ url: URL, isLoading: false })
    const buttons = wrapper.findAll('button')
    expect(buttons[0].attributes('disabled')).toBeUndefined()
    expect(buttons[1].attributes('disabled')).toBeUndefined()
  })
})
