import { markRawList, reactive, ref } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'
import { player, openMv as openMvPlayer, closePlayer as closePlayerState, retryUrl as retryMvUrl, type MvInfo } from '@renderer/store/mv'

/**
 * 歌手页（M6）取数：歌手信息 / 歌曲 / 专辑 / MV / 相似歌手。
 *
 * 这个文件里的每个决定都是被下面五条约束逼出来的，改之前先读：
 *
 *   1. 🔴 **歌曲必须过 `toNewMusicInfo`**：数据层（`tx/singer.js` 的 `filterSongList`）
 *      给的是 `createSong` 出来的老式平铺对象，而 UI 侧是「平台字段进 meta」的新式模型
 *      （AGENTS §2.10）。`material-online-list` 会直接读 `item.meta._qualitys`，
 *      漏了转换不是显示难看，是渲染期抛错（同 `views/Album/useAlbum.ts` 第 1 条）。
 *
 *   2. 🔴 **歌曲列表只做原地改（splice/push），不整体替换数组**：`usePlay` 在 setup 时就把
 *      `props.list` 的数组引用存下来了（`components/material/OnlineList/usePlay.ts:22`），
 *      换成新数组会让双击播放读到旧数组。
 *
 *   3. **分页**：数据层的 `begin` 是**原始偏移量**，公式为 `begin = (page - 1) * limit`
 *      （见 `tx/singer.js` 的注释——那里曾写成 `page * limit`，会让 page ≥ 2 跳掉一页，
 *      已修）。这里按 `offset / CHUNK + 1` 换算页码即可。
 *      `GetSingerSongList` 的 `num` 服务端上限实测是 100。
 *
 *   4. **每个区块独立 try/catch**：五个接口互不依赖，一个挂掉不该让整页白屏（同发现页）。
 *      失败只落该区块的 noItemLabel 文案（三段式，§2.11）；「加载更多」失败只提示不清列表。
 *
 *   5. **MV 播放复用乐馆 MV 的弹窗与播放器**（`store/mv` 的 `player` / `openMv`，
 *      组件是 `components/common/MvPlayerModal.vue`）：取详情、取流、直链过期重取、系统播放器
 *      打开这些逻辑都已经在那儿了，歌手页只需要把列表项映射成 `MvInfo` 再调 `openMv`。
 *      ⚠️ 歌手 MV 接口不给歌手名（`GetSingerMvList` 只回 title/picurl/duration…），
 *      所以映射时用**歌手页自己的歌手名**补上这个字段。
 */

const t = (key: string) => window.i18n.t(key as any)

/** 每块条数（= 分页粒度）。取 50 让「加载更多」的粒度不至于太粗。 */
const CHUNK = 50
/** MV 每页条数（MV 接口的 start/count 是正常偏移语义，不需要绕行）。 */
const MV_PAGE_SIZE = 20
/** 相似歌手：服务端不接受分页，只接受条数。 */
const SIMILAR_NUM = 12

/** 把「想取的偏移」翻译成数据层的 page/limit（见文件头第 3 条）。 */
const chunkParams = (offset: number) => ({ page: Math.floor(offset / CHUNK) + 1, limit: CHUNK })

export interface SingerInfo {
  id: string
  mid: string
  name: string
  avatar: string
  desc: string
  musicCount: number
  albumCount: number
}

export interface SingerAlbum {
  id: string
  mid: string
  name: string
  img: string
}

export interface SimilarSinger {
  id: string
  name: string
  img: string
}

export interface SingerMv {
  id: string
  vid: string
  name: string
  img: string
  interval: string | null
  playCount: number
  pubDate: string | null
}

interface Block<T> {
  list: T[]
  /** 服务端报的总数（歌手歌曲数可能上千，只用来判断还有没有下一页） */
  total: number
  /** 下一个待取偏移。**不能用 `list.length` 推**：绕行方案要求它始终是 CHUNK 的整数倍 */
  offset: number
  noItemLabel: string
  isLoading: boolean
  hasMore: boolean
  /** 「加载更多」失败：只提示、不清掉已加载内容 */
  moreError: string
}

