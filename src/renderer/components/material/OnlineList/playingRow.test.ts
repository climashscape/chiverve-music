import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { nextTick } from '@common/utils/vueTools'
import { LIST_IDS } from '@common/constants'
import { playMusicInfo, playInfo } from '@renderer/store/player/state'
import { tempListMeta } from '@renderer/store/list/state'
import { hasPlayingRowLocator, locatePlayingRow } from '@renderer/utils/playingRowLocate'
import OnlineList from './index.vue'

// 这份用例不碰路由（跳转类动作在 `useMusicJump` 里，与「正在播放那一行」无关），
// 桩掉免得每个用例刷一屏 `injection "Symbol(router)" not found`
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/album', query: {} }),
}))

/**
 * 在线歌曲表的「正在播放那一行」（ui-polish-3 工单 08）。
 *
 * 这里钉住的是**接线**，不是算法（算法在 `utils/playingRowLocate.test.ts`）：
 * 队列身份认的是 `tempListMeta.id`（不是 `playMusicInfo.listId`——在线队列一律灌进临时列表播，
 * 那个字段恒为 `temp`），身份+歌 id 都对上时那一行要出播放图标，且播放栏的「定位到正在播放」
 * 能通过登记表把这份列表滚到它居中。
 *
 * ⚠️ jsdom 没有布局引擎：`offsetParent` 恒为 null、`clientHeight/scrollHeight` 恒为 0，
 * 所以容器几何要手工补（真机上是列表自己的滚动容器给的），否则登记表的「可见」判据永远为假。
 * 行高同理——它是组件按字号算出来的（`listItemHeight`），用例从桩拿真实值来验「居中」，
 * 不写死像素（写死就成了测那个数字本身）。
 */
const scrolled: number[] = []
/** 列表组件实际收到的行高（组件按字号算出来的那个值） */
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

/** 只要 id 对上就能表达「同一首歌」；其余字段是模板要读的（name / singer / source / meta） */
const song = (id: string) => ({
  id,
  name: `歌${id}`,
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { albumName: '专辑', _qualitys: {} },
})

const mountList = (list: Array<ReturnType<typeof song>>, listId: string) => mount(OnlineList, {
  props: { list, page: 1, limit: 20, total: list.length, listId },
  global: {
    mocks: { $t: (key: string) => key },
    stubs: {
      'base-virtualized-list': VirtualizedListStub,
      'material-list-buttons': true,
      'material-pagination': true,
      'base-menu': true,
      'common-list-add-modal': true,
      'common-list-add-multiple-modal': true,
      'common-download-modal': true,
      'common-download-multiple-modal': true,
    },
  },
})

/** 给列表容器补上 jsdom 量不出来的几何（可见 + 高 400、内容高 4000） */
const fakeContainer = (wrapper: ReturnType<typeof mountList>) => {
  const el = wrapper.find('.v-list').element as HTMLElement
  Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: 4000, configurable: true })
}

let mountedWrappers: Array<ReturnType<typeof mountList>> = []

afterEach(() => {
  while (mountedWrappers.length) mountedWrappers.pop()!.unmount()
  mountedWrappers = []
})

beforeEach(() => {
  scrolled.length = 0
  playInfo.playIndex = -1
  playInfo.playerListId = null
  playMusicInfo.listId = null
  playMusicInfo.musicInfo = null
  tempListMeta.id = ''
})

describe('OnlineList：正在播放那一行', () => {
  it('队列身份（tempListMeta.id）与歌都对上 → 那一行出播放图标，别的行出序号', async() => {
    const list = [song('a'), song('b'), song('c')]
    tempListMeta.id = 'album__m1'
    playInfo.playerListId = LIST_IDS.TEMP
    playInfo.playIndex = 1
    playMusicInfo.listId = LIST_IDS.TEMP
    playMusicInfo.musicInfo = list[1] as LX.Music.MusicInfoOnline

    const wrapper = mountList(list, 'album__m1')
    mountedWrappers.push(wrapper)
    await nextTick()

    const rows = wrapper.findAll('.list-item')
    expect(rows).toHaveLength(3)
    expect(rows[1].find('use').exists()).toBe(true)
    expect(rows[0].find('use').exists()).toBe(false)
    expect(rows[2].find('use').exists()).toBe(false)
    // 序号被图标替掉（不是两个都显示）
    expect(rows[1].text()).not.toContain('2')
    expect(rows[0].text()).toContain('1')
  })

  it('同一首歌在别的列表里（队列身份不同）→ 不高亮（身份是队列的语义，不是「含这首歌」）', async() => {
    const list = [song('a'), song('b')]
    tempListMeta.id = 'album__other'
    playInfo.playerListId = LIST_IDS.TEMP
    playInfo.playIndex = 1
    playMusicInfo.listId = LIST_IDS.TEMP
    playMusicInfo.musicInfo = list[1] as LX.Music.MusicInfoOnline

    const wrapper = mountList(list, 'album__m1')
    mountedWrappers.push(wrapper)
    await nextTick()

    expect(wrapper.findAll('.list-item').some(row => row.find('use').exists())).toBe(false)
  })

  it('身份相同但内容不同（共用 online_list__temp）→ 按歌 id 找回真实那一行', async() => {
    const list = [song('x'), song('y'), song('b')]
    tempListMeta.id = 'online_list__temp'
    playInfo.playerListId = LIST_IDS.TEMP
    // 播放器里的位置号指的是**另一个列表**（搜索页那份）的第 2 行
    playInfo.playIndex = 1
    playMusicInfo.listId = LIST_IDS.TEMP
    playMusicInfo.musicInfo = song('b') as LX.Music.MusicInfoOnline

    const wrapper = mountList(list, '')
    mountedWrappers.push(wrapper)
    await nextTick()

    const rows = wrapper.findAll('.list-item')
    expect(rows[2].find('use').exists()).toBe(true)
    expect(rows[0].find('use').exists()).toBe(false)
    expect(rows[1].find('use').exists()).toBe(false)
  })

  it('播放栏的「定位到正在播放」落到这份列表时，把它滚到那一行居中', async() => {
    const list = Array.from({ length: 12 }, (_, i) => song(`s${i}`))
    tempListMeta.id = 'album__m1'
    playInfo.playerListId = LIST_IDS.TEMP
    playInfo.playIndex = 8
    playMusicInfo.listId = LIST_IDS.TEMP
    playMusicInfo.musicInfo = list[8] as LX.Music.MusicInfoOnline

    const wrapper = mountList(list, 'album__m1')
    mountedWrappers.push(wrapper)
    await flushPromises()
    fakeContainer(wrapper)

    expect(hasPlayingRowLocator()).toBe(true)
    expect(locatePlayingRow()).toBe(true)
    // 行高是组件按字号算的（37 @默认字号），这里验的是**关系**：那一行的中点落在容器中线上
    // （误差 ≤ 1px：`getCenteredScrollTop` 会取整，避免半像素滚动让表格文字发虚）
    expect(scrolled).toHaveLength(1)
    const rowTopInViewport = 8 * itemHeightSeen - scrolled[0]
    expect(Math.abs(rowTopInViewport + itemHeightSeen / 2 - 400 / 2)).toBeLessThanOrEqual(1)
  })

  it('列表里没有这首歌 → 不接答（播放栏改走跳转到它的列表）', async() => {
    const list = [song('a'), song('b')]
    const wrapper = mountList(list, 'album__m1')
    mountedWrappers.push(wrapper)
    await flushPromises()
    fakeContainer(wrapper)

    expect(hasPlayingRowLocator()).toBe(false)
    expect(locatePlayingRow()).toBe(false)
  })
})
