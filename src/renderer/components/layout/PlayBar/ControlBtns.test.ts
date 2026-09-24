import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { nextTick, ref } from '@common/utils/vueTools'
import type * as listAction from '@renderer/store/list/action'
import { appSetting } from '@renderer/store/setting'
import { playInfo, playMusicInfo } from '@renderer/store/player/state'
import { favSongIds, favSongIdsLoaded, favSongs } from '@renderer/store/user/state'
import { hasPlayingRowLocator } from '@renderer/utils/playingRowLocate'
import ListMusicTable from '@renderer/components/common/ListMusicTable/index.vue'
import ControlBtns from './ControlBtns.vue'

/**
 * 播放栏的「定位到正在播放」那颗准星（ui-polish-3 工单 08 的功能 + 工单 11 的真机 bug）。
 *
 * 用户报的现象（工单 11 原话）：「定位切换到其他页面再切换回来就无法定位了」。
 * 根因在**求值时机**，不在登记表：准星的可用态读的「这份列表可见吗」是真实 DOM（`offsetParent`，
 * 不在响应式系统里）。播放栏的组件 uid 比路由页小，同一批更新里先渲染 —— 此刻路由页的 DOM 还没
 * 打补丁（列表数据刚到、`v-show="list.length"` 还是 `none`）→ 算出 `false` 并被缓存住，之后没有
 * 任何依赖再变化，键就一直灰着、点了也没反应。
 *
 * 所以这里不测「登记表接没接上」（那在 `utils/playingRowLocate.test.ts` 与
 * `utils/compositions/usePlayingRowLocate.test.ts` 里测），测的是**真机时序**：把真 `ControlBtns`
 * 与真 `ListMusicTable` 按真机的先后挂进同一棵树（播放栏先、路由页后），列表数据**挂载之后才到**
 * （`getListMusics` 由用例控制何时 resolve），再断言键亮不亮、点下去滚不滚。
 *
 * jsdom 没有布局引擎（`offsetParent` 恒 null），所以容器那三个几何量手工补，其中 `offsetParent`
 * 按内联 `display` 反推 —— 与 `v-show` 的实际行为一致（`display: none` 的子树没有盒子）。
 * 另外本用例里 `userLists` 是空的 → 准星只有「原地定位」这条路（没有可跳的列表页），
 * 键的亮灭因此完全由登记表说了算，不会被跳转那条路蒙过去。
 */

const { getListMusics, likeSong, unlikeSong, getFavSongIds } = vi.hoisted(() => ({
  getListMusics: vi.fn(),
  likeSong: vi.fn(),
  unlikeSong: vi.fn(),
  getFavSongIds: vi.fn(),
}))

// `sources` 是「来源显示名」那张表要遍历的（同 ListMusicTable 的用例）
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { sources: [], tx: { songList: { likeSong, unlikeSong }, user: { getFavSongIds } } },
}))

// 本地列表的歌曲走 IPC 从主进程库读（测试环境没人应答）——只换这一个读接口，
// 其余导出保持真的（这条导入链上的模块会静态引用它们，缺导出就是找不到导出）
vi.mock('@renderer/store/list/action', async(importOriginal) => ({
  ...await importOriginal<typeof listAction>(),
  getListMusics,
}))

// 本用例不碰跳转（能跳才会走到 `locatePlaying` 的 router.push，这里本来也没有可跳的列表），
// 桩掉免得每次挂载刷一屏 router 注入告警
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/playlists', query: {}, fullPath: '/playlists' }),
}))

// 文案一律回键名（同 `global.mocks` 的 `$t`）：按 `aria-label` 找键时不受当前语言影响
vi.mock('@renderer/plugins/i18n', async(importOriginal) => ({
  ...await importOriginal<any>(),
  useI18n: () => (key: string) => key,
}))

const scrolled: number[] = []
/** 列表组件实际收到的行高（组件按字号算出来的那个值），断言居中位置时用它算，不写死像素 */
let itemHeightSeen = 0

