import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { status } from '@renderer/store/qqAuth/state'
import { favAlbums, favLists, favSongs, followSingers, isInited, labels } from '@renderer/store/user/state'
import FavListsPanel from './FavListsPanel.vue'
import FavAlbumsPanel from './FavAlbumsPanel.vue'
import FollowSingersPanel from './FollowSingersPanel.vue'
import SongsPanel from './SongsPanel.vue'

/**
 * 我的收藏页四块面板的**登录后自愈**（2026-09-26 审查）。
 *
 * 真机症状：未登录时进过我的收藏（`initUserCenter` 已经把 `isInited` 置 true，或
 * `loadFavSongs` 写了「请先登录」文案），随后在别处登录 → 回到这一页**仍是空的 / 仍写着
 * 请先登录**，切走再切回来才看到数据（`isInited` 挡着，谁也不重拉）。
 *
 * 契约：登录信号（`status.isLogin` 翻 true）到达时，挂载中的面板要自己重新取这块数据——
 * 与 `views/friends/useUserList.ts` 的 `watch(() => status.isLogin, …)` 同款。
 *
 * 取数链路全真跑（store + action），只桩掉最外层 SDK、播放与路由。
 */

const sdk = vi.hoisted(() => ({
  getHomepage: vi.fn(),
  getMusicGene: vi.fn(),
  getFavSong: vi.fn(),
  getCreatedSonglist: vi.fn(),
  getFavSonglist: vi.fn(),
  getFavAlbum: vi.fn(),
  getFollowSingers: vi.fn(),
  getVipInfo: vi.fn(),
}))

