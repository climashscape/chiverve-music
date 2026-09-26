import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MvPlayerModal from './MvPlayerModal.vue'

/**
 * MV 播放弹窗里**每位歌手后面的关注键**（票 04 的铺开点之一）—— dom project。
 *
 * MV 的 singers[] 自带 mid，所以每位歌手名后面挂共用的两态键（`FollowSingerButton.vue`）；
 * 只有名字串（没有 `singers[]`）的那种数据判不了是哪位歌手，**不挂**。
 * 共用状态机本身由 `FollowSingerButton.test.ts` 钉，这里只钉弹窗把 mid 传对了。
 */

const mocks = vi.hoisted(() => ({
  getFollowState: vi.fn(),
  setFollowSinger: vi.fn(),
  getQQCredential: vi.fn(),
  openLoginModal: vi.fn(),
  jumpToSingerList: vi.fn(),
}))

vi.mock('@renderer/utils/compositions/useMusicJump', () => ({
  default: () => ({ jumpToSingerList: mocks.jumpToSingerList }),
}))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { singer: { getFollowState: mocks.getFollowState, setFollowSinger: mocks.setFollowSinger } } },
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential: mocks.getQQCredential }))
vi.mock('@renderer/store/qqAuth/action', () => ({ openLoginModal: mocks.openLoginModal }))

const mountModal = (props: Record<string, unknown> = {}) => mount(MvPlayerModal, {
  props: { show: true, ...props },
  global: {
    stubs: {
      'material-modal': { template: '<div><slot /></div>' },
      'base-btn': { props: { min: Boolean, disabled: Boolean }, template: '<button type="button" :disabled="disabled"><slot /></button>' },
    },
    mocks: { $t: (key: string) => key },
  },
})

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getQQCredential.mockResolvedValue({ encryptUin: 'uin-1' })
  mocks.setFollowSinger.mockResolvedValue({ ok: true })
})

describe('components/common/MvPlayerModal.vue 的歌手关注键', () => {
  it('每位带 mid 的歌手名后面挂关注键，点它写的是这位歌手的 mid', async() => {
    mocks.getFollowState.mockResolvedValue(false)

    const wrapper = mountModal({ mv: { singers: [{ mid: 'mv-singer-1', name: '歌手甲' }] } })
    await flushPromises()

    expect(mocks.getFollowState).toHaveBeenCalledWith('mv-singer-1')
    const button = wrapper.findAll('button').find(node => node.text() === window.i18n.t('singer__follow' as any))
    expect(button).toBeDefined()

    await button!.trigger('click')
    await flushPromises()

    expect(mocks.setFollowSinger).toHaveBeenCalledWith('mv-singer-1', true)
    // 点关注不触发「点歌手名跳转 + 关弹窗」
    expect(mocks.jumpToSingerList).not.toHaveBeenCalled()
  })

  it('只有名字串（没有 singers[]）时不挂关注键——判不了是哪位歌手', async() => {
    const wrapper = mountModal({ mv: { singer: '只有名字的歌手' } })
    await flushPromises()

    expect(wrapper.text()).toContain('只有名字的歌手')
    expect(wrapper.findAll('button')
      .some(node => node.text() === window.i18n.t('singer__follow' as any))).toBe(false)
    expect(mocks.getFollowState).not.toHaveBeenCalled()
  })
})