/** 列表组件桩：照 `base-virtualized-list` 的插槽契约逐行渲染，并给出定位要用的容器接口 */
const VirtualizedListStub = defineComponent({
  name: 'BaseVirtualizedList',
  props: {
    list: { type: Array, default: () => [] },
    itemHeight: { type: Number, default: 40 },
    keyName: { type: String, default: 'id' },
  },
  setup(props, { slots }) {
    itemHeightSeen = props.itemHeight
    return () => h('div', { class: 'v-list' }, (props.list as any[]).map((item: any, index: number) =>
      h('div', { key: item.id }, slots.default?.({ item, index }))))
  },
  methods: {
    scrollTo(top: number) { scrolled.push(top) },
    getScrollTop() { return 0 },
  },
})

const txSong = (id: string) => ({
  id: `tx_${id}`,
  name: `歌${id}`,
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { albumName: '专辑', id, songType: 0 },
}) as any

/** 12 首：正在播放那首放中间偏后（第 9 行），居中算出来是个离 0 与上限都很远的位置，断言才有意义 */
const songs = Array.from({ length: 12 }, (_, i) => txSong(String(i)))
const PLAY_INDEX = 8

/** 让列表数据**由用例决定**什么时候到（真机是几毫秒后的 IPC 回包） */
let deliverList: (rows: any[]) => void = () => {}

/** 页面还挂着没有（模拟「切换到其他页面」：路由页真的卸载，播放栏不动） */
const pageOn = ref(true)

const host = defineComponent({
  setup: () => () => h('div', [
    h(ControlBtns),
    pageOn.value ? h(ListMusicTable, { listId: 'user_1' }) : null,
  ]),
})

const mountApp = () => mount(host, {
  global: {
    mocks: { $t: (key: string) => key },
    stubs: {
      'base-virtualized-list': VirtualizedListStub,
      'common-volume-btn': true,
      'common-toggle-play-mode-btn': true,
      'common-list-add-modal': true,
      'common-list-add-multiple-modal': true,
      'common-download-modal': true,
      'common-download-multiple-modal': true,
      'material-list-buttons': true,
      'base-menu': true,
      'search-list': true,
      'music-sort-modal': true,
    },
  },
})

/** 准星键：按无障碍名找，不猜它在控件簇里的位置 */
const locateBtn = (wrapper: ReturnType<typeof mountApp>) =>
  wrapper.findAll('button').find((btn: any) => btn.attributes('aria-label') === 'player__locate_playing')!

/** 可用 = `disabled` 属性不在（空串也是「在」，所以只能跟 `undefined` 比） */
const isLocateEnabled = (wrapper: ReturnType<typeof mountApp>) =>
  locateBtn(wrapper).attributes('disabled') === undefined

/** 给列表容器补上 jsdom 量不出来的几何：可见性按内联 display 反推（与 `v-show` 的行为一致） */
const fakeContainer = (wrapper: ReturnType<typeof mountApp>) => {
  const el = wrapper.find('.v-list').element as HTMLElement
  Object.defineProperty(el, 'offsetParent', {
    configurable: true,
    get: () => {
      let node: HTMLElement | null = el
      while (node) {
        if (node.style?.display === 'none') return null
        node = node.parentElement
      }
      return document.body
    },
  })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 400 })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 4000 })
}

/** 居中口径（与 `getCenteredScrollTop` 同式）：这一行的中点落在容器中线上 */
const centeredTop = (index: number) => Math.round(index * itemHeightSeen - (400 - itemHeightSeen) / 2)

let mountedWrappers: Array<ReturnType<typeof mountApp>> = []

beforeEach(() => {
  vi.clearAllMocks()
  scrolled.length = 0
  pageOn.value = true
  appSetting['list.actionButtonsVisible'] = true
  // 落盘位置（`useListScroll` 的 `restoreScroll`）也往列表里滚，会污染本用例记录的滚动实参
  appSetting['list.isSaveScrollLocation'] = false
  favSongIds.splice(0, favSongIds.length)
  favSongIdsLoaded.value = false
  favSongs.total = 0
  getFavSongIds.mockResolvedValue([])
  likeSong.mockResolvedValue(true)
  unlikeSong.mockResolvedValue(true)
  // 播放的是**这个本地列表**、第 9 首（播放栏与列表两侧的队列身份都靠它对上）
  playMusicInfo.listId = 'user_1'
  playInfo.playIndex = PLAY_INDEX
  playMusicInfo.musicInfo = songs[PLAY_INDEX]
  getListMusics.mockImplementation(async() => new Promise(resolve => {
    deliverList = resolve
  }))
})

