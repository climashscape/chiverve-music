import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from '@common/utils/vueTools'
import Component from './TypedResultList.vue'

/**
 * 搜索页「歌手」tab 卡片上的关注键（票 04 的铺开点之一）—— dom project。
 *
 * 只钉两件事：歌手卡把 mid 传给了共用的两态键、点它能写出这位歌手；
 * **专辑 / MV 卡不挂**（数据层 `searchAlbum/searchMv` 把歌手 mids 丢了，只留名字串——
 * 没有 mid 就判不了是哪位歌手，见票 04 的覆盖面清单）。
 *
 * 取数那半（`store/search/typed`）整个换成状态桩：本用例只关心渲染与交互，
 * 共用状态机本身由 `components/common/FollowSingerButton.test.ts` 钉。
 */

const mocks = vi.hoisted(() => ({
  getFollowState: vi.fn(),
  setFollowSinger: vi.fn(),
  getQQCredential: vi.fn(),
  openLoginModal: vi.fn(),
}))

const store = vi.hoisted(() => {
  const state = {
    singer: { list: [] as any[], noItemLabel: '', maxPage: 1, page: 1, total: 0, limit: 30 },
    album: { list: [] as any[], noItemLabel: '', maxPage: 1, page: 1, total: 0, limit: 30 },
    mv: { list: [] as any[], noItemLabel: '', maxPage: 1, page: 1, total: 0, limit: 30 },
  }
  return { state }
})

vi.mock('@renderer/store/search/typed', () => ({
  listInfos: store.state,
  search: vi.fn(async() => {}),
}))
vi.mock('@renderer/store/search/state', () => ({ searchText: ref('周杰伦') }))
vi.mock('@renderer/store/mv', () => ({
  player: { show: false },
  openMv: vi.fn(),
  closePlayer: vi.fn(),
  retryUrl: vi.fn(),
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRoute: () => ({ path: '/search', query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { singer: { getFollowState: mocks.getFollowState, setFollowSinger: mocks.setFollowSinger } } },
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential: mocks.getQQCredential }))
vi.mock('@renderer/store/qqAuth/action', () => ({ openLoginModal: mocks.openLoginModal }))

const mountList = (type: 'singer' | 'album' | 'mv') => mount(Component, {
  props: { type, page: 1, sourceId: 'tx' },
  global: {
    stubs: {
      MvPlayerModal: true,
      'material-pagination': true,
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
  store.state.singer.list = [{ id: 'search-mid-1', mid: 'search-mid-1', name: '搜索结果歌手', img: '', songNum: 12, albumNum: 3 }]
  store.state.album.list = [{ id: 'album-mid-1', mid: 'album-mid-1', name: '专辑', img: '', singer: '某歌手', publishDate: '' }]
  store.state.mv.list = [{ id: 'vid-1', vid: 'vid-1', name: 'MV', img: '', singer: '某歌手', duration: 200, playCount: 1 }]
})

describe('搜索页的歌手卡片', () => {
  // ⚠️ 本文件的 import 图会把真 i18n 装进 `window.i18n`（`store/mv` 那条链上的
  // `plugins/i18n`），而共用件内部用的是 `window.i18n.t`（模板用 `$t`）——所以按钮文案断言
  // 取 i18n 的实际值，不用 `$t` 桩的键名（同 `Favorites/components/loginRefresh.test.ts`）
  const followText = () => window.i18n.t('singer__follow' as any)

  it('带关注键，点它写的是这张卡的歌手 mid（不触发卡片的跳转）', async() => {
    mocks.getFollowState.mockResolvedValue(false)

    const wrapper = mountList('singer')
    await flushPromises()

    expect(mocks.getFollowState).toHaveBeenCalledWith('search-mid-1')
    const button = wrapper.findAll('button').find(node => node.text() === followText())
    expect(button).toBeDefined()

    await button!.trigger('click')
    await flushPromises()

    expect(mocks.setFollowSinger).toHaveBeenCalledWith('search-mid-1', true)
  })

  it('专辑 / MV 卡片不带关注键（数据层没留歌手 mid，判不了是哪位歌手）', async() => {
    const album = mountList('album')
    await flushPromises()
    expect(album.findAll('button').some(node => node.text() === followText())).toBe(false)

    const mv = mountList('mv')
    await flushPromises()
    expect(mv.findAll('button').some(node => node.text() === followText())).toBe(false)

    expect(mocks.getFollowState).not.toHaveBeenCalled()
  })
})