const createBlock = <T>(): Block<T> => ({
  list: [],
  total: 0,
  offset: 0,
  noItemLabel: '',
  isLoading: false,
  hasMore: false,
  moreError: '',
})

const emptyDetail = (): SingerInfo => ({
  id: '',
  mid: '',
  name: '',
  avatar: '',
  desc: '',
  musicCount: 0,
  albumCount: 0,
})

// ---------- 状态 ----------
// 状态放模块级（不是组合函数的局部变量）：路由页没有 keep-alive，切走再回来组件会重建，
// 状态留在模块里才能「切回来立刻显示上次的内容」。

const detail = reactive<SingerInfo>(emptyDetail())
/** 头部区块的文案（加载中/失败/不存在）；有值时页面不渲染五个区块，避免同一句话显示多遍。 */
const headerLabel = ref('')

const songs = reactive<Block<LX.Music.MusicInfoOnline> & { page: number, limit: number }>({
  ...createBlock<LX.Music.MusicInfoOnline>(),
  // material-online-list 要求 page/limit/total 三个必填项。limit 与 total 都跟着「已加载条数」走，
  // 让组件底部的分页器整体不渲染（maxPage = 1）——真正的翻页由页面的「加载更多」按钮驱动，
  // 因为数据层表达不出统一的页大小（文件头第 3 条）。
  page: 1,
  limit: 1,
})
const albums = reactive<Block<SingerAlbum>>(createBlock<SingerAlbum>())
const mvs = reactive<Block<SingerMv> & { page: number }>({ ...createBlock<SingerMv>(), page: 1 })
const similar = reactive<{ list: SimilarSinger[], noItemLabel: string }>({ list: [], noItemLabel: '' })

let currentMid = ''
let infoKey = ''
let songKey = ''
let albumKey = ''
let mvKey = ''
let similarKey = ''

/**
 * 失败文案。数据层不导出错误码，只能认 message（与 `views/Album/useAlbum.ts` 同一套判据）。
 * 歌手那几个端点是匿名可访问的，正常不会出现登录问题，这里只做兜底。
 */
const errorLabel = (err: any) => {
  if (err?.message === 'QQ 音乐未登录') return t('user_center__need_login')
  return t('list__load_failed')
}

/** 老式平铺对象 → 新式模型 + 去重 + markRaw（列表不进深度代理，§2.10）。 */
const toOnlineSongs = (list: any[]): LX.Music.MusicInfoOnline[] => {
  const next = deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[])
  return markRawList(next)
}

/** 成功但空 → 空态文案；有数据 → 清掉文案（三段式的第三段）。 */
const finishLabel = (block: { noItemLabel: string }, list: unknown[]) => {
  block.noItemLabel = list.length ? '' : t('no_item')
}

const loadInfo = async(mid: string) => {
  const key = `singer_info__${mid}`
  infoKey = key
  headerLabel.value = t('list__loading')
  try {
    const res = await music.tx.singer.getInfo(mid)
    if (infoKey !== key) return
    const info = res?.info ?? {}
    Object.assign(detail, emptyDetail(), {
      id: String(res?.id ?? mid),
      mid,
      name: info.name ?? '',
      avatar: info.avatar ?? '',
      desc: info.desc ?? '',
      musicCount: Number(res?.count?.music ?? 0),
      albumCount: Number(res?.count?.album ?? 0),
    })
    headerLabel.value = ''
  } catch (err: any) {
    if (infoKey !== key) return
    console.log('[singer] info', err)
    Object.assign(detail, emptyDetail())
    headerLabel.value = errorLabel(err)
  }
}

