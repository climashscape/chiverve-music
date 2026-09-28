import { describe, expect, it } from 'vitest'
import { backfillItemsOf, diffSinger, latestCluster, newSongIdOf, type FetchedSong } from './diff'

/**
 * 关注动态的增量判据（票 05 的接缝①：纯函数，无网络无库）。
 *
 * 钉的是**外部行为**：给「本轮抓到的歌 + 上次基线」，得到「哪些条目、什么类型、怎么聚合、基线推到哪」。
 * 其中三条是实测逼出来的、最容易被改错的：
 *   1. **走到标记就停**（不是比时间新旧）——`order: 0` 实测并非普遍按发布时间倒序；
 *   2. **首次静默判的是「有没有基线行」**，不是「标记是不是 null」——否则一位此前没有作品的歌手
 *      发出第一首歌时会被永远静默掉；
 *   3. **同专辑 ≥2 首才合并成新专行**（专辑总曲目数拿不到：`GetAlbumList.totalNum` 实测恒为 0）。
 */

/** 造一条老式歌曲对象（形状对齐 `tx/utils/song.js` 的 `createSong` 输出） */
const buildFetched = (over: {
  mid: string
  name?: string
  albumMid?: string
  albumName?: string
  publishTime?: string
}): FetchedSong => ({
  song: {
    singer: '歌手甲',
    name: over.name ?? `歌_${over.mid}`,
    albumName: over.albumName ?? '专辑甲',
    albumId: over.albumMid ?? 'alb_1',
    albumMid: over.albumMid ?? 'alb_1',
    source: 'tx',
    interval: null,
    songId: 1,
    songType: 0,
    strMediaMid: over.mid,
    songmid: over.mid,
    img: '',
    types: [],
    _types: {},
    typeUrl: {},
  },
  publishTime: over.publishTime ?? '2026-09-01',
})

const singer = { mid: 'mid_a', name: '歌手甲' }
const baselineOf = (over: Partial<LX.FollowFeed.Baseline> = {}): LX.FollowFeed.Baseline => ({
  singerMid: 'mid_a',
  latestSongId: null,
  latestSongTime: null,
  updatedAt: 1,
  ...over,
})

describe('新式歌曲 id（条目去重键 / 基线标记）', () => {
  it('是 `tx_<songmid>`（与播放载荷的 id 同源，别另造一套）', () => {
    expect(newSongIdOf(buildFetched({ mid: 'abc123' }).song)).toBe('tx_abc123')
  })
})

describe('首次：`diffSinger` 自身不产条目（最新一簇由 check 侧走 backfillItemsOf）', () => {
  it('三条歌也不产条目，基线推到最新那条', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_new', publishTime: '2026-09-20' }),
      buildFetched({ mid: 's_old', publishTime: '2020-01-01' }),
    ], undefined)
    expect(result.items).toEqual([])
    expect(result.baseline).toEqual({ singerMid: 'mid_a', latestSongId: 'tx_s_new', latestSongTime: '2026-09-20' })
  })

  it('一位此前没有任何作品的歌手（基线行在、标记为 null）发出第一首歌时**必须报出来**', () => {
    const result = diffSinger(singer, [buildFetched({ mid: 's_first' })], baselineOf())
    expect(result.items).toHaveLength(1)
    expect(result.items[0].itemId).toBe('tx_s_first')
  })
})

