import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { nextTick } from '@common/utils/vueTools'
import { clearUnavailable, markUnavailable } from '@renderer/core/music/unavailable'
import { statusText } from '@renderer/store/player/state'
import zhCn from '@root/lang/zh-cn.json'
import OnlineList from './index.vue'

/**
 * 在线歌曲表的「失效曲那一行」（工单 01：灰掉 + 点不动 + 有说明）。
 *
 * 这里钉的是**接线**（判定本身在 `core/music/unavailable.test.ts`、取流结论在
 * `utils/musicSdk/tx/musicUrl.test.ts`）：
 * 登记过的歌那一行要带 `disabled`（既有置灰 class，全局 `.list-item.disabled { opacity: .5 }`）
 * 与原生 `title`，且**双击不播**（多选播放不拦——那时播的是整个选中队列，由连播自己跳过）。
 */

// 这份用例不碰路由（同 playingRow.test.ts：跳转类动作在 `useMusicJump` 里）
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/album', query: {} }),
}))

/** 只换掉 `playMusicList`：这个组件树里还有别的模块真用 `@renderer/core/player`（如 store），
 *  整块桩掉会把它们一起打断 */
const { playMusicList } = vi.hoisted(() => ({ playMusicList: vi.fn() }))
vi.mock('@renderer/core/player', async(importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, playMusicList }
})

const VirtualizedListStub = defineComponent({
  name: 'BaseVirtualizedList',
  props: {
    list: { type: Array, default: () => [] },
    itemHeight: { type: Number, default: 40 },
    keyName: { type: String, default: 'id' },
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'v-list' }, (props.list as any[]).map((item: any, index: number) =>
      h('div', { key: item.id, class: 'row-wrap' }, slots.default?.({ item, index }))))
  },
  methods: {
    scrollTo() {},
    getScrollTop() { return 0 },
  },
})

const song = (id: string) => ({
  id,
  name: `歌${id}`,
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { albumName: '专辑', _qualitys: {} },
})

const mountList = (list: Array<ReturnType<typeof song>>) => mount(OnlineList, {
  props: { list, page: 1, limit: 20, total: list.length, listId: 'album__m1' },
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

/** 行双击：`doubleClickPlay` 要两次 400ms 内的点击才算双击 */
const doubleClick = async(row: ReturnType<ReturnType<typeof mountList>['find']>) => {
  await row.trigger('click')
  await row.trigger('click')
  await flushPromises()
}

let wrappers: Array<ReturnType<typeof mountList>> = []
const list = [song('tx_dead'), song('tx_alive')]

beforeEach(() => {
  clearUnavailable('tx_dead')
  clearUnavailable('tx_alive')
  statusText.value = ''
  playMusicList.mockClear()
  wrappers = []
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount()
  clearUnavailable('tx_dead')
  clearUnavailable('tx_alive')
})

describe('OnlineList：失效曲那一行', () => {
  it('登记过的行带 disabled + title，正常行不带', async() => {
    markUnavailable('tx_dead')
    const wrapper = mountList(list)
    wrappers.push(wrapper)
    await nextTick()

    const rows = wrapper.findAll('.list-item')
    expect(rows[1 - 1].classes()).toContain('disabled')
    expect(rows[1 - 1].attributes('title')).toBe('list__unavailable_song')
    expect(rows[2 - 1].classes()).not.toContain('disabled')
    expect(rows[2 - 1].attributes('title')).toBeUndefined()
  })

  it('双击失效曲：不播（只给提示）', async() => {
    markUnavailable('tx_dead')
    const wrapper = mountList(list)
    wrappers.push(wrapper)
    await nextTick()

    await doubleClick(wrapper.findAll('.list-item')[0])

    expect(playMusicList).not.toHaveBeenCalled()
    expect(statusText.value).toBe(zhCn.list__unavailable_song)
  })

  it('双击正常曲：照旧起播（回归钉子）', async() => {
    const wrapper = mountList(list)
    wrappers.push(wrapper)
    await nextTick()

    await doubleClick(wrapper.findAll('.list-item')[1])

    expect(playMusicList).toHaveBeenCalledTimes(1)
    const [queueId, queueList, index] = playMusicList.mock.calls[0]
    expect(queueId).toBe('album__m1')
    expect(index).toBe(1)
    // 传的是整份列表（props 是响应式代理，不比对引用，比对内容）
    expect((queueList as typeof list)[index].id).toBe('tx_alive')
  })
})
