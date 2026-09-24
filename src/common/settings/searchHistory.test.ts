import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SEARCH_HISTORY_MAX_NUM,
  SEARCH_HISTORY_MAX_NUM_MAX,
  SEARCH_HISTORY_MAX_NUM_MIN,
  getSearchHistoryMaxNum,
  nextHistoryList,
  normalizeSearchHistoryMaxNum,
} from './searchHistory'

/**
 * 搜索历史条数（`search.historyMaxNum`，设置页重构票 09）：量程规整 + 裁剪规则。
 *
 * 裁剪这一段的断言全部对齐**改造前的固定行为**（`store/search/action.ts` 的
 * `splice(14, …)` + `unshift`）：不动这个设置时，历史列表必须与改前逐条一致——默认值 15
 * 也要靠这些用例证明它真是「1 条新词 + 14 条旧词」。
 */

describe('量程与默认值', () => {
  it('默认 15 = 改造前写死的条数；量程 0–100 涵盖它', () => {
    expect(DEFAULT_SEARCH_HISTORY_MAX_NUM).toBe(15)
    expect(SEARCH_HISTORY_MAX_NUM_MIN).toBe(0)
    expect(SEARCH_HISTORY_MAX_NUM_MAX).toBe(100)
  })
})

describe('normalizeSearchHistoryMaxNum：非法落默认、过大夹上限', () => {
  it('量程内的值原样返回（含边界 0 与 100）', () => {
    for (const value of [0, 1, 3, 15, 99, 100]) expect(normalizeSearchHistoryMaxNum(value)).toBe(value)
  })

  it('0 是合法值（= 不记历史），不能被当成「缺失」顶成 15', () => {
    expect(normalizeSearchHistoryMaxNum(0)).toBe(0)
    expect(normalizeSearchHistoryMaxNum('0')).toBe(0)
  })

  it('负数 / 非数字 / 缺失落到默认 15', () => {
    for (const value of [undefined, null, '', 'abc', NaN, -1, -15, Infinity, -Infinity]) {
      expect(normalizeSearchHistoryMaxNum(value)).toBe(DEFAULT_SEARCH_HISTORY_MAX_NUM)
    }
  })

  it('过大夹到量程上限（手改配置写成 1000 → 100）', () => {
    expect(normalizeSearchHistoryMaxNum(101)).toBe(SEARCH_HISTORY_MAX_NUM_MAX)
    expect(normalizeSearchHistoryMaxNum(1000)).toBe(SEARCH_HISTORY_MAX_NUM_MAX)
  })

  it('小数截断（3.9 → 3）', () => {
    expect(normalizeSearchHistoryMaxNum(3.9)).toBe(3)
  })
})

describe('getSearchHistoryMaxNum：消费点唯一入口', () => {
  it('从设置对象里现取', () => {
    const setting: Pick<LX.AppSetting, 'search.historyMaxNum'> = { 'search.historyMaxNum': 3 }
    expect(getSearchHistoryMaxNum(setting)).toBe(3)
    setting['search.historyMaxNum'] = 0
    expect(getSearchHistoryMaxNum(setting)).toBe(0)
  })

  it('老配置里没有这个 key（undefined）→ 默认 15，与改造前一致', () => {
    const missing: Partial<LX.AppSetting> = {}
    expect(getSearchHistoryMaxNum(missing as Pick<LX.AppSetting, 'search.historyMaxNum'>)).toBe(DEFAULT_SEARCH_HISTORY_MAX_NUM)
  })
})

describe('nextHistoryList：置顶 + 去重 + 截断（纯函数）', () => {
  it('新词置顶，其余顺序不变', () => {
    expect(nextHistoryList(['b', 'c'], 'a', 15)).toEqual(['a', 'b', 'c'])
  })

  it('已有的词整条删掉再置顶（只留一份）', () => {
    expect(nextHistoryList(['a', 'b', 'c'], 'c', 15)).toEqual(['c', 'a', 'b'])
  })

  it('默认 15 就是改造前的口径：只留 14 条旧记录 + 1 条新词', () => {
    const old = Array.from({ length: 15 }, (_, i) => `old${i}`)
    const next = nextHistoryList(old, 'new', DEFAULT_SEARCH_HISTORY_MAX_NUM)
    expect(next).toHaveLength(15)
    expect(next[0]).toBe('new')
    expect(next.slice(1)).toEqual(old.slice(0, 14))
    // 最旧的那条被挤掉
    expect(next).not.toContain('old14')
  })

  it('上限 3：连搜 5 个词只剩最新 3 条（验收里的真机场景就是这个口径）', () => {
    let list: string[] = []
    for (const word of ['w1', 'w2', 'w3', 'w4', 'w5']) list = nextHistoryList(list, word, 3)
    expect(list).toEqual(['w5', 'w4', 'w3'])
  })

  it('上限 0 返回空表（调用方在此之前就返回、不落盘）', () => {
    expect(nextHistoryList(['a', 'b'], 'c', 0)).toEqual([])
  })

  it('上限 1：只剩刚搜的那个词', () => {
    expect(nextHistoryList(['a'], 'b', 1)).toEqual(['b'])
  })

  it('不修改入参（同一份列表被反复传进来也不会被就地改）', () => {
    const list = ['a', 'b']
    nextHistoryList(list, 'c', 2)
    expect(list).toEqual(['a', 'b'])
  })

  it('重复词只留一份（原来只删第一处；历史里本来不该有重复项，这里兜住）', () => {
    expect(nextHistoryList(['a', 'b', 'a'], 'a', 15)).toEqual(['a', 'b'])
  })

  it('空表也能直接收第一个词', () => {
    expect(nextHistoryList([], 'a', 15)).toEqual(['a'])
  })
})

describe('消费点对账：写入路径真的走这两个函数', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/store/search/action.ts'), 'utf8')

  it('addHistoryWord 现取设置 + 用纯函数算新列表（不是各写一遍裁剪）', () => {
    expect(source).toContain('getSearchHistoryMaxNum(')
    expect(source).toContain('nextHistoryList(')
    // 改造前的魔法数 15 与 `splice(14, …)` 不该再出现（回归就会被抓）
    expect(source).not.toContain('splice(14')
    expect(source).not.toMatch(/historyList\.length\s*>=\s*15/)
  })

  it('上限为 0 时在写入前就返回（0 = 不记历史）', () => {
    expect(source).toMatch(/if \(maxNum < 1\) return/)
  })
})