/** 歌曲。`offset` 为 0 是首屏（替换），否则是「加载更多」（追加）。 */
const loadSongs = async(mid: string, offset = 0) => {
  const key = `singer_songs__${mid}__${offset}`
  songKey = key
  songs.isLoading = true
  songs.moreError = ''
  if (offset === 0) songs.noItemLabel = t('list__loading')
  const { page, limit } = chunkParams(offset)
  try {
    const res = await music.tx.singer.getSongList(mid, page, limit)
    if (songKey !== key) return
    const list = toOnlineSongs(res?.list ?? [])
    if (offset === 0) songs.list.splice(0, songs.list.length, ...list)
    else songs.list.push(...list)
    songs.total = Number(res?.total ?? songs.list.length)
    songs.offset = offset + list.length
    songs.page = 1
    songs.limit = songs.list.length || 1
    // 「这一块拿满了」且「还没到服务端报的总数」才算还有下一页
    songs.hasMore = list.length >= limit && songs.list.length < songs.total
    finishLabel(songs, songs.list)
  } catch (err: any) {
    if (songKey !== key) return
    console.log('[singer] songs', err)
    if (offset > 0) songs.moreError = errorLabel(err)
    else {
      songs.list.splice(0, songs.list.length)
      songs.total = 0
      songs.offset = 0
      songs.limit = 1
      songs.hasMore = false
      songs.noItemLabel = errorLabel(err)
    }
  } finally {
    songs.isLoading = false
  }
}

/**
 * 专辑。分页绕行与歌曲同一套（`getAlbumList` 是同一个 bug），偏移粒度同样是 CHUNK。
 * `num` 在专辑这里服务端**没有** 100 的上限（实测 num=200 能收回 78 张），首屏取 100 是安全的。
 */
const loadAlbums = async(mid: string, offset = 0) => {
  const key = `singer_albums__${mid}__${offset}`
  albumKey = key
  albums.isLoading = true
  albums.moreError = ''
  if (offset === 0) albums.noItemLabel = t('list__loading')
  const { page, limit } = chunkParams(offset)
  try {
    const res = await music.tx.singer.getAlbumList(mid, page, limit)
    if (albumKey !== key) return
    const list = markRawList((res?.list ?? []).map((item: any) => ({
      id: String(item.id ?? ''),
      mid: item.mid ?? '',
      name: item.info?.name ?? '',
      img: item.info?.img ?? '',
    })) as SingerAlbum[])
    if (offset === 0) albums.list.splice(0, albums.list.length, ...list)
    else albums.list.push(...list)
    albums.total = Number(res?.total ?? albums.list.length)
    albums.offset = offset + list.length
    albums.hasMore = list.length >= limit && albums.list.length < albums.total
    finishLabel(albums, albums.list)
  } catch (err: any) {
    if (albumKey !== key) return
    console.log('[singer] albums', err)
    if (offset > 0) albums.moreError = errorLabel(err)
    else {
      albums.list.splice(0, albums.list.length)
      albums.total = 0
      albums.offset = 0
      albums.hasMore = false
      albums.noItemLabel = errorLabel(err)
    }
  } finally {
    albums.isLoading = false
  }
}

/** 歌手 MV。这条接口的 start/count 是正常偏移语义，按普通分页走。 */
const loadMvs = async(mid: string, page = 1, more = false) => {
  const key = `singer_mv__${mid}__${page}`
  mvKey = key
  mvs.isLoading = true
  mvs.moreError = ''
  if (!more) mvs.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.singer.getMvList(mid, page, MV_PAGE_SIZE)
    if (mvKey !== key) return
    const list = markRawList((res?.list ?? []).map((item: any) => ({
      id: String(item.id ?? ''),
      vid: item.vid ?? '',
      name: item.name ?? '',
      img: item.img ?? '',
      interval: item.interval ?? null,
      playCount: Number(item.playCount ?? 0),
      pubDate: item.pubDate ?? null,
    })) as SingerMv[])
    if (more) mvs.list.push(...list)
    else mvs.list.splice(0, mvs.list.length, ...list)
    mvs.page = page
    // ⚠️ 这里的 total 实测是个很大的数（周杰伦 10426，含翻唱/现场），不能拿来算页码；
    // 按「本页是否拿满」判断有没有下一页 —— 与 MV 页同样处理（views/Mv/useMv.ts 文件头第 2 条）
    mvs.hasMore = list.length >= MV_PAGE_SIZE
    finishLabel(mvs, mvs.list)
  } catch (err: any) {
    if (mvKey !== key) return
    console.log('[singer] mvs', err)
    if (more) mvs.moreError = errorLabel(err)
    else {
      mvs.list.splice(0, mvs.list.length)
      mvs.page = 1
      mvs.hasMore = false
      mvs.noItemLabel = errorLabel(err)
    }
  } finally {
    mvs.isLoading = false
  }
}

