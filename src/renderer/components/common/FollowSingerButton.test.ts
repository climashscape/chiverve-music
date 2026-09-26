import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { status } from '@renderer/store/qqAuth/state'
import FollowSingerButton from './FollowSingerButton.vue'

/**
 * 关注 / 取消关注两态键（`components/common/FollowSingerButton.vue` + `useFollowSinger.ts`）——
 * dom project。票 03/04 的共用件：歌手页、搜索歌手卡、我的收藏歌手卡、相似歌手卡、MV 播放弹窗
 * 引用的都是它，所以状态机只在这里钉一遍（各处只钉「挂上了没」，见各自目录的用例）。
 *
 * 钉住的行为（都是外部行为，不测内部调用顺序）：
 *
 *   1. **两态**：`true` → 「取消关注」；`false` → 「关注」；`null`（取不到）→ **整块不渲染**
 *      （把「不知道」画成「未关注」是在撒谎——票 02 的三态契约）；
 *   2. **点击期间 loading**，且**服务端确认后才翻转**（不许乐观更新、不许闪一下变回去）；
 *   3. **失败保持原态 + 可读原因**：频控/网络/未知 → 显示 `message`（窄位只挂 `title`，不静默）；
 *      没有网页会话 / 会话过期 → 「需要重新扫码以启用关注」+ 就地扫码入口；
 *   4. **未登录** → 「先登录 QQ 音乐」引导，**一个写请求都不发**（连读都不发：必然取不到）；
 *   5. **跨处同步**：同一歌手两处共用一份关注态，一处写成功另一处立刻跟着变、且不重复读；
 *   6. 登录成功（`status.isLogin` 翻 true）后引导撤掉并重读，但**不自动重放**写请求。
 *
 * `$t` 是键名直通桩（文案措辞是 lang.test.ts 与人的事），断言因此钉的是「用了哪条 key」。
 */

const mocks = vi.hoisted(() => ({
  getFollowState: vi.fn(),
  setFollowSinger: vi.fn(),
  getQQCredential: vi.fn(),
  openLoginModal: vi.fn(),
}))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { singer: { getFollowState: mocks.getFollowState, setFollowSinger: mocks.setFollowSinger } } },
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential: mocks.getQQCredential }))
vi.mock('@renderer/store/qqAuth/action', () => ({ openLoginModal: mocks.openLoginModal }))

/**
 * `base-btn` 的替身：**故意不声明 emits**，让父组件的 `@click.stop` 以原生监听器落到根 button 上
 * （真实 Btn.vue 也是这样）——否则 `.stop` 拿不到事件对象会炸。
 */
const BaseBtnStub = {
  name: 'BaseBtn',
  props: { min: Boolean, disabled: Boolean },
  template: '<button type="button" :disabled="disabled"><slot /></button>',
}

const mountKey = (props: { mid: string, showMessage?: boolean }) => mount(FollowSingerButton, {
  props,
  global: {
    stubs: { 'base-btn': BaseBtnStub },
    mocks: { $t: (key: string) => key },
  },
})

const buttonByText = (wrapper: ReturnType<typeof mountKey>, text: string) =>
  wrapper.findAll('button').find(button => button.text() === text)

// 共享关注态是模块级的：挂着的组件不卸载，下一个用例的 `status.isLogin` 变化会连带它们重读
enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.clearAllMocks()
  status.isLogin = false
  mocks.getQQCredential.mockResolvedValue({ encryptUin: 'uin-1' })
  mocks.setFollowSinger.mockResolvedValue({ ok: true })
})