describe('补齐：最新一簇（首次见到歌手 / 存量补档的入口，2026-09-28 用户拍板取代首次全静默）', () => {
  it('最新一簇 = 列表头开始、与第一首**同专辑的连续曲目**（一张专辑整批进列表的形态）', () => {
    const songs = [
      buildFetched({ mid: 's_a1', albumMid: 'alb_new', albumName: '新专', publishTime: '2026-09-20' }),
      buildFetched({ mid: 's_a2', albumMid: 'alb_new', albumName: '新专', publishTime: '2026-09-20' }),
      buildFetched({ mid: 's_b', albumMid: 'alb_old', albumName: '旧专', publishTime: '2026-08-01' }),
    ]
    expect(latestCluster(songs).map(item => item.song.songmid)).toEqual(['s_a1', 's_a2'])
  })

  it('到第二张专辑为止：头两首同专算一簇，后面的旧专曲目不进补齐（「最新」不是「最近十首」）', () => {
    const songs = [
      buildFetched({ mid: 's_a', albumMid: 'alb_x' }),
      buildFetched({ mid: 's_b', albumMid: 'alb_x' }),
      buildFetched({ mid: 's_c', albumMid: 'alb_y' }),
    ]
    expect(latestCluster(songs).map(item => item.song.songmid)).toEqual(['s_a', 's_b'])
  })

  it('没有专辑 mid 的头一首只取它自己（不聚合）', () => {
    const songs = [
      buildFetched({ mid: 's_a', albumMid: '' }),
      buildFetched({ mid: 's_b', albumMid: '' }),
    ]
    expect(latestCluster(songs).map(item => item.song.songmid)).toEqual(['s_a'])
    // 空列表安全
    expect(latestCluster([])).toEqual([])
  })

  it('backfillItemsOf：聚合规则与增量同源（同专 ≥2 首 → 一行新专），字段够页面渲染', () => {
    const items = backfillItemsOf({ mid: 'mid_a', name: '周杰伦' }, [
      buildFetched({ mid: 's_a1', albumMid: 'alb_x', albumName: '新专', publishTime: '2026-09-20' }),
      buildFetched({ mid: 's_a2', albumMid: 'alb_x', albumName: '新专', publishTime: '2026-09-19' }),
      buildFetched({ mid: 's_old', albumMid: 'alb_old' }),
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'album',
      itemId: 'alb_x',
      singerMid: 'mid_a',
      singerName: '周杰伦',
      trackCount: 2,
      publishTime: '2026-09-20',
    })
  })
})

describe('判新：从列表头部往下走，撞到基线标记就停', () => {
  it('只取标记之前的那几条，标记本身与它后面的都不算', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_a', albumMid: 'alb_a', publishTime: '2026-09-10' }),
      buildFetched({ mid: 's_b', albumMid: 'alb_b', publishTime: '2026-09-09' }),
      buildFetched({ mid: 's_marker', publishTime: '2026-09-08' }),
      buildFetched({ mid: 's_c', publishTime: '2026-09-07' }),
    ], baselineOf({ latestSongId: 'tx_s_marker', latestSongTime: '2026-09-08' }))

    expect(result.items.map(item => item.itemId).sort()).toEqual(['tx_s_a', 'tx_s_b'])
    expect(result.baseline.latestSongId).toBe('tx_s_a')
  })

  it('窗口里没有标记（应用关了很久）→ 窗口内全部算新，不静默', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_a', albumMid: 'alb_a' }),
      buildFetched({ mid: 's_b', albumMid: 'alb_b' }),
    ], baselineOf({ latestSongId: 'tx_s_ancient' }))
    expect(result.items).toHaveLength(2)
  })

  it('最新一首就是标记本身（没有新东西）→ 不产条目，基线保持', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_marker', publishTime: '2026-09-08' }),
    ], baselineOf({ latestSongId: 'tx_s_marker', latestSongTime: '2026-09-08' }))
    expect(result.items).toEqual([])
    expect(result.baseline.latestSongId).toBe('tx_s_marker')
  })

  it('本轮没取到歌（空列表）→ 不产条目，且**保住旧标记**（否则下次会把历史重报一遍）', () => {
    const result = diffSinger(singer, [], baselineOf({ latestSongId: 'tx_s_marker', latestSongTime: '2026-09-08' }))
    expect(result.items).toEqual([])
    expect(result.baseline).toEqual({ singerMid: 'mid_a', latestSongId: 'tx_s_marker', latestSongTime: '2026-09-08' })
  })
})

