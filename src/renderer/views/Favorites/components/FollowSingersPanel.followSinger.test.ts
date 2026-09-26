import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FollowSingersPanel from './FollowSingersPanel.vue'

/**
 * 我的收藏 →「歌手」tab 卡片上的**取关键**（票 04 的铺开点之一）—— dom project。
 *
 * 钉两件事：
 *   1. 卡片挂的是共用的两态键（`FollowSingerButton.vue`），点它写出的是这张卡歌手的 `id`（= mid）；
 *   2. **取关成功后列表要重拉**（`changed` → `initUserCenter(true)`）——这里是「我关注的歌手」，
 *      取消了却还留着那张卡（还显示成「关注」）就是在说谎。
 *
 * store / 取数整个换成桩：共用状态机本身由 `components/common/FollowSingerButton.test.ts` 钉。
 */

const mocks = vi.hoisted(() => ({
  getFollowState: vi.fn(),
  setFollowSinger: vi.fn(),
  getQQCredential: vi.fn(),
  openLoginModal: vi.fn(),
  initUserCenter: vi.fn(),
  loadMoreFollowSingers: vi.fn(),
}))

const store = vi.hoisted(() => ({
  followSingers: [] as any[],
  labels: { followSingers: '' },
  pagers: { followSingers: { page: 1, hasMore: false } },
}))

vi.mock('@renderer/store/user/state', async() => {
  const { shallowReactive } = await import('vue')
  return {
    followSingers: shallowReactive(store.followSingers),
    labels: store.labels,
    pagers: store.pagers,
  }
})
vi.mock('@renderer/store/user/action', () => ({
  initUserCenter: mocks.initUserCenter,
  loadMoreFollowSingers: mocks.loadMoreFollowSingers,
  moreErrorLabelOf: () => '',
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { singer: { getFollowState: mocks.getFollowState, setFollowSinger: mocks.setFollowSinger } } },
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential: mocks.getQQCredential }))
vi.mock('@renderer/store/qqAuth/action', () => ({ openLoginModal: mocks.openLoginModal }))

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getQQCredential.mockResolvedValue({ encryptUin: 'uin-1' })
  mocks.setFollowSinger.mockResolvedValue({ ok: true })
  store.followSingers.splice(0, store.followSingers.length, { id: 'fav-mid-1', name: '歌手甲', img: '', desc: '' })
})

describe('我的收藏 → 歌手 tab', () => {
  it('卡片带「取消关注」键；取关成功后就地重拉列表（这张卡拉走）', async() => {
    mocks.getFollowState.mockResolvedValue(true)

    const wrapper = mount(FollowSingersPanel, {
      global: {
        stubs: { 'base-btn': { props: { min: Boolean, disabled: Boolean }, template: '<button type="button" :disabled="disabled"><slot /></button>' } },
        mocks: { $t: (key: string) => key },
      },
    })
    await flushPromises()

    // 取数链路走的是歌手的 id（数据层里它就是这个歌手的 mid）
    expect(mocks.getFollowState).toHaveBeenCalledWith('fav-mid-1')
    const button = wrapper.findAll('button').find(node => node.text() === window.i18n.t('singer__unfollow' as any))
    expect(button).toBeDefined()

    await button!.trigger('click')
    await flushPromises()

    expect(mocks.setFollowSinger).toHaveBeenCalledWith('fav-mid-1', false)
    // 写成功 → 重拉（不然卡片还在，却显示成「关注」）
    expect(mocks.initUserCenter).toHaveBeenCalledWith(true)
  })
})
