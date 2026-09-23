import { computed, markRawList, reactive, ref } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'
import type { ListInfo, ListInfoItem } from '@renderer/store/songList/state'

/**
 * 发现页取数：首页 feed / 推荐歌单 / 新碟上架 / 新歌 / 猜你喜欢。
 *
 * 雷达推荐原在这个文件里，2026-09-23 搬去独立页（`views/Radar/useRadar.ts`）——
 * 是搬走不是复制，这里不再保留任何雷达状态。
 *
 * 这个文件里的每个决定都是被下面四条约束逼出来的，改之前先读：
 *
 *   1. 🔴 **歌曲必须过 `toNewMusicInfo`**：数据层（`musicSdk/tx/**`）流通的是老式平铺对象
 *      （`tx/utils/song.js` 的 createSong），而 UI 侧是「平台字段进 meta」的新式模型
 *      （AGENTS §2.10）。`material-online-list` 会直接读 `item.meta._qualitys`，
 *      漏了转换不是显示难看，是渲染期抛错。store 里的列表都做了这一步
 *      （如 `store/leaderboard/action.ts:57`），这里照做。
 *
 *   2. 🔴 **歌曲列表只做原地改（splice/push），不整体替换数组**：`usePlay` 在 setup 时
 *      就把 `props.list` 的数组引用存下来了（`components/material/OnlineList/usePlay.ts:22`），
 *      换成新数组会让双击播放读到旧数组、拿到的 targetSong 是 undefined。
 *      ⚠️ M4 的 `store/user/action.ts` 是「整体赋值」写法（`favSongs.list = …`），
 *      不要照抄到会被 usePlay 绑定的列表上。
 *
 *   3. **每个区块独立 try/catch，区块间互不阻塞**：这些接口都要登录态，未登录时统一抛
 *      `QQ 音乐未登录`；用一个 Promise.all 收口失败会让整页白屏。失败只落该区块的
 *      noItemLabel（三段式，§2.11）：未登录落「请先登录 QQ 音乐」，其余落「加载失败」。
 *
 *   4. **切 tab / 翻页带 key 竞态守卫**：切地区、切页时旧请求可能后到，回来先比 key。
 */

const t = (key: string) => window.i18n.t(key as any)

/**
 * 推荐歌单每页条数：歌单卡片组件是 `width: 32%` 的方形卡（每行 3 张），9 条正好 3 行，
 * 与 index.vue 里给它的固定高度（.gridBox）配平——那个组件内部是绝对定位 + 自滚动，
 * 父级必须给确定高度，条数一多就会变成"盒子内滚动条"，所以这里按 3 行来定。
 */
const RECOMMEND_PAGE_SIZE = 9
/** 新碟每页条数。 */
const NEW_ALBUM_PAGE_SIZE = 12

/**
 * 新歌地区。**type 到地区的映射是实测来的**（`tx/recommend.js` 文件头第 7 条：
 * 1=内地 2=欧美 3=日本 4=韩国 5=最新 6=港台），不走响应里的 `lanlist` 名字——
 * 那些名字是服务端给的中文，四语界面下不能直接用。
 */
const NEW_SONG_TYPES = [
  { type: 5, label: 'discover__new_song_all' },
  { type: 1, label: 'discover__area_inland' },
  { type: 6, label: 'discover__area_hktw' },
  { type: 2, label: 'discover__area_europe_us' },
  { type: 4, label: 'discover__area_korea' },
  { type: 3, label: 'discover__area_japan' },
]

/**
 * 新碟地区。与 MV 列表不同，**新碟的 `area` 实测真的过滤**（`tx/album.js` 文件头第 5 条：
 * 1=内地 2=港台 3=欧美 4=韩国 5=日本 6=其他），所以这里做成真筛选。
 */
