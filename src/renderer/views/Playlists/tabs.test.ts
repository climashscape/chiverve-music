import { describe, expect, it } from 'vitest'
import { normalizeTab, TABS, tabFromQuery, withTab } from './tabs'

describe('我的歌单两个 tab 的 query 推断（工单 09；默认 tab 改云端见工单 07）', () => {
  it('两个 tab 的 id 就是 url 上的取值，默认 tab 在前', () => {
    // TABS[0] 就是默认 tab（normalizeTab / tabFromQuery 的兜底都取它）——2026-09-24 用户定：默认 QQ 音乐·歌单
    expect(TABS).toEqual(['cloud', 'local'])
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
    // 两个键同时出现（手改地址栏）时云端优先——与 16% 时代的旧规则一致，不算回归
    expect(tabFromQuery({ id: 'abc', cloud: '123' })).toBe('cloud')
  })

  it('两个参数都缺（或都不是自己认识的值）时默认云端 tab', () => {
    expect(tabFromQuery({})).toBe('cloud')
    // 试听列表深链重定向进来时可能只剩一堆别的键
    expect(tabFromQuery({ list: 'love', favSource: 'cloud' })).toBe('cloud')
    expect(tabFromQuery({ tab: 'songs' })).toBe('cloud')
    expect(tabFromQuery({ tab: '' })).toBe('cloud')
    // 空串是「没选」而不是「选了本地」
    expect(tabFromQuery({ cloud: '' })).toBe('cloud')
  })

  it('normalizeTab 只认这两个 id', () => {
    expect(normalizeTab('cloud')).toBe('cloud')
    expect(normalizeTab('local')).toBe('local')
    expect(normalizeTab('lists')).toBe('cloud')
    expect(normalizeTab(undefined)).toBe('cloud')
    expect(normalizeTab(1)).toBe('cloud')
  })
})

describe('withTab：写入方必须自己把 tab 带上（工单 02）', () => {
  it('query 里没有 tab 时也补上——切 tab 的导航还没落地就是这个状态，靠 spread 保留会丢 tab', () => {
    // 真机复现（2/2 命中）里本地面板读到的正是 `{ cloud: '125' }`（点 tab 的导航尚未落地）
    expect(withTab({ cloud: '125' }, 'local', { id: 'tx_1' })).toEqual({ cloud: '125', id: 'tx_1', tab: 'local' })
  })

  it('patch 里的键以 patch 为准（覆盖同名的旧参数），tab 盖不掉', () => {
    // 旧 query 里可能还留着另一侧的值，patch 是本次要写的真值
    expect(withTab({ cloud: '125', id: 'old' }, 'local', { id: 'new' })).toEqual({ cloud: '125', id: 'new', tab: 'local' })
    // tab 放在最后合并：即使 patch 里带了 tab（写错的那种），也以传进来的当前 tab 为准
    expect(withTab({}, 'cloud', { tab: 'local' } as any)).toEqual({ tab: 'cloud' })
  })

  it('保留另一个 tab 的参数（切回去时它的选中项还在）与老链接的兼容键', () => {
    expect(withTab({ cloud: '125', id: 'tx_1' }, 'cloud')).toEqual({ cloud: '125', id: 'tx_1', tab: 'cloud' })
    // 老链接 `?id=…` 落本地后再写回：id 与新写的 tab 同时在，tabFromQuery 按 tab 判（不会回归）
    const written = withTab({ id: 'tx_1' }, 'local')
    expect(tabFromQuery(written)).toBe('local')
  })
})