/** 相似歌手：一次取完（服务端没有分页参数）。 */
const loadSimilar = async(mid: string) => {
  const key = `singer_similar__${mid}`
  similarKey = key
  similar.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.singer.getSimilarSingerList(mid, SIMILAR_NUM)
    if (similarKey !== key) return
    const list = markRawList((res?.list ?? []).map((item: any) => ({
      id: String(item.id ?? ''),
      name: item.name ?? '',
      img: item.img ?? '',
    })) as SimilarSinger[])
    similar.list.splice(0, similar.list.length, ...list)
    finishLabel(similar, similar.list)
  } catch (err: any) {
    if (similarKey !== key) return
    console.log('[singer] similar', err)
    similar.list.splice(0, similar.list.length)
    similar.noItemLabel = errorLabel(err)
  }
}

/** 进入/切换歌手：五个区块并发（各自 try/catch，失败不影响别人）。 */
const initSinger = async(value: unknown) => {
  const mid = String(value ?? '').trim()
  currentMid = mid
  if (!mid) {
    // 路由没带 mid：不发请求，直接给「不存在」文案（数据层对空 mid 会抛错）
    Object.assign(detail, emptyDetail())
    songs.list.splice(0, songs.list.length)
    songs.offset = 0
    songs.total = 0
    songs.limit = 1
    songs.hasMore = false
    albums.list.splice(0, albums.list.length)
    albums.offset = 0
    albums.total = 0
    albums.hasMore = false
    mvs.list.splice(0, mvs.list.length)
    mvs.page = 1
    mvs.hasMore = false
    similar.list.splice(0, similar.list.length)
    headerLabel.value = t('singer__not_found')
    songs.noItemLabel = t('singer__not_found')
    albums.noItemLabel = t('singer__not_found')
    mvs.noItemLabel = t('singer__not_found')
    similar.noItemLabel = t('singer__not_found')
    return
  }
  await Promise.all([
    loadInfo(mid),
    loadSongs(mid, 0),
    loadAlbums(mid, 0),
    loadMvs(mid, 1, false),
    loadSimilar(mid),
  ])
}

const loadMoreSongs = () => {
  if (!currentMid || songs.isLoading) return
  void loadSongs(currentMid, songs.offset)
}

const loadMoreAlbums = () => {
  if (!currentMid || albums.isLoading) return
  void loadAlbums(currentMid, albums.offset)
}

const loadMoreMvs = () => {
  if (!currentMid || mvs.isLoading) return
  void loadMvs(currentMid, mvs.page + 1, true)
}

export default () => {
  /**
   * 打开歌手 MV：把列表项映射成 MV 的 `MvInfo` 再交给乐馆那套播放逻辑。
   * 接口缺的字段按缺省补：`singer` 用歌手页自己的名字（MV 接口不回歌手名），
   * `subName` / `duration` 列表里没有（弹窗只展示 interval / playCount / pubDate，不受影响）。
   */
  const openMv = (item: SingerMv) => {
    const info: MvInfo = {
      id: item.id,
      vid: item.vid,
      name: item.name,
      subName: '',
      img: item.img,
      singer: detail.name,
      interval: item.interval,
      duration: 0,
      playCount: item.playCount,
      pubDate: item.pubDate ?? undefined,
    }
    openMvPlayer(info)
  }

  /** 关掉弹窗时清掉播放地址停止播放（与乐馆 MV 的 closePlayer 是同一份逻辑）。 */
  const closeMv = () => { closePlayerState() }

  return {
    detail,
    headerLabel,
    songs,
    albums,
    mvs,
    similar,
    mvPlayer: player,
    initSinger,
    loadMoreSongs,
    loadMoreAlbums,
    loadMoreMvs,
    openMv,
    closeMv,
    retryMvUrl,
  }
}
