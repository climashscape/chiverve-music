import { describe, it, expect } from 'vitest'
import { groupShelves, type FeedGroupCard } from './feedGroups'

/**
 * 票 20 的回归用例 + 票 05 的「为你打造」丢弃用例。数据形状照
 * `/tmp/daily30-probe/feed_raw_keys.json`（2026-09-23 实拉的首页 feed；2026-09-24 二次实拉
 * 见 `/tmp/feed-id-check/feed_raw_2026-09-24.json`，两份的楼层 id 与 201 的卡片逐张相同）：
 * 以 `201` 为首个楼层（「为你打造」，4 张卡里 2 张可点，**票 05 起整块丢弃**），
 * 接着 `202`（「最近常听」17 张全可点），一个 `type=-1` 的占位楼层 `204`，
 * 最后 6 个 `203` 楼层**没有标题、每层只有 1 张卡**。
 */

interface Card extends FeedGroupCard { type: number }

const card = (type: number, id: string, name = ''): Card => ({ type, kind: type === 500 ? 'playlist' : 'unknown', id, name })
/** 「可点」= 歌单卡（与 FeedPanel 的 toCardTarget 同一口径的简化版；本模块只认传进来的判定函数）。 */
const clickable = (c: Card) => c.kind === 'playlist'

/** 服务端实拉的 9 个楼层，**原样**（含被丢弃的 201——过滤是 groupShelves 的职责，不是数据的）。 */
const realFeedShell = (): Array<{ id: string, name: string, cards: Card[] }> => [
  { id: '201', name: '为你打造', cards: [card(500, '4279224903', '每日30首'), card(500, '4331788853'), card(800, '0_8', '一周听歌排行'), card(800, '0_9', '8月听歌排行')] },
  { id: '202', name: '最近常听', cards: Array.from({ length: 17 }, (_, i) => card(500, `s${i}`, `歌单${i}`)) },
  { id: '204', name: '', cards: [card(-1, '', '更多为你推荐')] },
  ...Array.from({ length: 6 }, (_, i) => ({ id: '203', name: '', cards: [card(500, `n${i}`, `推荐${i}`)] })),
]

describe('groupShelves（票 20：推荐 tab 的卡片分组）', () => {
  it('连续的无名楼层并成一组——这是「成一竖列」的修法', () => {
    const groups = groupShelves(realFeedShell(), clickable)
    // 6 个无名单卡槽 → 1 组 6 张卡
    const nameless = groups.filter(g => g.name === '')
    expect(nameless).toHaveLength(1)
    expect(nameless[0].cards).toHaveLength(6)
    expect(nameless[0].cards.map(c => c.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5'])
  })

  it('「为你打造」楼层（id=201）整块丢弃，其余楼层与并组结果不变（票 05）', () => {
    const groups = groupShelves(realFeedShell(), clickable)
    const ids = groups.flatMap(g => g.cards).map(c => c.id)
    // 该楼层的两张可点卡（每日30首 / 二次元）与它一起消失
    expect(ids).not.toContain('4279224903')
    expect(ids).not.toContain('4331788853')
    // 其余楼层逐项不变：2 组、卡片归属与张数与丢之前一致
    expect(groups.map(g => g.name)).toEqual(['最近常听', ''])
    expect(groups[0].cards.map(c => c.id)).toEqual(Array.from({ length: 17 }, (_, i) => `s${i}`))
    expect(groups[1].cards.map(c => c.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5'])
    // 被丢的楼层夹在两段无名单卡之间时，两段会被接上并成一组（丢弃发生在并组判定之前）
    const sandwiched = groupShelves([
      { id: '203', name: '', cards: [card(500, 'a')] },
      { id: '201', name: '为你打造', cards: [card(500, 'b')] },
      { id: '203', name: '', cards: [card(500, 'c')] },
    ], clickable)
    expect(sandwiched).toHaveLength(1)
    expect(sandwiched[0].cards.map(c => c.id)).toEqual(['a', 'c'])
  })

  it('有名楼层各自成组，标题与自己的卡片行绑在一起', () => {
    const groups = groupShelves(realFeedShell(), clickable)
    expect(groups.map(g => g.name)).toEqual(['最近常听', ''])
    expect(groups[0].cards).toHaveLength(17)
  })

  it('过滤后没卡片的楼层整层丢弃（type=-1 的占位楼层不该渲染）', () => {
    const groups = groupShelves(realFeedShell(), clickable)
    expect(groups.flatMap(g => g.cards).some(c => c.kind === 'unknown')).toBe(false)
    expect(groups.some(g => g.key.startsWith('204'))).toBe(false)
  })

  it('key 唯一：同 id 的无名楼层（实测 6 个 id=203）不会撞 Vue 的 key', () => {
    const groups = groupShelves(realFeedShell(), clickable)
    const keys = groups.map(g => g.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('203__3')
  })

  it('无名楼层夹在有名楼层之间时，只并「连续」的那一段', () => {
    const shelves = [
      { id: 'a', name: '', cards: [card(500, '1')] },
      { id: 'b', name: '', cards: [card(500, '2')] },
      { id: 'c', name: '标题', cards: [card(500, '3')] },
      { id: 'd', name: '', cards: [card(500, '4')] },
      { id: 'e', name: '', cards: [card(500, '5')] },
    ]
    const groups = groupShelves(shelves, clickable)
    expect(groups.map(g => g.name)).toEqual(['', '标题', ''])
    expect(groups.map(g => g.cards.length)).toEqual([2, 1, 2])
  })

  it('全空输入返回空数组（不抛错）', () => {
    expect(groupShelves([], clickable)).toEqual([])
  })
})
