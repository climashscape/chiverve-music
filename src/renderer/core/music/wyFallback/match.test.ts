import { describe, expect, it } from 'vitest'
import { filterStr, parseInterval, pickStrictMatches, sortSingle } from './match'
import type { WySongInfo } from './api'

/**
 * 严格匹配（`./match.ts`）的钉子。
 *
 * 这一层是「静默兜底」唯一的护栏：兜底成功后用户**看不出**放的是哪一版，所以匹配错 = 用户听着
 * 一首没点过的歌。这里逐条钉住「宁可不播，不放错歌」（2026-09-26 用户口径）：
 * 歌名 / 歌手 / 时长三条都要过，只有时长未知时才放行时长这一条。
 */

const song = (over: Partial<WySongInfo> = {}): WySongInfo => ({
  id: 1,
  name: '晴天',
  singer: '周杰伦',
  albumName: '叶惠美',
  duration: 269,
  ...over,
})

describe('规范化小工具', () => {
  it('sortSingle 把多歌手按分隔符拆开排序后拼回（顺序不同也能判等）', () => {
    expect(sortSingle('周杰伦、方文山')).toBe(sortSingle('方文山、周杰伦'))
    expect(sortSingle('A/B')).toBe(sortSingle('B/A'))
    expect(sortSingle('周杰伦')).toBe('周杰伦')
  })

  it('filterStr 去掉空白与标点并转小写', () => {
    expect(filterStr('晴天 (Live)')).toBe('晴天live')
    expect(filterStr('Hello, World!')).toBe('helloworld')
    expect(filterStr(undefined)).toBe('')
  })

  it('parseInterval 解析 mm:ss 与 hh:mm:ss，坏值给 0', () => {
    expect(parseInterval('04:29')).toBe(269)
    expect(parseInterval('01:04:29')).toBe(3869)
    expect(parseInterval('')).toBe(0)
    expect(parseInterval(undefined)).toBe(0)
    expect(parseInterval('abc')).toBe(0)
  })
})

describe('pickStrictMatches：歌名 / 歌手 / 时长三条都要过', () => {
  const target = { name: '晴天', singer: '周杰伦', interval: '04:29' }

  it('三条都一致才命中', () => {
    expect(pickStrictMatches(target, [song()])).toHaveLength(1)
  })

  it('歌手对不上（翻唱）不命中 —— 这是「不放错歌」最关键的一条', () => {
    expect(pickStrictMatches(target, [song({ singer: 'Lucky小爱' })])).toEqual([])
    expect(pickStrictMatches(target, [song({ name: '晴天 (原唱 周杰伦)', singer: 'RyaVocal' })])).toEqual([])
  })

  it('版本差异不命中（歌名精确相等天然排掉「深情版 / Live / 伴奏」）', () => {
    expect(pickStrictMatches(target, [song({ name: '晴天 (深情版)' })])).toEqual([])
    expect(pickStrictMatches(target, [song({ name: '晴天Live' })])).toEqual([])
  })

  it('时长差超过 5 秒不命中', () => {
    expect(pickStrictMatches(target, [song({ duration: 279 })])).toEqual([])
    expect(pickStrictMatches(target, [song({ duration: 264 })])).toHaveLength(1)
  })

  it('目标时长未知（interval 缺省）时不过滤时长这一条', () => {
    expect(pickStrictMatches({ name: '晴天', singer: '周杰伦' }, [song({ duration: 999 })])).toHaveLength(1)
  })

  it('多歌手顺序不同仍命中', () => {
    const multi = song({ singer: '方文山、周杰伦' })
    expect(pickStrictMatches({ name: '晴天', singer: '周杰伦、方文山' }, [multi])).toHaveLength(1)
  })

  it('歌名空 / 候选非数组时返回空数组', () => {
    expect(pickStrictMatches({ name: '', singer: '周杰伦' }, [song()])).toEqual([])
    expect(pickStrictMatches(target, undefined as unknown as WySongInfo[])).toEqual([])
  })

  it('按搜索顺序返回，且受 limit 截断', () => {
    const candidates = [
      song({ id: 10 }),
      song({ id: 11 }),
      song({ id: 12 }),
      song({ id: 13 }),
    ]
    expect(pickStrictMatches(target, candidates, 2).map(s => s.id)).toEqual([10, 11])
    expect(pickStrictMatches(target, candidates).map(s => s.id)).toEqual([10, 11, 12])
  })
})
