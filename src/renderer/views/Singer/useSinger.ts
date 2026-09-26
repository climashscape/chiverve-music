import { markRawList, reactive, ref } from '@common/utils/vueTools'
import { getPageSize } from '@common/settings/pageSize'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'
import { appSetting } from '@renderer/store/setting'
import { player, openMv as openMvPlayer, closePlayer as closePlayerState, retryUrl as retryMvUrl, type MvInfo } from '@renderer/store/mv'
import { shouldFetch } from './tabs'

/**
 * 歌手页（M6）取数：歌手信息 / 歌曲 / 专辑 / MV / 相似歌手。
 *
 * 这个文件里的每个决定都是被下面七条约束逼出来的，改之前先读：
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
 *      已修）。这里按 `offset / chunk + 1` 换算页码即可（`chunk` = 本次列表会话的粒度，见 `Block.chunk`）。
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
 *
 *   6. **四个区块按 tab 懒加载（工单 02）**：进页只取「歌手信息 + 当前 tab」两块，其余 tab
 *      首次切入时才取——入口是本文件的 `ensureSongsTab` / `ensureAlbumsTab` / `ensureMvsTab` /
 *      `ensureSimilarTab`，由各面板在 setup 时调用一次（`components/*Panel.vue`）。
 *      「要不要取」交给 `./tabs.ts` 的 `shouldFetch` 判：已成功取过的歌手（`Block.loadedMid === mid`）
 *      不重复拉、在途的（`Block.loadingMid`）复用、换歌手或上次失败则重取。
 *      **状态仍在模块级**（见下面「状态」段）：切走再回来组件重建，`loadedMid` 让「切回来不重复拉」
 *      成立；失败不写 `loadedMid`，所以「切回来重试」也成立。
 *      ⚠️ 这两块**并行**，别串起来：页头信息在途中（`isInfoLoading`）时页面壳照样挂 tab 面板，
 *      否则面板要等 `loadInfo` 回来才挂载、两次往返变四次的观感（`headerLabel` 是「加载中」时
 *      页面壳**不**拿它拦面板，见 index.vue）。
 *
 *   7. **换歌手前先清块**（`resetSongs` / `resetAlbums` / `resetMvs` / `resetSimilar`）：块里可能还是
 *      上一个歌手的内容，而 `offset` / `page` / `hasMore` 这些游标在换歌手后没有意义——
 *      不清就会出现「拿 A 的游标去取 B 的下一页」。清块一律 `list.splice(0, list.length)`
 *      保留数组引用（第 2 条），且把 `loadedMid` 一并清掉（=「本块没有数据」）。
 */

const t = (key: string) => window.i18n.t(key as any)

/** 相似歌手：服务端不接受分页，只接受条数。 */
const SIMILAR_NUM = 12

/**
 * 把「想取的偏移」翻译成数据层的 page/limit（见文件头第 3 条）。
 *
 * `chunk` 由调用方从 Block 里取（不是在这里现读设置）：偏移制的取数要求粒度与累积的 `offset`
 * 配套——中途改设置若就地换粒度，`floor(offset / chunk) + 1` 会把已加载的区间又取一遍。
 * 粒度的取值与刷新时机见 `Block.chunk`。
 */
const chunkParams = (offset: number, chunk: number) => ({ page: Math.floor(offset / chunk) + 1, limit: chunk })

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
  /** 下一个待取偏移。**不能用 `list.length` 推**：绕行方案要求它始终是本次粒度的整数倍 */
  offset: number
  /**
   * 本次列表会话的分页粒度（设置 `list.pageSize`）。**首屏（offset === 0）取一次，之后沿用**：
   * 偏移制的取数要求粒度与 `offset` 配套，中途改设置若就地换粒度会把已加载区间又取一遍。
   * 所以「改完设置下次进页生效」——重进歌手页走首屏分支，那时才跟着设置变。
   */
  chunk: number
  noItemLabel: string
  isLoading: boolean
  hasMore: boolean
  /** 「加载更多」失败：只提示、不清掉已加载内容 */
  moreError: string
  /**
   * 本块当前**内容**属于哪个歌手（成功取数后写入）。切回本 tab 时 `shouldFetch` 据此跳过重复请求；
   * 失败 / 清块后留空，所以「失败重进可重试」也由它表达。
   */
  loadedMid: string
  /** 正在请求的歌手：在途去重用（`isLoading` 管按钮禁用态，两者别混，理由见 Block 的注释与 tabs.ts）。 */
  loadingMid: string
}

