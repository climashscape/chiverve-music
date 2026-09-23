import { describe, expect, it } from 'vitest'
import { computeActiveAnchorId, type AnchorOffset } from './useSettingToc'

/**
 * 滚动高亮的判定（纯函数部分）。真机上的滚动/闪烁见票 02 的验收清单，这里只钉算法本身：
 * 容差、越界（滚到节尾不许变成 undefined）、内容不满一屏、"到底"的判据、入参顺序不敏感。
 */
const anchors: AnchorOffset[] = [
  { id: 'a', offset: 0 },
  { id: 'b', offset: 400 },
  { id: 'c', offset: 900 },
]

describe('computeActiveAnchorId', () => {
  it('没有锚点返回 null（该节内容还没归位）', () => {
    expect(computeActiveAnchorId([], 0)).toBeNull()
    expect(computeActiveAnchorId([], 999, { atBottom: true })).toBeNull()
  })

  it('停在顶部高亮第一个（锚点自带 margin，容差就是为它留的）', () => {
    expect(computeActiveAnchorId(anchors, 0)).toBe('a')
    expect(computeActiveAnchorId(anchors, 10)).toBe('a')
  })

  it('滚到锚点容差内就切到它（锚点距顶 ≤ 容差即算已滚到）', () => {
    expect(computeActiveAnchorId(anchors, 375)).toBe('a')
    expect(computeActiveAnchorId(anchors, 376)).toBe('b')
    expect(computeActiveAnchorId(anchors, 500)).toBe('b')
    expect(computeActiveAnchorId(anchors, 876)).toBe('c')
  })

  it('滚过最后一个锚点仍然是最后一个（不越界）', () => {
    expect(computeActiveAnchorId(anchors, 5000)).toBe('c')
  })

  it('atBottom 且真的滚动过 → 直接取最后一个（尾部内容不够高时最后一个分组滚不到顶）', () => {
    expect(computeActiveAnchorId(anchors, 620, { atBottom: true })).toBe('c')
  })

  it('atBottom 但没滚动过（内容不满一屏）→ 仍按位置算，不误判成最后一个', () => {
    expect(computeActiveAnchorId(anchors, 0, { atBottom: true })).toBe('a')
  })

  it('入参顺序不敏感，且不改原数组', () => {
    const shuffled = [anchors[2], anchors[0], anchors[1]]
    const snapshot = [...shuffled]
    expect(computeActiveAnchorId(shuffled, 500)).toBe('b')
    expect(shuffled).toEqual(snapshot)
  })
})
