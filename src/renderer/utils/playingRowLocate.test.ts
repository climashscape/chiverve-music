import { describe, expect, it, vi } from 'vitest'
import { LIST_IDS } from '@common/constants'
import {
  canLocatePlayingRow,
  findJumpableListId,
  findPlayingRowIndex,
  getCenteredScrollTop,
  hasPlayingRowLocator,
  locatePlayingRow,
  registerPlayingRowLocator,
} from './playingRowLocate'

/**
 * 「定位到正在播放」的判定与算法（ui-polish-3 工单 08）。
 *
 * 只测行为：哪一行在播、居中该滚到哪、按钮点下去找谁。不碰 Vue 与 DOM（容器几何都是入参），
 * 所以这些用例守住的是「算法在边界上算得对」，不是「列表组件接得对」。
 */

/** 只需要 id 就能表达「哪首歌」，其余字段与本主题无关 */
const music = (id: string) => ({ id }) as unknown as LX.Music.MusicInfo
const list = (...ids: string[]) => ids.map(music)

describe('findPlayingRowIndex', () => {
  it('队列身份相符且那一行就是这首歌 → 返回该行号', () => {
    expect(findPlayingRowIndex({
      list: list('a', 'b', 'c'),
      isPlayingList: true,
      playIndex: 1,
      playingMusicId: 'b',
    })).toBe(1)
  })

  it('这首歌不在本列表里 → -1（按钮只能跳转到别的列表，不能乱滚）', () => {
    expect(findPlayingRowIndex({
      list: list('a', 'b', 'c'),
      isPlayingList: true,
      playIndex: 0,
      playingMusicId: 'z',
    })).toBe(-1)
  })

  it('列表为空 → -1', () => {
    expect(findPlayingRowIndex({
      list: [],
      isPlayingList: true,
      playIndex: 0,
      playingMusicId: 'a',
    })).toBe(-1)
  })

  it('本列表不是当前播放队列 → -1（列表里有同一首歌也不算）', () => {
    expect(findPlayingRowIndex({
      list: list('a', 'b'),
      isPlayingList: false,
      playIndex: 0,
      playingMusicId: 'a',
    })).toBe(-1)
  })

  it('没有正在播放的歌（队列里没有歌）→ -1', () => {
    const args = { list: list('a'), isPlayingList: true, playIndex: -1 }
    expect(findPlayingRowIndex({ ...args, playingMusicId: null })).toBe(-1)
    expect(findPlayingRowIndex({ ...args, playingMusicId: undefined })).toBe(-1)
  })

  it('播放器的位置号失效但歌还在队列的列表里 → 按 id 找回来（不因为索引烂掉就丢了这一行）', () => {
    expect(findPlayingRowIndex({
      list: list('a', 'b'),
      isPlayingList: true,
      playIndex: -1,
      playingMusicId: 'b',
    })).toBe(1)
  })

  it('身份相同但内容不同（共用 online_list__temp 的列表）→ 按 id 找回真实行号', () => {
    // 搜索页与收藏页共用同一个队列身份，playIndex=1 指的是另一个列表的第 2 行；
    // 这首歌在本列表里落在第 3 行——不能拿 playIndex 去高亮/滚动别的行
    expect(findPlayingRowIndex({
      list: list('x', 'y', 'b', 'z'),
      isPlayingList: true,
      playIndex: 1,
      playingMusicId: 'b',
    })).toBe(2)
  })

  it('playIndex 越界（播放之后列表被改短）→ 按 id 兜底；找不到仍是 -1', () => {
    expect(findPlayingRowIndex({
      list: list('a', 'b'),
      isPlayingList: true,
      playIndex: 9,
      playingMusicId: 'b',
    })).toBe(1)
    expect(findPlayingRowIndex({
      list: list('a', 'c'),
      isPlayingList: true,
      playIndex: 9,
      playingMusicId: 'b',
    })).toBe(-1)
  })
})