const createBlock = <T>(): Block<T> => ({
  list: [],
  total: 0,
  offset: 0,
  // 首帧占位；首屏取数时会按设置刷一次（见 loadSongs / loadAlbums）
  chunk: getPageSize(appSetting),
  noItemLabel: '',
  isLoading: false,
  hasMore: false,
  moreError: '',
  loadedMid: '',
  loadingMid: '',
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
/** 头部区块的文案（加载中/失败/不存在）；有值时页面只显示它，不渲染 tab 栏与四个面板，避免同一句话显示多遍。 */
const headerLabel = ref('')
/**
 * 页头信息是否还在请求中。**页面壳读它**：加载中不拿 `headerLabel` 拦面板，
 * 好让「当前 tab 的取数」与页头信息并行（见文件头第 6 条）。
 */
const isInfoLoading = ref(false)

/**
 * 关注态（读侧，票 02/03 的读侧那一半）：`true`=已关注 / `false`=未关注 / `null`=**取不到**。
 *
 * ⚠️ `null` 与 `false` 不是一回事，**页面在 `null` 时什么都不显示**——把「取不到」（未登录、
 * 请求失败、会话没建起来）画成「未关注」是在撒谎。判据与三态契约在 `tx/singer.js` 的
 * `getFollowState` 注释里（含为什么不用搜索接口的 `concern_status`）。
 *
 * 本票只做**只读标记**：不做点击、不做两态键（写侧见 `.scratch/follow-singer/issues/03`）。
 */
const followState = ref<boolean | null>(null)

const songs = reactive<Block<LX.Music.MusicInfoOnline> & { page: number, limit: number }>({
  ...createBlock<LX.Music.MusicInfoOnline>(),
  // material-online-list 要求 page/limit/total 三个必填项。limit 与 total 都跟着「已加载条数」走，
  // 让组件底部的分页器整体不渲染（maxPage = 1）——真正的翻页由面板的「加载更多」按钮驱动，
  // 因为数据层表达不出统一的页大小（文件头第 3 条）。
  page: 1,
  limit: 1,
})
const albums = reactive<Block<SingerAlbum>>(createBlock<SingerAlbum>())
const mvs = reactive<Block<SingerMv> & { page: number }>({ ...createBlock<SingerMv>(), page: 1 })
// 相似歌手没有分页（服务端只收条数），所以不用 Block；懒加载的两个字段与 Block 同名同义
const similar = reactive<{ list: SimilarSinger[], noItemLabel: string, loadedMid: string, loadingMid: string }>({
  list: [],
  noItemLabel: '',
  loadedMid: '',
  loadingMid: '',
})

let infoKey = ''
let songKey = ''
let albumKey = ''
let mvKey = ''
let similarKey = ''
let followKey = ''

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
  isInfoLoading.value = true
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
  } finally {
    // 过期请求（换歌手了）不许把新请求的在途状态关掉
    if (infoKey === key) isInfoLoading.value = false
  }
}

/**
 * 取这位歌手的关注态（读侧）。**与页头信息并行**，不塞进 `loadInfo` 的 try 里：
 * 关注态挂了不该把页头写成「加载失败」（两者是不同接口、不同重要度）。
 *
 * 取数入口自己把失败吞成 `null`（三态契约见 `tx/singer.js` 的 `getFollowState`），
 * 所以这里只做「换歌手后过期请求退场」那一件事。
 */
const loadFollowState = async(mid: string) => {
  const key = `singer_follow__${mid}`
  followKey = key
  // 换歌手先清：上一位的关注态不属于这一页。宁可先空一下，也不把 A 的「已关注」挂在 B 头上
  followState.value = null
  const state = await music.tx.singer.getFollowState(mid)
  if (followKey !== key) return
  followState.value = state ?? null
}

/**
 * 把歌曲块清空（换歌手 / 首屏失败时用，见文件头第 7 条）：`splice` 保留数组引用（第 2 条），
 * `loadedMid` 一并清掉表示「本块没有数据」——下次切进来 `shouldFetch` 会重取。
 */
const resetSongs = () => {
  songs.list.splice(0, songs.list.length)
  songs.total = 0
  songs.offset = 0
  songs.limit = 1
  songs.hasMore = false
  songs.moreError = ''
  songs.loadedMid = ''
}

