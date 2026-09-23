import { describe, expect, it } from 'vitest'
import type { PlaylistCard } from '@renderer/store/user/state'
import { resolveCloudSelection } from './cloudSelection'

const card = (dirId: string) => ({ dirId, name: `歌单 ${dirId}` } as unknown as PlaylistCard)
const lists = [card('1'), card('2')]

describe('云端 tab 选中项的归一（工单 09）', () => {
  it('列表还没到手时不动选中项 —— 冷启动直接进 ?cloud=… 不能被抹掉', () => {
    // 这一条来自实测：不等 createdLists 就归一，会把老链接/深链要看的那个歌单改掉
    expect(resolveCloudSelection([], '2', false)).toBeNull()
    expect(resolveCloudSelection(lists, '2', false)).toBeNull()
    expect(resolveCloudSelection([], '', false)).toBeNull()
  })

  it('选中的 dirId 还在列表里 → 保持现状（不写 query）', () => {
    expect(resolveCloudSelection(lists, '2', true)).toBeNull()
  })

  it('选中的 dirId 已不存在（刚删掉 / 老链接失效）→ 落到第一组', () => {
    expect(resolveCloudSelection(lists, '9', true)).toBe('1')
  })

  it('没有选中项 → 落到第一组', () => {
    expect(resolveCloudSelection(lists, '', true)).toBe('1')
  })

  it('一组云端歌单都没有 → 清掉参数（回空串，交给调用方去掉这个键）', () => {
    expect(resolveCloudSelection([], '', true)).toBe('')
    expect(resolveCloudSelection([], '9', true)).toBe('')
  })
})
