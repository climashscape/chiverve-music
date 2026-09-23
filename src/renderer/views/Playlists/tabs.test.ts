import { describe, expect, it } from 'vitest'
import { normalizeTab, TABS, tabFromQuery } from './tabs'

describe('我的歌单两个 tab 的 query 推断（工单 09）', () => {
  it('两个 tab 的 id 就是 url 上的取值', () => {
    expect(TABS).toEqual(['local', 'cloud'])
  })

  it('有 tab 参数时以它为准', () => {
    expect(tabFromQuery({ tab: 'local' })).toBe('local')
    expect(tabFromQuery({ tab: 'cloud' })).toBe('cloud')
    // tab 与另一个 tab 的参数同时存在（切过 tab 又切回来）也认 tab
    expect(tabFromQuery({ tab: 'local', cloud: '123' })).toBe('local')
    expect(tabFromQuery({ tab: 'cloud', id: 'abc' })).toBe('cloud')
  })

  it('老链接：?id=… 落本地 tab，?cloud=… 落云端 tab', () => {
    expect(tabFromQuery({ id: 'abc' })).toBe('local')
    expect(tabFromQuery({ cloud: '123' })).toBe('cloud')
  })

  it('两个参数都缺（或都不是自己认识的值）时默认本地 tab', () => {
    expect(tabFromQuery({})).toBe('local')
    // 试听列表深链重定向进来时可能只剩一堆别的键
    expect(tabFromQuery({ list: 'love', favSource: 'cloud' })).toBe('local')
    expect(tabFromQuery({ tab: 'songs' })).toBe('local')
    expect(tabFromQuery({ tab: '' })).toBe('local')
  })

  it('normalizeTab 只认这两个 id', () => {
    expect(normalizeTab('cloud')).toBe('cloud')
    expect(normalizeTab('local')).toBe('local')
    expect(normalizeTab('lists')).toBe('local')
    expect(normalizeTab(undefined)).toBe('local')
    expect(normalizeTab(1)).toBe('local')
  })
})
