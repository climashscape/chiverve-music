import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { status } from '@renderer/store/qqAuth/state'
import Page from './index.vue'

/**
 * 歌手页页头的**关注 / 取消关注两态键**（票 03）—— dom project。
 *
 * 本用例原来钉的是「只读标记，是 span 不是按钮」（票 02 的读侧那一半）；写侧落地后整组改成
 * 钉**两态键的行为**：判态、写通道、失败分支都在共用件 `components/common/FollowSingerButton.vue`
 * （= `useFollowSinger`）里，这里只验**歌手页把它挂对了**，以及票 03 要求的三组写侧行为：
 *
 *   1. 两态文案（未关注「关注」/ 已关注「取消关注」）+ 服务端确认后才翻转、点击期间 loading；
 *   2. 失败**保持原态** + 可读原因（歌手页开 `show-message`，原因就地常驻可见）；
 *   3. 未登录 → 「先登录 QQ 音乐」引导且**一个写请求都不发**；无网页会话/会话过期 →
 *      「需要重新扫码以启用关注」+ 就地扫码入口；
 *   4. 取不到（`null`）→ 整块不渲染，**不许画成「未关注」**（票 02 的三态契约，最容易回归的一条）。
 *
 * `./useSinger` 整个换成页头数据桩（真实现会打页头接口）；关注态的读写桩掉最外层 SDK，
 * 模板里的 `$t` 是键名直通桩——断言钉的是「用了哪条 key」，措辞由 lang.test.ts 与人对账。
 */

const mocks = vi.hoisted(() => {
  const route: { path: string, query: Record<string, unknown> } = { path: '/singer', query: { mid: 'mid-a', tab: 'songs' } }
  return {
    route,
    getFollowState: vi.fn(),
    setFollowSinger: vi.fn(),
    getQQCredential: vi.fn(),
    openLoginModal: vi.fn(),
  }
})

vi.mock('@common/utils/vueRouter', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { singer: { getFollowState: mocks.getFollowState, setFollowSinger: mocks.setFollowSinger } } },
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential: mocks.getQQCredential }))
vi.mock('@renderer/store/qqAuth/action', () => ({ openLoginModal: mocks.openLoginModal }))

vi.mock('./useSinger', async() => {
  const { reactive, ref } = await import('vue')
  return {
    default: () => ({
      detail: reactive({
        id: 'mid-a',
        mid: 'mid-a',
        name: '测试歌手',
        avatar: '',
        desc: '',
        musicCount: 128,
        albumCount: 9,
      }),
      headerLabel: ref(''),
      isInfoLoading: ref(false),
      mvPlayer: reactive({ show: false }),
      initSingerInfo: vi.fn(),
      closeMv: vi.fn(),
      retryMvUrl: vi.fn(),
    }),
  }
})

// 四个面板与 MV 弹窗各自会取数 / 引重组件，这里只验页头，全部换成文字探针
vi.mock('./components/SongsPanel.vue', () => ({ default: { template: '<div>panel-songs</div>' } }))
vi.mock('./components/AlbumsPanel.vue', () => ({ default: { template: '<div>panel-albums</div>' } }))
vi.mock('./components/MvsPanel.vue', () => ({ default: { template: '<div>panel-mv</div>' } }))
vi.mock('./components/SimilarPanel.vue', () => ({ default: { template: '<div>panel-similar</div>' } }))
vi.mock('@renderer/components/common/MvPlayerModal.vue', () => ({ default: { template: '<div>mv-modal</div>' } }))

const BaseBtnStub = {
  name: 'BaseBtn',
  props: { min: Boolean, disabled: Boolean },
  template: '<button type="button" :disabled="disabled"><slot /></button>',
}

const mountPage = (mid: string) => {
  mocks.route.query.mid = mid
  return mount(Page, {
    global: {
      stubs: {
        'base-btn': BaseBtnStub,
        'base-tab': true,
        'common-toolbar-actions': true,
      },
      mocks: { $t: (key: string) => key },
    },
  })
}

const buttonByText = (wrapper: ReturnType<typeof mountPage>, text: string) =>
  wrapper.findAll('button').find(button => button.text() === text)

// 共享关注态是模块级的：挂着的组件不卸载会跨用例串（同 `FollowSingerButton.test.ts`）
enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.clearAllMocks()
  status.isLogin = false
  mocks.getQQCredential.mockResolvedValue({ encryptUin: 'uin-1' })
  mocks.setFollowSinger.mockResolvedValue({ ok: true })
})

