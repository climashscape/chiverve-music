import { reactive, ref } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

/**
 * 发现页 → 推荐 Tab 取数：**只有首页 feed**。
 *
 * 「猜你喜欢」区块与其取数（`getGuessRecommend` 那一路）已于 2026-09-24 按用户要求整体撤下
 * ——推荐 tab 的内容就是首页推荐，不再挂第二个歌曲区块；数据层的 `tx/recommend.js` 的
 * `getGuessRecommend` 保留（那是 SDK 的能力面，不是视图的私有逻辑）。
 *
 * 原来属于歌曲区块的三条约束（过 `toNewMusicInfo` 转新式对象、列表只做原地改、每块独立
 * try/catch）随区块一起撤掉了；同一套写法在「新歌」tab 的 `useNewSongsTab.ts` 里还活着。
 * 这里剩下的一条是 **翻页的 key 竞态守卫**：旧请求可能后到，回来先比 key。
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

/** 进推荐 Tab 时跑一次（feed 自己兜自己的失败）。 */
const initFeedTab = async() => {
  if (isInited.value) return
  isInited.value = true
  await loadFeed()
}

export default () => {
  return {
    feed,
    initFeedTab,
    loadFeed,
  }
}