describe('新专聚合：同一张专辑本轮 ≥2 首合并成一行', () => {
  it('两条同专 → 一行新专（含本轮新歌数），收录曲不再单独占行', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_a', albumMid: 'alb_x', albumName: '新专辑', publishTime: '2026-09-20' }),
      buildFetched({ mid: 's_b', albumMid: 'alb_x', albumName: '新专辑', publishTime: '2026-09-19' }),
    ], baselineOf({ latestSongId: 'tx_s_marker' }))

    expect(result.items).toHaveLength(1)
    const album = result.items[0]
    expect(album.kind).toBe('album')
    expect(album.itemId).toBe('alb_x')
    expect(album.name).toBe('新专辑')
    expect(album.trackCount).toBe(2)
    // 专辑行的播放载荷 = 本簇内每首歌的数组（页面上展开即播，2026-09-28 用户拍板）
    const songs = JSON.parse(album.music!)
    expect(songs).toHaveLength(2)
    expect(songs.map((song: { id: string }) => song.id)).toEqual(['tx_s_a', 'tx_s_b'])
    // 日期取组里最新的一条
    expect(album.publishTime).toBe('2026-09-20')
  })

  it('同专只有一条 → 新歌行（含可播放载荷），不是新专行', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_a', albumMid: 'alb_x', albumName: '先行曲' }),
    ], baselineOf({ latestSongId: 'tx_s_marker' }))

    expect(result.items).toHaveLength(1)
    const song = result.items[0]
    expect(song.kind).toBe('song')
    expect(song.itemId).toBe('tx_s_a')
    expect(song.trackCount).toBe(null)
    const payload = JSON.parse(song.music!)
    expect(payload.id).toBe('tx_s_a')
    expect(payload.meta.albumMid).toBe('alb_x')
  })

  it('两批不同专辑各 ≥2 条 → 两行新专（互不干扰）', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_a1', albumMid: 'alb_x', albumName: '专 X' }),
      buildFetched({ mid: 's_a2', albumMid: 'alb_x', albumName: '专 X' }),
      buildFetched({ mid: 's_b1', albumMid: 'alb_y', albumName: '专 Y' }),
      buildFetched({ mid: 's_b2', albumMid: 'alb_y', albumName: '专 Y' }),
    ], baselineOf({ latestSongId: 'tx_s_marker' }))

    expect(result.items.map(item => [item.kind, item.itemId, item.trackCount]).sort((a, b) => String(a).localeCompare(String(b)))).toEqual([
      ['album', 'alb_x', 2],
      ['album', 'alb_y', 2],
    ])
  })

  it('专辑与单曲混在一轮里 → 各按各的规则出行', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_a1', albumMid: 'alb_x', albumName: '专 X' }),
      buildFetched({ mid: 's_a2', albumMid: 'alb_x', albumName: '专 X' }),
      buildFetched({ mid: 's_single', albumMid: 'alb_z', albumName: '单曲专辑' }),
    ], baselineOf({ latestSongId: 'tx_s_marker' }))

    expect(result.items.map(item => item.kind).sort()).toEqual(['album', 'song'])
    expect(result.items.find(item => item.kind == 'song')!.itemId).toBe('tx_s_single')
    // 一行三首的专辑不该把单曲也吸进去
    expect(result.items.find(item => item.kind == 'album')!.trackCount).toBe(2)
  })

  it('没有专辑 mid 的条目当单曲处理（不聚合、不丢）', () => {
    const result = diffSinger(singer, [
      buildFetched({ mid: 's_a', albumMid: '' }),
      buildFetched({ mid: 's_b', albumMid: '' }),
    ], baselineOf({ latestSongId: 'tx_s_marker' }))

    expect(result.items).toHaveLength(2)
    expect(result.items.every(item => item.kind == 'song')).toBe(true)
  })
})

describe('条目的载荷与字段：够页面直接渲染与播放', () => {
  it('歌手名与发布时间跟着条目走（接口条目里只有 mid，名字来自关注列表）', () => {
    const result = diffSinger({ mid: 'mid_a', name: '周杰伦' }, [
      buildFetched({ mid: 's_a', publishTime: '2026-09-20', name: '新歌名', albumMid: 'alb_x', albumName: '专 X' }),
    ], baselineOf({ latestSongId: 'tx_s_marker' }))

    expect(result.items[0]).toMatchObject({
      singerMid: 'mid_a',
      singerName: '周杰伦',
      name: '新歌名',
      albumMid: 'alb_x',
      albumName: '专 X',
      publishTime: '2026-09-20',
    })
  })

  it('发布时间缺失时留空串（库里那一列非空；排序由 SQL 处理）', () => {
    const result = diffSinger(singer, [
      { song: buildFetched({ mid: 's_a' }).song, publishTime: '' },
    ], baselineOf({ latestSongId: 'tx_s_marker' }))
    expect(result.items[0].publishTime).toBe('')
  })
})
