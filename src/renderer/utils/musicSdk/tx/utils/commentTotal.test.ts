import { describe, expect, it } from 'vitest'
import { pickCommentTotal } from './commentTotal'

/**
 * 评论条数解析的钉子（数据类票 03）。
 *
 * **钉住的契约**：总数只认 h5 读接口响应里的 `commenttotal`；`null` 专表「这次响应里没有
 * 这个数」，与「真的是 0 条评论」严格分开——界面据此决定显不显示计数（0 照显、null 不显示，
 * 不留 `-` 之类的占位噪音），所以这条区分是界面行为的地基。
 *
 * **期望值来源**（2026-09-25 探针，`scripts/verify/artifacts/2026-09-25-qq-probe/NOTES.md` §3）：
 *   1. 230665 = 晴天（`biztype=1`）实测的 `commenttotal`；3964 = 同一首曲子上
 *      `GetHotCommentList` 的 `data.CommentList.Total`（**热评条数**，不是总评论数）；
 *      0 = 失效 / 无可评论对象的 id 实测返回（字段照样在，就是 0）；
 *   2. `null` / 空串 / 数值串的处理是「取不到 vs 有效 0」的口径，不是从被测实现反推的。
 */
describe('tx 评论条数解析（pickCommentTotal）', () => {
  it('取 `commenttotal`（晴天实测 230665）', () => {
    expect(pickCommentTotal({ commenttotal: 230665 })).toBe(230665)
  })

  it('0 是有效总数，不能被当成「没给」', () => {
    expect(pickCommentTotal({ commenttotal: 0 })).toBe(0)
  })

  it('不认热评的 `Total`：它是热评条数，不是总评论数', () => {
    expect(pickCommentTotal({ Total: 3964 })).toBeNull()
    // 两个数同时在场时也只取 commenttotal
    expect(pickCommentTotal({ commenttotal: 230665, Total: 3964 })).toBe(230665)
  })

  it('字段缺失 / 空串 / 空白 / 空节点 → null（取不到，界面不显示计数）', () => {
    expect(pickCommentTotal({})).toBeNull()
    expect(pickCommentTotal({ commenttotal: null })).toBeNull()
    expect(pickCommentTotal({ commenttotal: '' })).toBeNull()
    expect(pickCommentTotal({ commenttotal: '   ' })).toBeNull()
    expect(pickCommentTotal(undefined)).toBeNull()
  })

  it('非数字 / 负数 → null（宁可当取不到，也不把脏值当计数显示）', () => {
    expect(pickCommentTotal({ commenttotal: 'abc' })).toBeNull()
    expect(pickCommentTotal({ commenttotal: NaN })).toBeNull()
    expect(pickCommentTotal({ commenttotal: -1 })).toBeNull()
  })

  it('数值串照收（服务端换形态时调用方不用改）', () => {
    expect(pickCommentTotal({ commenttotal: '230665' })).toBe(230665)
  })
})