const NEW_ALBUM_AREAS = [
  { area: 1, label: 'discover__area_inland' },
  { area: 2, label: 'discover__area_hktw' },
  { area: 3, label: 'discover__area_europe_us' },
  { area: 4, label: 'discover__area_korea' },
  { area: 5, label: 'discover__area_japan' },
  { area: 6, label: 'discover__area_other' },
]

/** 首页 feed 的卡片（数据层 toCard 的归一化结果，字段见 tx/recommend.js toCard）。 */
export interface FeedCard {
  kind: string
  type: number
  subType: number
  id: string
  name: string
  subName: string
  img: string
  count: number
  countText: string
  reason: string
  jumpType: number
  albumMid: string
  source: string
}

/** 首页 feed 的楼层。 */
export interface FeedShelf {
  id: string
  name: string
  style: number
  cards: FeedCard[]
}

/** 新碟卡片（数据层 toNewAlbum 的 list 项）。 */
export interface AlbumCard {
  id: string
  mid: string
  name: string
  transName: string
  img: string
  singer: string
  publishDate: string
}

/**
 * 歌曲区块。`limit` 恒等于「已加载条数」——这些接口要么没有页码语义（新歌、猜你喜欢）、
 * 要么用「加载更多」累积（雷达），把 limit 撑到等于条数可以让列表底部的分页器不出现
 * （Pagination 在 maxPage <= 1 时整体不渲染）。
 */
export interface SongBlock {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
  hasMore: boolean
  /** 供「换一批 / 加载更多」按钮做禁用态用（失败后必须还能重试，所以不能拿文案当判据）。 */
  isLoading: boolean
}

const createSongBlock = (): SongBlock => ({
  list: [],
  total: 0,
  page: 1,
  limit: 1,
  noItemLabel: '',
  hasMore: false,
  isLoading: false,
})

/** 老式对象 → 新式模型 + 去重 + markRaw（列表不进深度代理，§2.10）。 */
const toOnlineSongs = (list: any[]): LX.Music.MusicInfoOnline[] => {
  const next = deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[])
  return markRawList(next)
}

/** 整块替换（保持数组引用不变，见文件头第 2 条）。 */
const setSongs = (block: SongBlock, list: any[]) => {
  const next = toOnlineSongs(list)
  block.list.splice(0, block.list.length, ...next)
  block.total = next.length
  block.limit = next.length || 1
}

/** 失败文案：未登录与真失败分开，别把「没登录」说成「加载失败」。 */
const errorLabel = (err: any) =>
  err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')

/** 成功但空 → 空态文案；有数据 → 清掉文案（三段式的第三段）。 */
const finishLabel = (block: { noItemLabel: string }, list: any[]) => {
  block.noItemLabel = list.length ? '' : t('no_item')
}

// ---------- 状态 ----------
// 状态放在模块级（不是组合函数的局部变量）：路由页没有 keep-alive，切走再回来组件会重建，
// 状态留在模块里才能「切回来立刻显示上次的内容」，`isInited` 则避免再打一轮 6 个请求。

const feed = reactive<{ shelves: FeedShelf[], noItemLabel: string, hasMore: boolean, isLoading: boolean, moreError: string }>({
  shelves: [],
  noItemLabel: '',
  hasMore: false,
  isLoading: false,
  moreError: '',
})

/**
 * 首页 feed 的翻页参数。**它不是 page 语义**（`tx/recommend.js` 文件头第 2 条）：必须把上
 * 一屏返回的 `next` 原样回传（direction=1 + 累积 v_cache + 累积 s_num），否则永远拿第一屏。
 *
 * 装在对象里而不是用裸 `let`：`require-atomic-updates` 会拦住「await 之后再赋值」的
 * 模块级变量（规则开了 allowProperties，属性赋值不受影响）。
 */
const feedPager: { next: Record<string, unknown> | null } = { next: null }
let feedKey = ''