/** 歌曲。`offset` 为 0 是首屏（替换），否则是「加载更多」（追加）。 */
const loadSongs = async(mid: string, offset = 0) => {
  const key = `singer_songs__${mid}__${offset}`
  songKey = key
  songs.isLoading = true
  songs.loadingMid = mid
  songs.moreError = ''
  if (offset === 0) songs.noItemLabel = t('list__loading')
  // 首屏才按设置取粒度，「加载更多」沿用同一个（理由见 Block.chunk）
  if (offset === 0) songs.chunk = getPageSize(appSetting)
  const { page, limit } = chunkParams(offset, songs.chunk)
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
    songs.loadedMid = mid
    finishLabel(songs, songs.list)
  } catch (err: any) {
    if (songKey !== key) return
    console.log('[singer] songs', err)
    if (offset > 0) songs.moreError = errorLabel(err)
    else {
      resetSongs()
      songs.noItemLabel = errorLabel(err)
    }
  } finally {
    // 只清自己那一次的标记：换歌手时旧请求的收尾不许关掉新请求的在途状态（否则来回切 tab 会重打）
    if (songKey === key) {
      songs.isLoading = false
      songs.loadingMid = ''
    }
  }
}

/** 把专辑块清空（换歌手 / 首屏失败）；理由同 resetSongs。 */
const resetAlbums = () => {
  albums.list.splice(0, albums.list.length)
  albums.total = 0
  albums.offset = 0
  albums.hasMore = false
  albums.moreError = ''
  albums.loadedMid = ''
}

/**
 * 专辑。分页绕行与歌曲同一套（`getAlbumList` 是同一个 bug），偏移粒度同样取自 `Block.chunk`。
 * `num` 在专辑这里服务端**没有** 100 的上限（实测 num=200 能收回 78 张），首屏取 100 是安全的。
 */
const loadAlbums = async(mid: string, offset = 0) => {
  const key = `singer_albums__${mid}__${offset}`
  albumKey = key
  albums.isLoading = true
  albums.loadingMid = mid
  albums.moreError = ''
  if (offset === 0) albums.noItemLabel = t('list__loading')
  // 首屏才按设置取粒度，「加载更多」沿用同一个（理由见 Block.chunk）
  if (offset === 0) albums.chunk = getPageSize(appSetting)
  const { page, limit } = chunkParams(offset, albums.chunk)
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
    albums.loadedMid = mid
    finishLabel(albums, albums.list)
  } catch (err: any) {
    if (albumKey !== key) return
    console.log('[singer] albums', err)
    if (offset > 0) albums.moreError = errorLabel(err)
    else {
      resetAlbums()
      albums.noItemLabel = errorLabel(err)
    }
  } finally {
    // 只清自己那一次的标记（理由同 loadSongs）
    if (albumKey === key) {
      albums.isLoading = false
      albums.loadingMid = ''
    }
  }
}

/** 把 MV 块清空（换歌手 / 首屏失败）；理由同 resetSongs。 */
const resetMvs = () => {
  mvs.list.splice(0, mvs.list.length)
  mvs.page = 1
  mvs.hasMore = false
  mvs.moreError = ''
  mvs.loadedMid = ''
}

/** 歌手 MV。这条接口的 start/count 是正常偏移语义，按普通分页走。 */
const loadMvs = async(mid: string, page = 1, more = false) => {
  const key = `singer_mv__${mid}__${page}`
  mvKey = key
  mvs.isLoading = true
  mvs.loadingMid = mid
  mvs.moreError = ''
  if (!more) mvs.noItemLabel = t('list__loading')
  // MV 是页号制（不是偏移制），粒度现读设置即可：改完设置下次翻页生效
  const pageSize = getPageSize(appSetting)
  try {
    const res = await music.tx.singer.getMvList(mid, page, pageSize)
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
    mvs.hasMore = list.length >= pageSize
    mvs.loadedMid = mid
    finishLabel(mvs, mvs.list)
  } catch (err: any) {
    if (mvKey !== key) return
    console.log('[singer] mvs', err)
    if (more) mvs.moreError = errorLabel(err)
    else {
      resetMvs()
      mvs.noItemLabel = errorLabel(err)
    }
  } finally {
    // 只清自己那一次的标记（理由同 loadSongs）
    if (mvKey === key) {
      mvs.isLoading = false
      mvs.loadingMid = ''
    }
  }
}

/** 把相似歌手块清空（换歌手 / 失败）；理由同 resetSongs。 */
const resetSimilar = () => {
  similar.list.splice(0, similar.list.length)
  similar.loadedMid = ''
}

