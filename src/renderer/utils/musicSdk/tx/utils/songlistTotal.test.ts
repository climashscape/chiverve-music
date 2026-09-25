import { describe, expect, it } from 'vitest'
import { pickSonglistTotal } from './songlistTotal'

/**
 * 歌单类响应「总数」解析的钉子（ui-polish-followups 票 17 接缝 1）。
 *
 * **钉住的契约**：总数只能取 `total_song_num`；`songlist_size` 是**本页返回条数**
 * （参考实现 `QQMusicApi/models/songlist.py:55,63` 的取值口径），只在 `total_song_num`
 * 缺失时兜底（至少是个下界）。`AGENTS.md` §7 坑 13 咬过人：取错会让「我喜欢」永远显示成
 * 每页条数、歌单分页永远停在第 1 页。两个调用方（`tx/user.js` 的 `getFavSong`、
 * `tx/songList.js` 的 `getListDetailByCgi`）的兜底值不同，所以兜底值是入参。
 *
 * **期望值来源**：
 *   1. 928 取自真机读数（「我喜欢」`total_song_num=928`，见 `tx/user.test.ts` 头部记录）；
 *      30 / 50 是两处调用的每页条数（`user.js` 的 `PAGE_SIZE=30`、旧注释里的 50）；
 *   2. 「`??` 只认 null/undefined、0 与空串是有效值」「数值串会被 Number 收下」是 JS 语义，
 *      不是从被测实现反推的。
 */

describe('tx 歌单类响应的总数解析（pickSonglistTotal）', () => {
  it('只读 total_song_num：两个字段同时在场时不能取成本页条数', () => {
    expect(pickSonglistTotal({ total_song_num: 928, songlist_size: 30 })).toBe(928)
    // 反向固定住「谁是总数」：本页只有 30 条时 songlist_size 就是 30，不能拿它当总数
    expect(pickSonglistTotal({ total_song_num: 928, songlist_size: 30 })).not.toBe(30)
  })

  it('total_song_num 是 0 时照用 0（空歌单是有效总数，不能被当成「没给」去取本页条数）', () => {
    expect(pickSonglistTotal({ total_song_num: 0, songlist_size: 30 })).toBe(0)
  })

  it('total_song_num 缺失（含 null）→ 回退 songlist_size（本页条数，至少是下界）', () => {
    expect(pickSonglistTotal({ songlist_size: 30 })).toBe(30)
    expect(pickSonglistTotal({ total_song_num: null, songlist_size: 30 })).toBe(30)
  })

  it('两个字段都缺（响应形状变了 / data 为 undefined）→ 用调用方给的兜底值', () => {
    expect(pickSonglistTotal({}, 0)).toBe(0)
    // `getListDetailByCgi` 传的是本页条数
    expect(pickSonglistTotal({}, 30)).toBe(30)
    expect(pickSonglistTotal(undefined, 7)).toBe(7)
    // 默认兜底 0（`getFavSong` 那一侧）
    expect(pickSonglistTotal({})).toBe(0)
  })

  it('数值串照收（服务端有时给字符串形态）', () => {
    expect(pickSonglistTotal({ total_song_num: '928' })).toBe(928)
  })
})
