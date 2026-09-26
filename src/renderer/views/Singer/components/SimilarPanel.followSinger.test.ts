import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SimilarPanel from './SimilarPanel.vue'

/**
 * 相似歌手卡片上的关注键（票 04 的铺开点之一）—— dom project。
 *
 * 相似歌手也是「一位歌手」，所以和其它出现处一样挂共用的两态键（`FollowSingerButton.vue`）：
 * 判态与写通道不在这里，本用例只钉**这张卡把 mid 传对了、真的能写出这位歌手的关注**——
 * 铺开的每一处至少一条这样的断言，共用状态机本身由 `components/common/FollowSingerButton.test.ts` 钉。
 */

const mocks = vi.hoisted(() => ({
  getFollowState: vi.fn(),
  setFollowSinger: vi.fn(),
  getQQCredential: vi.fn(),
  openLoginModal: vi.fn(),
}))

vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { singer: { getFollowState: mocks.getFollowState, setFollowSinger: mocks.setFollowSinger } } },
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential: mocks.getQQCredential }))
vi.mock('@renderer/store/qqAuth/action', () => ({ openLoginModal: mocks.openLoginModal }))

vi.mock('../useSinger', async() => {
  const { reactive } = await import('vue')
  return {
    default: () => ({
      similar: reactive({
        list: [{ id: 'sim-mid-1', name: '相似歌手甲', img: '' }],
        noItemLabel: '',
        loadedMid: 'mid-a',
        loadingMid: '',
      }),
      ensureSimilarTab: vi.fn(),
    }),
  }
})

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getQQCredential.mockResolvedValue({ encryptUin: 'uin-1' })
  mocks.setFollowSinger.mockResolvedValue({ ok: true })
})

describe('歌手页 → 相似歌手卡片', () => {
  it('每张卡带关注键，且写的就是这位相似歌手的 mid', async() => {
    mocks.getFollowState.mockResolvedValue(false)

    const wrapper = mount(SimilarPanel, {
      props: { mid: 'mid-a' },
      global: { stubs: { 'base-btn': { props: { min: Boolean, disabled: Boolean }, template: '<button type="button" :disabled="disabled"><slot /></button>' } }, mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    expect(mocks.getFollowState).toHaveBeenCalledWith('sim-mid-1')
    const button = wrapper.findAll('button').find(node => node.text() === 'singer__follow')
    expect(button).toBeDefined()

    await button!.trigger('click')
    await flushPromises()

    expect(mocks.setFollowSinger).toHaveBeenCalledWith('sim-mid-1', true)
  })
})