vi.mock('@renderer/utils/musicSdk', () => ({ default: { tx: { user: sdk } } }))
vi.mock('@common/utils/vueRouter', () => ({
  useRoute: () => ({ path: '/favorites', query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@renderer/components/material/OnlineList/usePlay', () => ({
  default: () => ({ handlePlayMusic: vi.fn() }),
}))

const SongCardGridStub = { name: 'SongCardGrid', props: ['listInfo'], template: '<div class="grid" />' }
const OnlineListStub = { name: 'MaterialOnlineList', props: ['list', 'noItem'], template: '<div class="online-list" />' }
const BaseBtnStub = {
  name: 'BaseBtn',
  props: { disabled: Boolean },
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
}

const mountOpts = {
  global: {
    mocks: { $t: (key: string, params?: any) => window.i18n.t(key as any, params) },
    stubs: {
      'base-btn': BaseBtnStub,
      'song-card-grid': SongCardGridStub,
      'material-online-list': OnlineListStub,
    },
  },
}

const card = { id: 'p1', name: '歌单A', img: '', author: '我', desc: null, source: 'tx' } as any
const album = { id: 'a1', name: '专辑A', img: '', author: '歌手' } as any
const singer = { id: 's1', name: '歌手A', img: '', desc: '', fans: 0, source: 'tx' } as any
/** 取数结果里的歌曲是**老式**对象（`tx/user.js` 的形状，进 store 时才转新式） */
const favSong = { songmid: '1', songId: '1', songType: 0, name: '歌1', singer: '歌手', source: 'tx', interval: '03:00', types: {}, _types: {} }

/** 未登录：所有账号接口都抛凭证层那句话（`requireCredential` 的形状） */
const rejectAll = () => {
  for (const fn of Object.values(sdk)) fn.mockRejectedValue(new Error('QQ 音乐未登录'))
}

/** 已登录：接口给一份空数据；要数据的用例在 over 里覆盖 */
const resolveAll = (over: Partial<Record<keyof typeof sdk, any>> = {}) => {
  sdk.getHomepage.mockResolvedValue(over.getHomepage ?? {})
  sdk.getMusicGene.mockResolvedValue(over.getMusicGene ?? {})
  sdk.getFavSong.mockResolvedValue(over.getFavSong ?? { list: [], total: 0 })
  sdk.getCreatedSonglist.mockResolvedValue(over.getCreatedSonglist ?? { list: [] })
  sdk.getFavSonglist.mockResolvedValue(over.getFavSonglist ?? { list: [], hasMore: false })
  sdk.getFavAlbum.mockResolvedValue(over.getFavAlbum ?? { list: [], hasMore: false })
  sdk.getFollowSingers.mockResolvedValue(over.getFollowSingers ?? { list: [], hasMore: false })
  sdk.getVipInfo.mockResolvedValue(over.getVipInfo ?? {})
}

/** 让挂起的 await 链跑完（一轮宏任务足够） */
const flush = async() => new Promise(resolve => setTimeout(resolve, 0))

/** 文案断言取 i18n 的实际值（本文件的 import 图会把真 i18n 装进 window，别写死 key） */
const loadFailedText = () => window.i18n.t('list__load_failed' as any)
const needLoginText = () => window.i18n.t('user_center__need_login' as any)

const resetStore = () => {
  for (const list of [favLists, favAlbums, followSingers]) list.splice(0, list.length)
  favSongs.list.splice(0, favSongs.list.length)
  favSongs.total = 0
  for (const key of Object.keys(labels) as Array<keyof typeof labels>) labels[key] = ''
  isInited.value = false
}

/** 本组用例故意让接口全部失败（未登录那一次），把 store 的失败日志静音，输出留给断言 */
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  resetStore()
  status.isLogin = false
  rejectAll()
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('我的收藏页：登录后自愈（未登录时挂载过，登录信号到达就重拉）', () => {
  it('歌单 tab：isInited 已被置 true 也照样重拉（force 绕开会话守卫）', async() => {
    const wrapper = mount(FavListsPanel, mountOpts)
    await flush()
    // 未登录这一次：列表空、但会话已被标成已初始化（正是登录后不再取数的成因）
    expect(favLists).toHaveLength(0)
    expect(isInited.value).toBe(true)

    resolveAll({ getFavSonglist: { list: [card], hasMore: false } })
    status.isLogin = true
    await flush()

    expect(favLists.map(item => item.id)).toEqual(['p1'])
    wrapper.unmount()
  })

  it('专辑 tab：登录后自动重拉', async() => {
    const wrapper = mount(FavAlbumsPanel, mountOpts)
    await flush()
    expect(favAlbums).toHaveLength(0)

    resolveAll({ getFavAlbum: { list: [album], hasMore: false } })
    status.isLogin = true
    await flush()

    expect(favAlbums.map(item => item.id)).toEqual(['a1'])
    wrapper.unmount()
  })

  it('歌手 tab：登录后自动重拉', async() => {
    const wrapper = mount(FollowSingersPanel, mountOpts)
    await flush()
    expect(followSingers).toHaveLength(0)

    resolveAll({ getFollowSingers: { list: [singer], hasMore: false } })
    status.isLogin = true
    await flush()

    expect(followSingers.map(item => item.id)).toEqual(['s1'])
    wrapper.unmount()
  })

  it('歌曲 tab：未登录落「请先登录」，登录后自动重拉我喜欢', async() => {
    const wrapper = mount(SongsPanel, mountOpts)
    await flush()
    expect(favSongs.list).toHaveLength(0)
    expect(labels.favSongs).toBe(needLoginText())

    resolveAll({ getFavSong: { list: [favSong], total: 1 } })
    status.isLogin = true
    await flush()

    expect(favSongs.list.map(item => item.meta.id)).toEqual(['1'])
    wrapper.unmount()
  })

  it('歌单列表「加载更多」失败：已有卡片不被藏掉（noItemLabel 必须空串），失败另有提示位', async() => {
    resolveAll({ getFavSonglist: { list: [card], hasMore: true } })
    const wrapper = mount(FavListsPanel, mountOpts)
    await flush()

    const grid = wrapper.findComponent(SongCardGridStub)
    expect(grid.props('listInfo').list).toHaveLength(1)
    expect(grid.props('listInfo').noItemLabel).toBe('')

    sdk.getFavSonglist.mockRejectedValueOnce(new Error('boom'))
    await wrapper.find('button').trigger('click')
    await flush()

    // store 落了失败文案，但已有数据必须照常显示，文案走列表下方的独立提示位
    expect(labels.favLists).toBe(loadFailedText())
    const info = wrapper.findComponent(SongCardGridStub).props('listInfo')
    expect(info.noItemLabel).toBe('')
    expect(info.list).toHaveLength(1)
    expect(wrapper.text()).toContain(loadFailedText())
    wrapper.unmount()
  })
})
