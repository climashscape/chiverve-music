import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type * as listAction from '@renderer/store/list/action'
import { clearUnavailable, markUnavailable } from '@renderer/core/music/unavailable'
import { statusText } from '@renderer/store/player/state'
import zhCn from '@root/lang/zh-cn.json'
import ListMusicTable from './index.vue'

/**
 * 本地歌曲表（试听列表 / 我的收藏 / 自建列表）里的「失效曲那一行」（工单 01）。
 *
 * 与在线表的用例同构，额外钉住**本地文件不受影响**：失效登记表只装在线歌曲 id，
 * `isUnavailableMusic` 也把 `source == 'local'` 排除在外——本地文件读磁盘，哪有版权一说。
 */

const { playList, getListMusics } = vi.hoisted(() => ({ playList: vi.fn(), getListMusics: vi.fn() }))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { sources: [], tx: { songList: {}, user: {} } },
}))
// 只换「从主进程库读列表歌曲」这一个读接口（同 index.test.ts 的口径）
vi.mock('@renderer/store/list/action', async(importOriginal) => ({
  ...await importOriginal<typeof listAction>(),
  getListMusics,
}))
// 播放入口换成桩：本用例只看「有没有点得动」
vi.mock('@renderer/core/player', async(importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, playList }
})
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/playlists', query: {} }),
}))

const VirtualizedListStub = defineComponent({
  name: 'BaseVirtualizedList',
  props: {
    list: { type: Array, default: () => [] },
    itemHeight: { type: Number, default: 40 },
    keyName: { type: String, default: 'id' },
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'v-list' }, (props.list as any[]).map((item: any, index: number) =>
      h('div', { key: item.id }, slots.default?.({ item, index }))))
  },
  methods: {
    scrollTo() {},
    getScrollTop() { return 0 },
  },
})

const onlineSong = (id: string) => ({
  id: `tx_${id}`,
  name: `歌${id}`,
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { albumName: '专辑', id, songType: 0, _qualitys: {} },
}) as any

const localSong = {
  id: 'local_/music/a.mp3',
  name: '本地文件',
  singer: '歌手',
  source: 'local',
  interval: '03:00',
  meta: { albumName: '' },
} as any

const mountTable = async(list: any[]) => {
  getListMusics.mockResolvedValue(list)
  const wrapper = mount(ListMusicTable, {
    props: { listId: 'user_1' },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        'base-virtualized-list': VirtualizedListStub,
        'material-list-buttons': true,
        'base-menu': true,
        'common-list-add-modal': true,
        'common-list-add-multiple-modal': true,
        'common-download-modal': true,
        'common-download-multiple-modal': true,
        'search-list': true,
        'music-sort-modal': true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

const doubleClick = async(row: any) => {
  await row.trigger('click')
  await row.trigger('click')
  await flushPromises()
}

let wrappers: any[] = []

beforeEach(() => {
  clearUnavailable('tx_dead')
  clearUnavailable('local_/music/a.mp3')
  statusText.value = ''
  playList.mockClear()
  wrappers = []
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount()
  clearUnavailable('tx_dead')
  clearUnavailable('local_/music/a.mp3')
})

describe('ListMusicTable：失效曲那一行', () => {
  it('在线歌曲登记过 → 置灰 + 原生 title；本地文件那一行不受影响', async() => {
    markUnavailable('tx_dead')
    // 本地文件的 id 即使被登记（正常流程不会发生）也不能灰
    markUnavailable('local_/music/a.mp3')

    const wrapper = await mountTable([onlineSong('dead'), onlineSong('alive'), localSong])
    wrappers.push(wrapper)

    const rows = wrapper.findAll('.list-item')
    // ⚠️ 在线行本来就带 `disabled`（这个测试环境没装 `qualityList`，`assertApiSupport('tx')` 为假），
    // 所以「失效」这一层的判据看 `title`——只有失效行才有
    expect(rows[0].classes()).toContain('disabled')
    expect(rows[0].attributes('title')).toBe('list__unavailable_song')
    expect(rows[1].attributes('title')).toBeUndefined()
    // 本地文件：`assertApiSupport('local')` 恒真，被标失效也不该灰
    expect(rows[2].classes()).not.toContain('disabled')
    expect(rows[2].attributes('title')).toBeUndefined()
  })

  it('双击失效曲：点不动，只给提示', async() => {
    markUnavailable('tx_dead')
    const wrapper = await mountTable([onlineSong('dead'), onlineSong('alive')])
    wrappers.push(wrapper)

    await doubleClick(wrapper.findAll('.list-item')[0])

    expect(playList).not.toHaveBeenCalled()
    expect(statusText.value).toBe(zhCn.list__unavailable_song)
  })

  it('双击正常曲：照旧播（回归钉子）', async() => {
    const wrapper = await mountTable([onlineSong('alive')])
    wrappers.push(wrapper)

    await doubleClick(wrapper.findAll('.list-item')[0])

    expect(playList).toHaveBeenCalledWith('user_1', 0)
  })
})