describe('关注两态键：两态、loading、确认后才翻转', () => {
  it('已关注：按钮写「取消关注」；点一下写 `follow=false`，服务端确认后翻成「关注」', async() => {
    mocks.getFollowState.mockResolvedValue(true)
    const wrapper = mountKey({ mid: 'mid-toggle' })
    await flushPromises()

    expect(wrapper.get('button').text()).toBe('singer__unfollow')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(mocks.setFollowSinger).toHaveBeenCalledWith('mid-toggle', false)
    expect(wrapper.get('button').text()).toBe('singer__follow')
  })

  it('点击期间是 loading（禁用 + 「处理中…」），**服务端确认前不翻转**', async() => {
    mocks.getFollowState.mockResolvedValue(false)
    let confirm!: (value: unknown) => void
    mocks.setFollowSinger.mockReturnValue(new Promise(resolve => { confirm = resolve }))

    const wrapper = mountKey({ mid: 'mid-loading' })
    await flushPromises()
    await wrapper.get('button').trigger('click')

    const writing = wrapper.get('button')
    expect(writing.text()).toBe('singer__follow_loading')
    expect(writing.attributes('disabled')).toBeDefined()
    // 还没回来：文案仍是原态（不许乐观翻转）
    expect(mocks.setFollowSinger).toHaveBeenCalledWith('mid-loading', true)

    confirm({ ok: true })
    await flushPromises()

    expect(wrapper.get('button').text()).toBe('singer__unfollow')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('取不到（null）：整块不渲染，**不许画成「未关注」**', async() => {
    mocks.getFollowState.mockResolvedValue(null)
    const wrapper = mountKey({ mid: 'mid-unknown' })
    await flushPromises()

    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('singer__follow')
    expect(wrapper.text()).not.toContain('singer__unfollow')
  })
})

describe('关注两态键：失败面（保持原态 + 可读原因）', () => {
  it('频控/网络/未知：文案不变，服务端原文落在按钮 title 上（窄位也不静默）', async() => {
    mocks.getFollowState.mockResolvedValue(true)
    mocks.setFollowSinger.mockResolvedValue({ ok: false, reason: 'rate-limited', message: '操作太频繁，请稍后再试' })

    const wrapper = mountKey({ mid: 'mid-rate-limited' })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('button').text()).toBe('singer__unfollow')
    expect(wrapper.get('button').attributes('title')).toBe('操作太频繁，请稍后再试')
  })

  it('`show-message` 时原因另有常驻文案行（歌手页那种有余量的位置）', async() => {
    mocks.getFollowState.mockResolvedValue(false)
    mocks.setFollowSinger.mockResolvedValue({ ok: false, reason: 'network', message: '网络请求失败' })

    const wrapper = mountKey({ mid: 'mid-network', showMessage: true })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('button').text()).toBe('singer__follow')
    expect(wrapper.text()).toContain('网络请求失败')
  })

  it('没有网页会话 / 会话过期：文案说清「需要重新扫码以启用关注」+ 就地扫码入口，原态不变', async() => {
    for (const reason of ['no-web-session', 'web-session-expired'] as const) {
      // 两种原因在同一个用例里跑：逐轮清一次，调用次数断言才只算本轮
      mocks.openLoginModal.mockClear()
      mocks.setFollowSinger.mockClear()
      mocks.getFollowState.mockResolvedValue(false)
      mocks.setFollowSinger.mockResolvedValue({ ok: false, reason, message: '需要重新扫码以启用关注' })

      const wrapper = mountKey({ mid: `mid-${reason}`, showMessage: true })
      await flushPromises()
      await wrapper.get('button').trigger('click')
      await flushPromises()

      // 关注键换成「重新扫码」引导（不是一颗点了还会失败的关注键），且**没有翻成已关注**
      expect(wrapper.text()).toContain('singer__follow_need_rescan')
      expect(wrapper.text()).not.toContain('singer__unfollow')
      expect(buttonByText(wrapper, 'singer__follow_rescan')).toBeDefined()

      // 就地发起既有扫码流程（`views/Follow/index.vue` 同一个 openLoginModal）
      await buttonByText(wrapper, 'singer__follow_rescan')!.trigger('click')
      expect(mocks.openLoginModal).toHaveBeenCalledTimes(1)
      // 引导期间点过「重新扫码」也不算写过：只发了那一次写请求
      expect(mocks.setFollowSinger).toHaveBeenCalledTimes(1)
    }
  })
})

describe('关注两态键：登录引导与跨处同步', () => {
  it('未登录：给「先登录 QQ 音乐」引导，**读与写一个请求都不发**', async() => {
    mocks.getQQCredential.mockResolvedValue(null)

    const wrapper = mountKey({ mid: 'mid-no-login', showMessage: true })
    await flushPromises()

    expect(wrapper.text()).toContain('user_center__need_login')
    expect(buttonByText(wrapper, 'qq_auth__login')).toBeDefined()
    expect(mocks.getFollowState).not.toHaveBeenCalled()

    await buttonByText(wrapper, 'qq_auth__login')!.trigger('click')
    await flushPromises()

    expect(mocks.openLoginModal).toHaveBeenCalledTimes(1)
    expect(mocks.setFollowSinger).not.toHaveBeenCalled()
  })

  it('同一歌手两处共用一份关注态：一处写成功，另一处立刻跟着变且不重复读', async() => {
    mocks.getFollowState.mockResolvedValue(true)
    const first = mountKey({ mid: 'mid-shared' })
    const second = mountKey({ mid: 'mid-shared' })
    await flushPromises()

    // 同一个 mid 只读一次（会话内的关注态是全应用一份）
    expect(mocks.getFollowState).toHaveBeenCalledTimes(1)
    expect(first.get('button').text()).toBe('singer__unfollow')
    expect(second.get('button').text()).toBe('singer__unfollow')

    await first.get('button').trigger('click')
    await flushPromises()

    // 没点过的那一处也变了——「一处改完切到另一处也是新状态」
    expect(second.get('button').text()).toBe('singer__follow')
  })

  it('写成功 emit `changed(新状态)`；失败与只读都不 emit（列表面板据此刷新）', async() => {
    mocks.getFollowState.mockResolvedValue(true)
    const wrapper = mountKey({ mid: 'mid-changed' })
    await flushPromises()
    expect(wrapper.emitted('changed')).toBeUndefined()

    mocks.setFollowSinger.mockResolvedValueOnce({ ok: false, reason: 'network', message: '网络请求失败' })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('changed')).toBeUndefined()

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('changed')).toEqual([[false]])
  })

  it('扫码登录成功后：引导撤掉并重读关注态，但**不自动重放**写请求', async() => {
    mocks.getQQCredential.mockResolvedValue(null)
    const wrapper = mountKey({ mid: 'mid-relogin', showMessage: true })
    await flushPromises()
    expect(wrapper.text()).toContain('user_center__need_login')

    // 登录完成：凭证到位 + 全局登录态翻 true（登录轮询在 DONE 时置它）
    mocks.getQQCredential.mockResolvedValue({ encryptUin: 'uin-2' })
    mocks.getFollowState.mockResolvedValue(false)
    status.isLogin = true
    await flushPromises()

    expect(wrapper.text()).not.toContain('user_center__need_login')
    expect(wrapper.get('button').text()).toBe('singer__follow')
    expect(mocks.setFollowSinger).not.toHaveBeenCalled()
  })
})