/** 相似歌手：一次取完（服务端没有分页参数）。 */
const loadSimilar = async(mid: string) => {
  const key = `singer_similar__${mid}`
  similarKey = key
  similar.loadingMid = mid
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
    similar.loadedMid = mid
    finishLabel(similar, similar.list)
  } catch (err: any) {
    if (similarKey !== key) return
    console.log('[singer] similar', err)
    resetSimilar()
    similar.noItemLabel = errorLabel(err)
  } finally {
    // 只清自己那一次的标记（理由同 loadSongs）
    if (similarKey === key) similar.loadingMid = ''
  }
}

/**
 * 进入/切换歌手：**只取歌手信息**（页头那几行），四个区块由各自 tab 懒加载（工单 02，文件头第 6 条）。
 *
 * 路由把 mid 换成另一个歌手时，四个块里的内容一律作废——但**不在这里清**：清块要连 `loadedMid`
 * 一起清（第 7 条），而各块的入口（`ensureXxxTab`）本来就会做这件事，清两遍没有收益、还多一处状态。
 * 代价是「A 的块留在内存里到切到该 tab 为止」，而那时 `shouldFetch` 会先清再取，不会闪旧数据
 * （取数路径上 `noItemLabel` 会被置成「加载中」，列表容器随之隐藏）。
 */
const initSingerInfo = async(value: unknown) => {
  const mid = String(value ?? '').trim()
  if (!mid) {
    // 路由没带 mid：不发请求，直接给「不存在」文案（数据层对空 mid 会抛错）。
    // `infoKey` 一并作废 + 清掉在途标记：上一个歌手的请求回来时不该把页头写成他（键不同它会自己退场）
    infoKey = ''
    followKey = ''
    isInfoLoading.value = false
    followState.value = null
    Object.assign(detail, emptyDetail())
    resetSongs()
    resetAlbums()
    resetMvs()
    resetSimilar()
    headerLabel.value = t('singer__not_found')
    songs.noItemLabel = t('singer__not_found')
    albums.noItemLabel = t('singer__not_found')
    mvs.noItemLabel = t('singer__not_found')
    similar.noItemLabel = t('singer__not_found')
    return
  }
  // 页头信息与关注态并行（两条独立请求；关注态那头是会话缓存，正常只有第一次进页才有往返）
  void loadFollowState(mid)
  await loadInfo(mid)
}

// ---------- 四个 tab 的懒加载入口（面板 setup 时各调一次，判据见 ./tabs.ts）----------

/** 进/切到「歌曲」tab：换歌手先清块，首屏偏移为 0。 */
const ensureSongsTab = (mid: string) => {
  if (!shouldFetch(songs, mid)) return
  resetSongs()
  void loadSongs(mid, 0)
}

/** 进/切到「专辑」tab。 */
const ensureAlbumsTab = (mid: string) => {
  if (!shouldFetch(albums, mid)) return
  resetAlbums()
  void loadAlbums(mid, 0)
}

/** 进/切到「MV」tab。 */
const ensureMvsTab = (mid: string) => {
  if (!shouldFetch(mvs, mid)) return
  resetMvs()
  void loadMvs(mid, 1, false)
}

/** 进/切到「相似歌手」tab。 */
const ensureSimilarTab = (mid: string) => {
  if (!shouldFetch(similar, mid)) return
  resetSimilar()
  void loadSimilar(mid)
}

// 「加载更多」的 mid 取自本块自己的 `loadedMid`（有数据才有 hasMore，按钮才会出现）——
// 不能用「当前页面的 mid」：换歌手后块里的游标属于上一个歌手，混用会把两个歌手的列表接在一起
const loadMoreSongs = () => {
  if (!songs.loadedMid || songs.isLoading) return
  void loadSongs(songs.loadedMid, songs.offset)
}

const loadMoreAlbums = () => {
  if (!albums.loadedMid || albums.isLoading) return
  void loadAlbums(albums.loadedMid, albums.offset)
}

const loadMoreMvs = () => {
  if (!mvs.loadedMid || mvs.isLoading) return
  void loadMvs(mvs.loadedMid, mvs.page + 1, true)
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
    isInfoLoading,
    followState,
    songs,
    albums,
    mvs,
    similar,
    mvPlayer: player,
    initSingerInfo,
    ensureSongsTab,
    ensureAlbumsTab,
    ensureMvsTab,
    ensureSimilarTab,
    loadMoreSongs,
    loadMoreAlbums,
    loadMoreMvs,
    openMv,
    closeMv,
    retryMvUrl,
  }
}