describe('getCenteredScrollTop', () => {
  it('中间的行 → 行中点落在容器中线上', () => {
    // 行高 50、容器高 400 → 第 10 行顶缘 500，要让它中点(525)落在容器中线 200 上 → 滚到 325
    expect(getCenteredScrollTop({ index: 10, itemHeight: 50, containerHeight: 400, contentHeight: 50 * 40 }))
      .toBe(10 * 50 - (400 - 50) / 2)
  })

  it('第一行 → 0（不返回负数）', () => {
    expect(getCenteredScrollTop({ index: 0, itemHeight: 50, containerHeight: 400, contentHeight: 50 * 40 })).toBe(0)
  })

  it('最后一行 → 夹到最大可滚位置（滚到底，不出越界值）', () => {
    const args = { itemHeight: 50, containerHeight: 400, contentHeight: 50 * 40 }
    const max = 50 * 40 - 400
    expect(getCenteredScrollTop({ ...args, index: 39 })).toBe(max)
    // 倒数第二行就已经顶到上限：39 行内容下方只有 1 行 + 一屏，居中的余量不够
    expect(getCenteredScrollTop({ ...args, index: 38 })).toBe(max)
  })

  it('行数不足一屏 → 0（没得滚）', () => {
    expect(getCenteredScrollTop({ index: 2, itemHeight: 50, containerHeight: 400, contentHeight: 3 * 50 })).toBe(0)
  })

  it('结果取整（半像素滚动会让表格文字发虚）', () => {
    const top = getCenteredScrollTop({ index: 10, itemHeight: 45, containerHeight: 400, contentHeight: 45 * 40 })
    expect(Number.isInteger(top)).toBe(true)
    expect(top).toBe(Math.round(10 * 45 - (400 - 45) / 2))
  })
})

describe('canLocatePlayingRow', () => {
  it('有正在播放的歌 → 可用', () => {
    expect(canLocatePlayingRow(0, music('a'))).toBe(true)
  })

  it('没在播（空队列 / 从没播过）→ 不可用', () => {
    expect(canLocatePlayingRow(-1, music('a'))).toBe(false)
    expect(canLocatePlayingRow(0, null)).toBe(false)
  })
})

describe('findJumpableListId', () => {
  it('播的是本地自建列表 → 返回它的 id（可以跳到 /list?id=…）', () => {
    expect(findJumpableListId('list_1', ['list_1', 'list_2'])).toBe('list_1')
  })

  it('在线队列（播放器里的列表 id 恒为 temp）→ 空串，没有可跳的列表页', () => {
    expect(findJumpableListId(LIST_IDS.TEMP, ['list_1'])).toBe('')
  })

  it('没有任何正在播放的列表 / 该 id 不是本地列表（如下载列表）→ 空串', () => {
    expect(findJumpableListId(null, ['list_1'])).toBe('')
    expect(findJumpableListId(LIST_IDS.DOWNLOAD, ['list_1'])).toBe('')
    expect(findJumpableListId('album__0039', ['list_1'])).toBe('')
  })
})

describe('定位落点登记', () => {
  it('登记后就能被点到，返回 true', () => {
    const locate = vi.fn()
    const unregister = registerPlayingRowLocator({ canLocate: () => true, locate })
    expect(locatePlayingRow()).toBe(true)
    expect(locate).toHaveBeenCalledTimes(1)
    unregister()
  })

  it('没人登记 / 登记的都接不下 → false（调用方据此改走跳转）', () => {
    expect(locatePlayingRow()).toBe(false)

    const locate = vi.fn()
    const unregister = registerPlayingRowLocator({ canLocate: () => false, locate })
    expect(locatePlayingRow()).toBe(false)
    expect(locate).not.toHaveBeenCalled()
    unregister()
  })

  it('注销后不再参与（路由页切走即失效）', () => {
    const locate = vi.fn()
    const unregister = registerPlayingRowLocator({ canLocate: () => true, locate })
    unregister()
    expect(locatePlayingRow()).toBe(false)
    expect(locate).not.toHaveBeenCalled()
  })

  it('多份登记时用最近登记的那一份；它接不下才回落到前一份', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerPlayingRowLocator({ canLocate: () => true, locate: first })
    const unregisterSecond = registerPlayingRowLocator({ canLocate: () => true, locate: second })

    expect(locatePlayingRow()).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()

    // 后一份（被 v-show 藏起来的那份）接不下时，前一份顶上
    const canLocateSecond = vi.fn(() => false)
    unregisterSecond()
    const unregisterThird = registerPlayingRowLocator({ canLocate: canLocateSecond, locate: vi.fn() })
    expect(locatePlayingRow()).toBe(true)
    expect(first).toHaveBeenCalledTimes(1)
    unregisterThird()
    unregisterFirst()
  })
})

describe('hasPlayingRowLocator', () => {
  it('没登记 / 登记的都接不下 → false；登记之后 → true（播放栏的按钮靠它置灰）', () => {
    expect(hasPlayingRowLocator()).toBe(false)

    const unregister = registerPlayingRowLocator({ canLocate: () => false, locate: vi.fn() })
    expect(hasPlayingRowLocator()).toBe(false)

    const unregisterUsable = registerPlayingRowLocator({ canLocate: () => true, locate: vi.fn() })
    expect(hasPlayingRowLocator()).toBe(true)

    unregisterUsable()
    expect(hasPlayingRowLocator()).toBe(false)
    unregister()
  })
})
