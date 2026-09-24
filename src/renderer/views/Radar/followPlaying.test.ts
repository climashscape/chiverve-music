import { describe, expect, it } from 'vitest'
import { FOLLOW_STAY, resolveFollowCursor, type FollowPlayingInput, type FollowSong } from './followPlaying'

/**
 * 工单 12 的判定靠这组用例钉住：**该跟的跟到位、不该动的必须是不动**。
 * 时机（只在播放曲目变化时调用）在组件里，不是本文件的题目——但下面的用例合起来就是
 * 组件那个 watch 回调的语义，改判定时先看这里。
 */

const makeList = (...ids: string[]): FollowSong[] => ids.map(id => ({ id }))

/** 身份闸通过的默认输入：默认「正在播的就是游标那一张、队列下标也一致」。 */
const follow = (songs: FollowSong[], cursor: number, overrides: Partial<FollowPlayingInput> = {}) =>
  resolveFollowCursor({
    list: songs,
    isCurrentQueue: true,
    playIndex: cursor,
    playingId: songs[cursor]?.id ?? null,
    cursor,
    ...overrides,
  })

describe('views/Radar/followPlaying', () => {
  describe('命中：正在播的歌在本列表里', () => {
    it('往前跟：播放曲目在下标 1，游标在 4 → 游标回到 1', () => {
      expect(follow(makeList('a', 'b', 'c', 'd', 'e'), 4, { playIndex: 1, playingId: 'b' })).toBe(1)
    })

    it('往后跟：播放曲目在下标 4，游标在 0 → 游标走到 4', () => {
      expect(follow(makeList('a', 'b', 'c', 'd', 'e'), 0, { playIndex: 4, playingId: 'e' })).toBe(4)
    })

    it('第一首与最后一首都跟得到（边界不丢）', () => {
      const songs = makeList('a', 'b', 'c')
      expect(follow(songs, 2, { playIndex: 0, playingId: 'a' })).toBe(0)
      expect(follow(songs, 0, { playIndex: 2, playingId: 'c' })).toBe(2)
    })

    it('只有一首歌的列表：就是它 → 不动（没有可跟的位置）', () => {
      expect(follow(makeList('a'), 0)).toBe(FOLLOW_STAY)
    })
  })

  describe('不动：判定为不该跟随', () => {
    it('正在播的就是当前那张 → 不动（不抖动）', () => {
      expect(follow(makeList('a', 'b', 'c'), 1)).toBe(FOLLOW_STAY)
    })

    it('队列身份不符 → 不动（在别的列表里播的歌不认）', () => {
      const songs = makeList('a', 'b', 'c')
      expect(follow(songs, 0, { isCurrentQueue: false, playIndex: 2, playingId: 'c' })).toBe(FOLLOW_STAY)
    })

    it('tab 切换瞬间：另一个 tab 的队列在播 → 本 tab 的游标留在原处（不被带歪）', () => {
      // 雷达队列在播（队列下标 2），「每日30首」这个轮播来问：身份不符 → 它槽里的游标 7 不许动
      expect(follow(makeList('x', 'y', 'z'), 7, { isCurrentQueue: false, playIndex: 2, playingId: 'z' })).toBe(FOLLOW_STAY)
    })

    it('没在播：playingId 为 null / undefined → 不动', () => {
      const songs = makeList('a', 'b')
      expect(follow(songs, 0, { playIndex: 1, playingId: null })).toBe(FOLLOW_STAY)
      expect(follow(songs, 0, { playIndex: 1, playingId: undefined })).toBe(FOLLOW_STAY)
    })

    it('没在播：playIndex 为 -1（队列里找不到位置）→ 不动', () => {
      expect(follow(makeList('a', 'b'), 1, { playIndex: -1, playingId: 'b' })).toBe(FOLLOW_STAY)
    })

    it('列表为空（首屏还没回来 / 换一批失败被清空）→ 不动', () => {
      expect(follow([], 0, { playIndex: 0, playingId: 'a' })).toBe(FOLLOW_STAY)
    })

    it('正在播的歌不在本列表（在别的列表里切歌）→ 不动', () => {
      expect(follow(makeList('a', 'b', 'c'), 0, { playIndex: 1, playingId: 'zzz' })).toBe(FOLLOW_STAY)
    })

    it('「不动」的返回值是负数哨兵，与任何合法下标不重叠', () => {
      expect(FOLLOW_STAY).toBeLessThan(0)
    })
  })

  describe('下标与列表错位时：按歌 id 兜底', () => {
    it('playIndex 越界（换一批后列表变短）→ 按 id 找到真正那一张', () => {
      expect(follow(makeList('a', 'b'), 0, { playIndex: 9, playingId: 'b' })).toBe(1)
    })

    it('playIndex 指向的是另一首歌（身份相等但内容不同：两个列表共用队列标识）→ 不听下标', () => {
      // 队列下标 1 落在本列表里是 'b'，但正在播的是 'c' —— 只信下标会把游标带到错的那张
      expect(follow(makeList('a', 'b', 'c'), 0, { playIndex: 1, playingId: 'c' })).toBe(2)
    })

    it('列表在播放之后被编辑过（播放的那一首被删了）→ 不动', () => {
      expect(follow(makeList('a', 'c'), 0, { playIndex: 1, playingId: 'b' })).toBe(FOLLOW_STAY)
    })
  })

  describe('同一首歌在列表里出现多次', () => {
    it('下标能指明是哪一次时，跟到那一次（不是永远取第一处）', () => {
      expect(follow(makeList('a', 'b', 'a', 'c'), 3, { playIndex: 2, playingId: 'a' })).toBe(2)
    })

    it('下标不可用时退回第一处（兜底口径：同一首歌哪一处都算它）', () => {
      const songs = makeList('a', 'b', 'a', 'c')
      expect(follow(songs, 3, { playIndex: -1, playingId: 'a' })).toBe(0)
      expect(follow(songs, 3, { playIndex: 99, playingId: 'a' })).toBe(0)
    })

    it('正在播的重复项恰好就是当前那张 → 仍然不动', () => {
      expect(follow(makeList('a', 'b', 'a'), 2, { playIndex: 2, playingId: 'a' })).toBe(FOLLOW_STAY)
    })
  })

  describe('游标越界（组件里会被夹紧，判定本身不假设它合法）', () => {
    it('游标为负 → 照常跟到正确下标', () => {
      expect(follow(makeList('a', 'b'), -1, { playIndex: 1, playingId: 'b' })).toBe(1)
    })

    it('游标超过列表长度 → 照常跟到正确下标', () => {
      expect(follow(makeList('a', 'b'), 99, { playIndex: 0, playingId: 'a' })).toBe(0)
    })
  })
})
