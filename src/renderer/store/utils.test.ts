import { beforeEach, describe, expect, it } from 'vitest'
import { qualityList } from './index'
import { assertApiSupport } from './utils'

/**
 * `assertApiSupport` 的语义钉子（AGENTS.md §2.6 的引用点：
 * `views/Search/MusicList/useList.ts:41`、自动换源、下载弹窗等 5 处守卫都靠它）。
 *
 * 要钉住的坑：判据是 `qualityList.value[source] != null`，**不看数组长度** ——
 * 所以「占位声明 `tx: []`」会被判定为支持，随后取流阶段才失败。这条与
 * `api-source-info.ts` 里「数组顺序/内容有语义」的注释是同一组约束。
 *
 * `qualityList` 是 `shallowRef`（`store/index.ts:163`），测试直接换 `.value`。
 */
describe('assertApiSupport', () => {
  beforeEach(() => {
    qualityList.value = {}
  })

  it('qualityList 里没有该源（null/undefined）时返回 false', () => {
    expect(assertApiSupport('tx')).toBe(false)

    qualityList.value = { tx: null as unknown as LX.Quality[] }
    expect(assertApiSupport('tx')).toBe(false)
  })

  it('空数组也算「声明了支持」→ true（判据是 != null，不是数组长度）', () => {
    qualityList.value = { tx: [] }
    expect(assertApiSupport('tx')).toBe(true)
  })

  it('声明了音质档位 → true', () => {
    qualityList.value = { tx: ['128k', '320k'] }
    expect(assertApiSupport('tx')).toBe(true)
  })

  it('local 源不过问 qualityList，恒为 true', () => {
    expect(assertApiSupport('local')).toBe(true)
    qualityList.value = { tx: ['128k'] }
    expect(assertApiSupport('local')).toBe(true)
  })
})
