import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SearchList from './SearchList.vue'

/**
 * 列表内搜索的结果行必须按**身份**（`item.id`）做 key（2026-09-26 复核的缺陷 2）。
 *
 * 原来写的是 `:key="item.songmid"`，而新式 musicInfo 上 mid 叫 `meta.songId`（老式平铺对象才叫
 * `songmid`，映射见 `common/utils/tools.ts`）→ **每一行的 key 都是 `undefined`**。Vue 对
 * `KEYED_FRAGMENT` 里 `key == null` 的项退化成「按位 patch」：结果顺序一变（换个关键词重搜时很常见），
 * DOM 节点不是跟着数据走，而是原地改文本——行内的选中态、浏览器焦点、节点身份全错位。
 * 同文件 `handleTemplistClick`（`:154`）早就用 `item.id` 定位了，这里统一口径。
 *
 * 断言方式：重搜成新顺序后，**C 那一行的 DOM 元素应该还是原来那个节点**（key 匹配 → 移动节点）。
 * 按位 patch 时索引 0 处是原来的 A 节点，必红。
 */
const searchListMusic = vi.fn()

/** 新式模型（运行期 `list` 里的真形状）：顶层没有 `songmid`，mid 在 `meta` 里 */
const song = (id: string, name: string) => ({
  id: `tx_${id}`,
  name,
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id, songId: `mid${id}`, albumName: '', songType: 0 },
}) as any

const ROWS = [song('1', 'A'), song('2', 'B'), song('3', 'C')]

const mountSearch = () => mount(SearchList, {
  props: { list: ROWS, visible: false },
  global: { mocks: { $t: (key: string) => key } },
})

/** 跑一次搜索（组件里 `handleDelaySearch` 是 100ms 防抖，这里直接调取数那一步） */
const search = async(wrapper: ReturnType<typeof mountSearch>, results: unknown[]) => {
  searchListMusic.mockResolvedValue(results)
  wrapper.vm.text = '关键词'
  await wrapper.vm.handleSearch()
  await nextTick()
}

// 内容 teleport 到 `#view`（不在组件根节点里），VTU 的 wrapper.find 搜不到，只能查 document
const rowNodes = () => [...document.querySelectorAll('li')]
const rowTexts = () => rowNodes().map(node => node.textContent ?? '')

beforeEach(() => {
  // 这个组件整棵模板在 `teleport to="#view"` 里：jsdom 里没有那个锚点，不建就什么都渲染不出来
  const target = document.createElement('div')
  target.id = 'view'
  document.body.appendChild(target)
  window.lx.worker.main = { searchListMusic } as any
})

afterEach(() => {
  searchListMusic.mockReset()
  document.body.innerHTML = ''
})

describe('ListMusicTable/components/SearchList：结果行的 key', () => {
  it('重搜换顺序后，同一首歌还是同一个 DOM 节点（key 按身份匹配，不是按位改文本）', async() => {
    const wrapper = mountSearch()

    await search(wrapper, ROWS)
    expect(rowTexts().map(text => text.slice(0, 5))).toEqual(['A - 歌', 'B - 歌', 'C - 歌'])
    const nodeOfC = rowNodes()[2]

    // 同一批歌换个顺序回来（真机上就是「换个关键词重搜，命中的还是这几首」）
    await search(wrapper, [ROWS[2], ROWS[0], ROWS[1]])

    expect(rowTexts().map(text => text.slice(0, 5))).toEqual(['C - 歌', 'A - 歌', 'B - 歌'])
    // C 现在在第一行，且必须还是原来那个节点
    expect(rowNodes()[0]).toBe(nodeOfC)
    wrapper.unmount()
  })
})