afterEach(() => {
  while (mountedWrappers.length) mountedWrappers.pop()!.unmount()
  mountedWrappers = []
  // 还原成默认值，别把这次改动漏给同文件之后的用例
  appSetting['list.actionButtonsVisible'] = false
  appSetting['list.isSaveScrollLocation'] = true
  playMusicInfo.listId = null
  playInfo.playIndex = -1
  playMusicInfo.musicInfo = null
})

describe('components/layout/PlayBar/ControlBtns 的准星键', () => {
  it('列表数据到达后键要亮：数据到达的那一批里播放栏先渲染，DOM 还没打补丁', async() => {
    const wrapper = mountApp()
    mountedWrappers.push(wrapper)
    fakeContainer(wrapper)
    await nextTick()

    // 还没数据：容器是 display:none（真机就是 `v-show="list.length"`），键该是灰的
    expect(hasPlayingRowLocator()).toBe(false)
    expect(isLocateEnabled(wrapper)).toBe(false)

    deliverList(songs)
    await flushPromises()

    // 登记表这一侧没问题（列表可见、那一行就在里面）
    expect(hasPlayingRowLocator()).toBe(true)
    // 键必须跟着亮 —— 改前这里恒为灰：可见性是在 DOM 打补丁之前读的，算一次就定格
    expect(isLocateEnabled(wrapper)).toBe(true)
  })

  it('点准星会把正在播放那一行滚到列表中间（数据到达之后）', async() => {
    const wrapper = mountApp()
    mountedWrappers.push(wrapper)
    fakeContainer(wrapper)
    await nextTick()
    deliverList(songs)
    await flushPromises()

    await locateBtn(wrapper).trigger('click')

    expect(scrolled).toEqual([centeredTop(PLAY_INDEX)])
    // 行中点落在容器中线上（误差 ≤ 1px：`getCenteredScrollTop` 取整，避免半像素让表格文字发虚）
    const rowTop = PLAY_INDEX * itemHeightSeen - scrolled[0]
    expect(Math.abs(rowTop + itemHeightSeen / 2 - 400 / 2)).toBeLessThanOrEqual(1)
  })

  it('切走页面（列表卸载）后键变灰：页面上已经没有能原地定位的列表了', async() => {
    const wrapper = mountApp()
    mountedWrappers.push(wrapper)
    fakeContainer(wrapper)
    await nextTick()
    deliverList(songs)
    await flushPromises()
    expect(isLocateEnabled(wrapper)).toBe(true)

    pageOn.value = false
    await flushPromises()

    expect(isLocateEnabled(wrapper)).toBe(false)
  })

  it('切走再切回来（用户报的那条）：数据再次到齐后仍然点得动', async() => {
    const wrapper = mountApp()
    mountedWrappers.push(wrapper)
    fakeContainer(wrapper)
    await nextTick()
    deliverList(songs)
    await flushPromises()
    expect(isLocateEnabled(wrapper)).toBe(true)

    // 切到别的页面：路由页卸载（播放栏不动）
    pageOn.value = false
    await flushPromises()
    expect(isLocateEnabled(wrapper)).toBe(false)

    // 切回来：页面重建 → 列表重新取数 → 数据到齐
    pageOn.value = true
    await nextTick()
    fakeContainer(wrapper)
    deliverList(songs)
    await flushPromises()

    expect(isLocateEnabled(wrapper)).toBe(true)
    scrolled.length = 0
    await locateBtn(wrapper).trigger('click')
    expect(scrolled).toEqual([centeredTop(PLAY_INDEX)])
  })
})
