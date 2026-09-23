import { markRawList, reactive, ref } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'

/**
 * 发现页 → 推荐 Tab 取数：首页 feed + 猜你喜欢。
 *
 * 四条约束是从合并版 useDiscover.ts 原样带过来的（2026-09-23 拆 Tab 时按 Tab 切分，逻辑没动）：
 *
 *   1. 🔴 **歌曲必须过 `toNewMusicInfo`**：数据层流通的是老式平铺对象，UI 侧读
 *      `item.meta._qualitys`，漏了转换不是显示难看，是渲染期抛错。
 *   2. 🔴 **歌曲列表只做原地改（splice/push）**：`usePlay` 在 setup 时就存了 `props.list`
 *      的数组引用，整体替换会让双击播放读到旧数组。
 *   3. **每个区块独立 try/catch**：接口都要登录态，一个 Promise.all 收口失败会让整块白屏。
 *   4. **翻页带 key 竞态守卫**：旧请求可能后到，回来先比 key。
 *
 * 状态放模块级：路由页没有 keep-alive，切走再回来组件会重建，状态留在模块里才能
 * 「切回来立刻显示上次的内容」；`isInited` 避免重复打请求（切 Tab 也不重打）。
 */

const t = (key: string) => window.i18n.t(key as any)

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

/**
 * 歌曲区块。`limit` 恒等于「已加载条数」——这些接口要么没有页码语义（猜你喜欢）、
 * 要么用「换一批」累积，把 limit 撑到等于条数可以让列表底部的分页器不出现
 * （Pagination 在 maxPage <= 1 时整体不渲染）。
 */
export interface SongBlock {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
  hasMore: boolean
  /** 供「换一批」按钮做禁用态（失败后必须还能重试，所以不能拿文案当判据）。 */
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

/** 老式对象 → 新式模型 + 去重 + markRaw（列表不进深度代理，AGENTS §2.10）。 */
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

const guess = reactive<SongBlock>(createSongBlock())
let guessKey = ''

const isInited = ref(false)

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

/** 进推荐 Tab 时跑一次（两个区块并发，各自兜自己的失败）。 */
const initFeedTab = async() => {
  if (isInited.value) return
  isInited.value = true
  await Promise.all([loadFeed(), loadGuess()])
}

export default () => {
  return {
    feed,
    guess,
    initFeedTab,
    loadFeed,
    loadGuess,
  }
}