const recommend = reactive<{ listInfo: ListInfo, isLoading: boolean }>({
  listInfo: {
    list: [],
    total: 0,
    page: 1,
    limit: RECOMMEND_PAGE_SIZE,
    key: null,
    noItemLabel: '',
    source: 'tx',
    tagId: '',
    sortId: '',
  },
  isLoading: false,
})
let recommendKey = ''

const newAlbums = reactive<{
  list: AlbumCard[]
  total: number
  page: number
  limit: number
  area: number
  noItemLabel: string
  isLoading: boolean
}>({
  list: [],
  total: 0,
  page: 1,
  limit: NEW_ALBUM_PAGE_SIZE,
  area: NEW_ALBUM_AREAS[0].area,
  noItemLabel: '',
  isLoading: false,
})
let newAlbumKey = ''

const newSongs = reactive<SongBlock & { type: number }>({ ...createSongBlock(), type: NEW_SONG_TYPES[0].type })
let newSongKey = ''

const guess = reactive<SongBlock>(createSongBlock())
let guessKey = ''

const isInited = ref(false)

// ---------- 取数 ----------

/** 首页 feed。第一屏走默认参数（direction=0），翻页走上一次返回的 next。 */
const loadFeed = async(more = false) => {
  if (feed.isLoading) return
  const key = `feed__${more ? feed.shelves.length : 0}`
  feedKey = key
  feed.isLoading = true
  feed.moreError = ''
  if (!more) feed.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.recommend.getHomeFeed(more && feedPager.next != null ? feedPager.next : {})
    if (feedKey !== key) return
    // 滤掉服务端给的「空楼层」（v_shelf 里的卡片全被下架/不可见时会是空数组）
    const shelves = ((res?.list ?? []) as FeedShelf[]).filter(shelf => shelf.cards.length > 0)
    if (more) feed.shelves.push(...shelves)
    else feed.shelves.splice(0, feed.shelves.length, ...shelves)
    feedPager.next = res?.next ?? null
    feed.hasMore = res?.hasMore === true
    finishLabel(feed, feed.shelves)
  } catch (err: any) {
    if (feedKey !== key) return
    console.log('[discover] feed', err)
    // 翻页失败只提示、不动已有楼层：这里若落 noItemLabel 会把整块内容一起藏掉
    if (more) feed.moreError = errorLabel(err)
    else {
      feed.shelves.splice(0, feed.shelves.length)
      feed.hasMore = false
      feed.noItemLabel = errorLabel(err)
    }
  } finally {
    feed.isLoading = false
  }
}

/** 推荐歌单。`total` 是服务端给的「最多能给到多少」（实测恒 400），只配当分页器的 count。 */
const loadRecommend = async(page = 1) => {
  const key = `recommend__${page}`
  recommendKey = key
  recommend.isLoading = true
  recommend.listInfo.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.recommend.getRecommendSonglist(page, RECOMMEND_PAGE_SIZE)
    if (recommendKey !== key) return
    const list = (res?.list ?? []) as ListInfoItem[]
    recommend.listInfo.list = markRawList(list)
    recommend.listInfo.total = Number(res?.total ?? list.length)
    recommend.listInfo.page = page
    recommend.listInfo.limit = RECOMMEND_PAGE_SIZE
    recommend.listInfo.key = key
    recommend.listInfo.noItemLabel = list.length ? '' : t('no_item')
  } catch (err: any) {
    if (recommendKey !== key) return
    console.log('[discover] recommend', err)
    recommend.listInfo.list = []
    recommend.listInfo.total = 0
    recommend.listInfo.noItemLabel = errorLabel(err)
  } finally {
    recommend.isLoading = false
  }
}

