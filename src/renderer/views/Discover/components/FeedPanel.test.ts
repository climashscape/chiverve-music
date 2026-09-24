import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedPanel from './FeedPanel.vue'

/**
 * 发现页「推荐」Tab 的渲染回归（ui-polish-3 工单 05）。
 *
 * 用户 2026-09-24 定的口径：「猜你喜欢」板块整体撤掉、**不再渲染任何标题**（「推荐」这个 tab 名
 * 已经说明了内容就是首页推荐），且**「为你打造」楼层整块去掉**（判据见 `../feedGroups.ts` 的
 * `DROPPED_SHELF_IDS`）。
 *
 * 同时钉住票 20 的修法不回归：连续的无名楼层仍要并成一组（孤卡成行的问题就出在没并组）。
 * 数据用票 20 记下的真实 feed 形状（`/tmp/daily30-probe/feed_raw_keys.json`，9 个楼层）。
 */

const { getHomeFeed } = vi.hoisted(() => ({ getHomeFeed: vi.fn() }))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { recommend: { getHomeFeed } } },
}))

const card = (type: number, id: string, name = '') => ({
  kind: type === 500 ? 'playlist' : 'unknown',
  type,
  subType: 0,
  id,
  name,
  subName: '',
  img: '',
  count: 0,
  countText: '',
  reason: '',
  jumpType: 0,
  albumMid: '',
  source: 'tx',
})

/** 真实 feed 的 9 个楼层：2 个有名的（201 由分组层整块丢弃）、1 个占位（type=-1，无目标卡）、6 个无名单卡槽。 */
const realShelves = () => [
  { id: '201', name: '为你打造', style: 0, cards: [card(500, '4279224903', '每日30首'), card(500, '4331788853', '二次元'), card(800, '0_8', '一周听歌排行'), card(800, '0_9', '8月听歌排行')] },
  { id: '202', name: '最近常听', style: 0, cards: Array.from({ length: 17 }, (_, i) => card(500, `s${i}`, `歌单${i}`)) },
  { id: '204', name: '', style: 0, cards: [card(-1, '', '更多为你推荐')] },
  ...Array.from({ length: 6 }, (_, i) => ({ id: '203', name: '', style: 0, cards: [card(500, `n${i}`, `推荐${i}`)] })),
]

const mountPanel = () => mount(FeedPanel, {
  global: {
    mocks: { $t: (key: string) => key },
    stubs: {
      'base-btn': { template: '<button type="button"><slot /></button>' },
    },
  },
})

describe('FeedPanel（工单 05：只剩首页 feed，且一个标题都不渲染）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHomeFeed.mockResolvedValue({ list: realShelves(), hasMore: false, next: null })
  })

  it('不渲染任何标题：没有 h3 / h4，也没有「首页推荐」「猜你喜欢」的字样', async() => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.findAll('h3')).toHaveLength(0)
    expect(wrapper.findAll('h4')).toHaveLength(0)
    const text = wrapper.text()
    for (const key of ['discover__feed', 'discover__guess', '为你打造', '最近常听']) {
      expect(text, key).not.toContain(key)
    }
  })

  it('「猜你喜欢」区块撤掉了：整页不再挂 material-online-list', async() => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.findAll('material-online-list')).toHaveLength(0)
    // 卡片还在（撤的是板块与标题，不是内容）
    expect(wrapper.findAll('li').length).toBeGreaterThan(0)
  })

  it('票 20 的并组不回归：2 组卡片、连续 6 个无名楼层并成 1 组（孤卡行数 0）', async() => {
    const wrapper = mountPanel()
    await flushPromises()

    const rows = wrapper.findAll('ul').map(ul => ul.findAll('li').length)
    // [最近常听 17 张, 6 个无名楼层并成 1 组 6 张]——「为你打造」（id=201）整块丢弃（票 05）
    expect(rows).toEqual([17, 6])
    // 「单卡成行」的组数 —— 票 20 修的就是它（修前 6，修后 0）
    expect(rows.filter(num => num === 1)).toHaveLength(0)
    // 占位楼层（type=-1）整层丢弃：不给它留空 ul
    expect(wrapper.text()).not.toContain('更多为你推荐')
    // 「为你打造」楼层的卡（每日30首 / 二次元）随楼层一起消失
    expect(wrapper.text()).not.toContain('每日30首')
    expect(wrapper.text()).not.toContain('二次元')
  })
})
