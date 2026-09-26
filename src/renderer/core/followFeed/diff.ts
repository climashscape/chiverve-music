import { toNewMusicInfo } from '@common/utils/tools'

/**
 * 关注动态的**纯增量计算**：给一位歌手的「本轮抓到的歌」与「他上次的基线」，算出新条目与新基线。
 *
 * 这里没有网络、没有数据库、没有 `Date.now()`——编排在 `check.ts`，存储在主进程的
 * `follow_feed` 域。分开的理由只有一个：判据是这件事里最容易错、也最需要被钉住的部分
 * （接缝划分见 `.scratch/follow-feed/spec.md` 的 Testing Decisions）。
 */

/** 数据层（`tx/singer.getLatestSongs`）交来的形状：老式歌曲对象 + 发布时间（`time_public`，可能为空串） */
export interface FetchedSong {
  song: any
  publishTime: string
}

/** 一轮里某位歌手的扫描结果；`ok: false` = 这一块请求失败（基线**不许**推进） */
export interface SingerFetch {
  mid: string
  ok: boolean
  songs: FetchedSong[]
}

export interface SingerDiff {
  /** 本轮要落库的条目（可能为空） */
  items: LX.FollowFeed.ItemInput[]
  /** 这位歌手的新基线（调用方只在 `ok` 时写库） */
  baseline: LX.FollowFeed.BaselineInput
}

/** 新式歌曲 id（`tx_<songmid>`）——条目去重键、播放载荷 id、基线标记都用它 */
export const newSongIdOf = (song: any): string => toNewMusicInfo(song).id

/** 一首歌 → 新歌行 */
const songItem = (singer: { mid: string, name: string }, fetched: FetchedSong): LX.FollowFeed.ItemInput => {
  const newSong = toNewMusicInfo(fetched.song)
  return {
    kind: 'song',
    singerMid: singer.mid,
    singerName: singer.name,
    itemId: newSong.id,
    name: String(newSong.name ?? ''),
    albumMid: fetched.song.albumMid ? String(fetched.song.albumMid) : null,
    albumName: fetched.song.albumName ? String(fetched.song.albumName) : null,
    trackCount: null,
    publishTime: fetched.publishTime,
    // 播放载荷：时间线里的歌可能早已不在接口的最新窗口里，不存它就得为了播放再查一次
    music: JSON.stringify(newSong),
  }
}

/**
 * 一位歌手的增量。
 *
 * ## 判新 = 「从列表头部往下走，遇到已知标记就停」
 *
 * 不是「比基线的时间更新」——2026-09-26 的抽样复核（工单 01）实测 `order: 0` **并非普遍**
 * 按发布时间倒序：歌曲侧 12 位歌手里有 1 位出现「2021 年的曲目排在 2025 年的前面」
 * （老曲重发／被合辑收编时，`time_public` 是**原始**发行日期，而排序键更接近**登记顺序**）。
 * 按时间比会在那种页面上判错；按「走到上次已知的那首为止」则与排序键无关，稳。
 *
 * 代价（诚实登记）：基线标记之后的条目永远不会被补报（`num: 1` 的扫描窗口之外也一样），
 * 所以「窗口里没遇到标记」时按「窗口内全是新的」处理——长期没开应用时宁可多报几条。
 *
 * ## 首次静默
 *
 * 判据是**有没有基线行**（`baseline == null`），不是「标记是不是 null」：
 * 一位此前没有任何作品的歌手（基线行存在、标记为 null）在发出第一首歌时**必须**报出来，
 * 否则他会被永远当成「首次」而静默掉。
 */
export const diffSinger = (
  singer: { mid: string, name: string },
  songs: FetchedSong[],
  baseline: LX.FollowFeed.Baseline | undefined,
): SingerDiff => {
  const marker = baseline?.latestSongId ?? null

  const fresh: FetchedSong[] = []
  for (const item of songs) {
    if (marker != null && newSongIdOf(item.song) === marker) break
    fresh.push(item)
  }

  const newest = songs[0]
  const next: LX.FollowFeed.BaselineInput = {
    singerMid: singer.mid,
    // 本轮没取到歌时**保住旧标记**（否则下次会把历史当新的重报一遍）
    latestSongId: newest ? newSongIdOf(newest.song) : marker,
    latestSongTime: newest ? (newest.publishTime || null) : (baseline?.latestSongTime ?? null),
  }

  if (baseline == null) return { items: [], baseline: next }

  const items: LX.FollowFeed.ItemInput[] = []
  // 同一张专辑本轮出现 ≥2 首 → 合并成**一行新专**（收录曲不单独占行，用户拍板的形态）
  const albums = new Map<string, FetchedSong[]>()
  for (const item of fresh) {
    const albumMid = String(item.song.albumMid ?? '')
    if (!albumMid) {
      // 没有专辑 mid 的（罕见）当单曲处理，不聚合
      items.push(songItem(singer, item))
      continue
    }
    const group = albums.get(albumMid)
    if (group) group.push(item)
    else albums.set(albumMid, [item])
  }
  for (const [albumMid, group] of albums) {
    if (group.length < 2) {
      items.push(songItem(singer, group[0]))
      continue
    }
    items.push({
      kind: 'album',
      singerMid: singer.mid,
      singerName: singer.name,
      itemId: albumMid,
      name: String(group[0].song.albumName ?? ''),
      albumMid,
      albumName: group[0].song.albumName ? String(group[0].song.albumName) : null,
      // 「曲目数」用**本轮该专辑的新歌数**，不是专辑的总曲目数
      // （`GetAlbumList` 的 `totalNum` 实测恒为 0，见 spec；且这正是用户拍板的「≥2 首算新专」）
      trackCount: group.length,
      // 发布日期取组里最新的一条：专辑行的日期应当是「这批新歌里最新的那天」
      publishTime: group.reduce((max, item) => (item.publishTime > max ? item.publishTime : max), ''),
      // 专辑行没有可播放载荷（点它是进专辑页）
      music: null,
    })
  }

  return { items, baseline: next }
}
