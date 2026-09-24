import { describe, expect, it } from 'vitest'
import { normalizeTab, shouldFetch, TABS } from './tabs'

/** 造一个块的两个懒加载字段（其余字段与判定无关，`shouldFetch` 也不读） */
const state = (loadedMid = '', loadingMid = '') => ({ loadedMid, loadingMid })

describe('歌手页四个 tab 的 id 与懒加载判定（工单 02）', () => {
  it('tab 顺序与 id：与用户原话「歌曲 专辑 MV 相似歌手」一致', () => {
    expect(TABS).toEqual(['songs', 'albums', 'mv', 'similar'])
  })

  it('认得出的 tab 原样返回', () => {
    expect(normalizeTab('songs')).toBe('songs')
    expect(normalizeTab('albums')).toBe('albums')
    expect(normalizeTab('mv')).toBe('mv')
    expect(normalizeTab('similar')).toBe('similar')
  })

  it('旧链接（没有 tab 键）与认不出的值都落歌曲 tab', () => {
    // 老地址 /singer?mid=… 刷新 / 分享进来时走的正是这一条
    expect(normalizeTab(undefined)).toBe('songs')
    expect(normalizeTab('')).toBe('songs')
    expect(normalizeTab('albums2')).toBe('songs')
    expect(normalizeTab(1)).toBe('songs')
  })

  it('本块已有这个歌手的数据 → 不重复拉（切走再切回）', () => {
    expect(shouldFetch(state('singerA'), 'singerA')).toBe(false)
  })

  it('换了歌手 → 要拉（旧数据不能顶替新歌手）', () => {
    expect(shouldFetch(state('singerA'), 'singerB')).toBe(true)
    // 首次进页：什么都没有
    expect(shouldFetch(state(), 'singerA')).toBe(true)
  })

  it('同一歌手的请求还在路上 → 不重复拉（来回连点 tab 只打一次）', () => {
    expect(shouldFetch(state('', 'singerA'), 'singerA')).toBe(false)
  })

  it('上次失败了（loadedMid 留空）→ 切回来重试', () => {
    expect(shouldFetch(state('', ''), 'singerA')).toBe(true)
  })

  it('路由没带 mid → 一律不发请求', () => {
    expect(shouldFetch(state(), '')).toBe(false)
    expect(shouldFetch(state('singerA'), '')).toBe(false)
  })
})