/** 新碟上架。area 真的生效，所以按地区分页各拉各的。 */
const loadNewAlbums = async(page = 1, area = newAlbums.area) => {
  const key = `newalbum__${area}__${page}`
  newAlbumKey = key
  newAlbums.isLoading = true
  newAlbums.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.album.getNewAlbum(area, NEW_ALBUM_PAGE_SIZE, page)
    if (newAlbumKey !== key) return
    const list = (res?.list ?? []) as AlbumCard[]
    newAlbums.list = markRawList(list)
    newAlbums.total = Number(res?.total ?? list.length)
    newAlbums.page = page
    newAlbums.area = area
    newAlbums.noItemLabel = list.length ? '' : t('no_item')
  } catch (err: any) {
    if (newAlbumKey !== key) return
    console.log('[discover] newAlbums', err)
    newAlbums.list = []
    newAlbums.total = 0
    newAlbums.noItemLabel = errorLabel(err)
  } finally {
    newAlbums.isLoading = false
  }
}

/** 新歌。接口一次给一批，没有页码语义（切地区 = 重拉）。 */
const loadNewSongs = async(type = newSongs.type) => {
  const key = `newsong__${type}`
  newSongKey = key
  newSongs.type = type
  newSongs.isLoading = true
  newSongs.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.recommend.getNewSongs(type)
    if (newSongKey !== key) return
    setSongs(newSongs, res?.list ?? [])
    // 服务端会回自己认识的 type，以它为准（传了非法值时能纠回来）
    newSongs.type = Number(res?.type ?? type)
    newSongs.page = 1
    finishLabel(newSongs, newSongs.list)
  } catch (err: any) {
    if (newSongKey !== key) return
    console.log('[discover] newSongs', err)
    setSongs(newSongs, [])
    newSongs.noItemLabel = errorLabel(err)
  } finally {
    newSongs.isLoading = false
  }
}

/**
 * 猜你喜欢。「换一批」= 整块替换：数据层说每次调用都是新的一批 5 首、没有分页参数，
 * 那按钮就叫「换一批」并真的换掉——若改成累积追加，按钮名就名不副实了。
 */
const loadGuess = async() => {
  const key = `guess__${Date.now()}`
  guessKey = key
  guess.isLoading = true
  guess.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.recommend.getGuessRecommend(5)
    if (guessKey !== key) return
    setSongs(guess, res?.list ?? [])
    finishLabel(guess, guess.list)
  } catch (err: any) {
    if (guessKey !== key) return
    console.log('[discover] guess', err)
    setSongs(guess, [])
    guess.noItemLabel = errorLabel(err)
  } finally {
    guess.isLoading = false
  }
}

/** 首屏：5 个区块并发，各自兜自己的失败（所以 Promise.all 不会 reject）。 */
const initDiscover = async(force = false) => {
  if (isInited.value && !force) return
  isInited.value = true
  await Promise.all([
    loadFeed(),
    loadRecommend(1),
    loadNewAlbums(1, newAlbums.area),
    loadNewSongs(newSongs.type),
    loadGuess(),
  ])
}

const newSongTabs = computed(() => NEW_SONG_TYPES.map(item => ({ type: item.type, label: t(item.label) })))
const newAlbumTabs = computed(() => NEW_ALBUM_AREAS.map(item => ({ area: item.area, label: t(item.label) })))

/** 切换新歌地区。不比对当前值直接重拉：base-tab 只在值真的变了才 emit，
 *  而"5→1→5"这种快速切换下用区块里的 type 做判据会把第二次切换吞掉。 */
const switchNewSongType = (type: number) => {
  void loadNewSongs(type)
}

/** 切换新碟地区（切回第 1 页）。 */
const switchNewAlbumArea = (area: number) => {
  void loadNewAlbums(1, area)
}

export default () => {
  return {
    feed,
    recommend,
    newAlbums,
    newSongs,
    guess,
    isInited,
    newSongTabs,
    newAlbumTabs,
    initDiscover,
    loadFeed,
    loadRecommend,
    loadNewAlbums,
    loadNewSongs,
    loadGuess,
    switchNewSongType,
    switchNewAlbumArea,
  }
}