describe('歌手页的关注两态键：两态与写侧确认', () => {
  it('未关注：页头给「关注」键；点一下写 `follow=true`，服务端确认后翻成「取消关注」', async() => {
    mocks.getFollowState.mockResolvedValue(false)
    const wrapper = mountPage('mid-page-add')
    await flushPromises()

    expect(buttonByText(wrapper, 'singer__follow')).toBeDefined()
    expect(wrapper.text()).not.toContain('singer__unfollow')

    await buttonByText(wrapper, 'singer__follow')!.trigger('click')
    await flushPromises()

    expect(mocks.setFollowSinger).toHaveBeenCalledWith('mid-page-add', true)
    expect(buttonByText(wrapper, 'singer__unfollow')).toBeDefined()
  })

  it('已关注：页头给「取消关注」键（不是只读标记），点它写 `follow=false`', async() => {
    mocks.getFollowState.mockResolvedValue(true)
    const wrapper = mountPage('mid-page-del')
    await flushPromises()

    await buttonByText(wrapper, 'singer__unfollow')!.trigger('click')
    await flushPromises()

    expect(mocks.setFollowSinger).toHaveBeenCalledWith('mid-page-del', false)
    expect(buttonByText(wrapper, 'singer__follow')).toBeDefined()
  })

  it('点击期间 loading（禁用 + 「处理中…」），服务端确认前不翻转', async() => {
    mocks.getFollowState.mockResolvedValue(false)
    let confirm!: (value: unknown) => void
    mocks.setFollowSinger.mockReturnValue(new Promise(resolve => { confirm = resolve }))

    const wrapper = mountPage('mid-page-loading')
    await flushPromises()
    await buttonByText(wrapper, 'singer__follow')!.trigger('click')

    const writing = buttonByText(wrapper, 'singer__follow_loading')
    expect(writing).toBeDefined()
    expect(writing!.attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, 'singer__unfollow')).toBeUndefined()

    confirm({ ok: true })
    await flushPromises()
    expect(buttonByText(wrapper, 'singer__unfollow')).toBeDefined()
  })
})

describe('歌手页的关注两态键：失败与引导', () => {
  it('失败保持原态 + 可读原因（歌手页就地常驻显示，不静默）', async() => {
    mocks.getFollowState.mockResolvedValue(true)
    mocks.setFollowSinger.mockResolvedValue({ ok: false, reason: 'rate-limited', message: '操作太频繁，请稍后再试' })

    const wrapper = mountPage('mid-page-fail')
    await flushPromises()
    await buttonByText(wrapper, 'singer__unfollow')!.trigger('click')
    await flushPromises()

    // 原态还在（没有翻成「关注」），原因就在页面上
    expect(buttonByText(wrapper, 'singer__unfollow')).toBeDefined()
    expect(wrapper.text()).toContain('操作太频繁，请稍后再试')
  })

  it('未登录：给「先登录 QQ 音乐」引导，**一个写请求都不发**（连读都不发）', async() => {
    mocks.getQQCredential.mockResolvedValue(null)

    const wrapper = mountPage('mid-page-no-login')
    await flushPromises()

    expect(wrapper.text()).toContain('user_center__need_login')
    expect(mocks.getFollowState).not.toHaveBeenCalled()

    await buttonByText(wrapper, 'qq_auth__login')!.trigger('click')
    await flushPromises()

    expect(mocks.openLoginModal).toHaveBeenCalledTimes(1)
    expect(mocks.setFollowSinger).not.toHaveBeenCalled()
  })

  it('网页会话不可用 / 过期：给「需要重新扫码以启用关注」+ 就地扫码入口', async() => {
    mocks.getFollowState.mockResolvedValue(false)
    mocks.setFollowSinger.mockResolvedValue({ ok: false, reason: 'web-session-expired', message: '需要重新扫码以启用关注' })

    const wrapper = mountPage('mid-page-rescan')
    await flushPromises()
    await buttonByText(wrapper, 'singer__follow')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('singer__follow_need_rescan')

    await buttonByText(wrapper, 'singer__follow_rescan')!.trigger('click')
    expect(mocks.openLoginModal).toHaveBeenCalledTimes(1)
  })

  it('取不到（null）：关注键整块不渲染，**不许画成「未关注」**（页头其它信息照常）', async() => {
    mocks.getFollowState.mockResolvedValue(null)
    const wrapper = mountPage('mid-page-unknown')
    await flushPromises()
    const text = wrapper.text()

    expect(text).not.toContain('singer__follow')
    expect(text).not.toContain('singer__unfollow')
    expect(buttonByText(wrapper, 'singer__follow')).toBeUndefined()
    // 键缺席不等于页头坏了：歌曲数 / 专辑数还在
    expect(text).toContain('singer__songs')
    expect(text).toContain('singer__albums')
  })
})
