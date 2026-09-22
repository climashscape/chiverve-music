import { markRawList, reactive } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

/**
 * MV 页（M5）取数：分类列表 + 详情 + 播放地址。
 *
 * 三条实测约束（都写在 `tx/mv.js` 的文件头，这里按它们设计 UI）：
 *   1. 🔴 **`area` / `version` 不生效**：实测换 area/version 拿到的是同一批 vid，只有
 *      `order`（0 最新 / 1 最热）与 start/size 真的换内容。所以 UI 上**不做地区/版本筛选**，
 *      只留最新/最热 —— 做了就是假交互。请求里也不传这两个参数（用数据层的默认值 15/7 = 全部）。
 *   2. `total` 实测恒为 1000（服务端上限），**不能拿来算总页数**；`hasMore` 只能按
 *      「本页拿满了」判断（数据层已经这么算），所以翻页做成「加载更多」而不是分页器。
 *   3. 播放地址只走 mp4（hls 在这个账号下拿不到），直链在响应里带 vkey、`expire` 约 86400 秒
 *      （24h）。所以弹窗要能「重新获取」：过期/失败时重新取一次即可，不用重开页面。
 */

const t = (key: string) => window.i18n.t(key as any)

/** 列表每页条数（与服务端无关，页面自己定）。 */
const PAGE_SIZE = 20
/** 排序：只有它真的生效。0=最新 1=最热。 */
const ORDER_LATEST = 0

export interface MvInfo {
  id: string
  vid: string
  name: string
  subName: string
  img: string
  singer: string
  interval: string | null
  duration: number
  playCount: number
  pubDate?: string
}

export interface MvDetail extends MvInfo {
  desc: string
  isFav: boolean
  uploader: {
    uin: string
    name: string
    img: string
    followerNum: number
    hasFollow: boolean
  }
}

const list = reactive<{
  list: MvInfo[]
  page: number
  limit: number
  noItemLabel: string
  /** 翻页失败：只提示、不清掉已加载的卡片（同发现页 feed 的处理） */
  moreError: string
  hasMore: boolean
  order: number
  isLoading: boolean
}>({
  list: [],
  page: 1,
  limit: PAGE_SIZE,
  noItemLabel: '',
  moreError: '',
  hasMore: false,
  order: ORDER_LATEST,
  isLoading: false,
})

const player = reactive<{
  show: boolean
  /** 列表项：详情还没回来前先用它填弹窗，避免空白 */
  mv: MvInfo | null
  detail: MvDetail | null
  url: string
  urlError: string
  isLoading: boolean
  sizeText: string
  filetype: number | null
}>({
  show: false,
  mv: null,
  detail: null,
  url: '',
  urlError: '',
  isLoading: false,
  sizeText: '',
  filetype: null,
})

let listKey = ''
let detailKey = ''
let urlKey = ''

/** 失败文案：未登录 / 无可播档位 / 其它，分开说，别把「没登录」说成「加载失败」。 */
const errorLabel = (err: any) => {
  if (err?.message === 'QQ 音乐未登录') return t('user_center__need_login')
  if (err?.message === '该 MV 没有可用播放地址') return t('mv__url_unavailable')
  return t('list__load_failed')
}

const setList = (items: MvInfo[]) => {
  list.list.splice(0, list.list.length, ...items)
}

/** 列表。`more` 为 true 时追加（分页器不可用，见文件头第 2 条）。 */
const loadMvs = async(page = 1, more = false) => {
  const key = `mv__${list.order}__${page}`
  listKey = key
  list.isLoading = true
  list.moreError = ''
  if (!more) list.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.mv.getMvList({ order: list.order, page, num: PAGE_SIZE })
    if (listKey !== key) return
    const items = (res?.list ?? []) as MvInfo[]
    if (more) list.list.push(...markRawList(items))
    else setList(markRawList(items))
    list.page = page
    list.limit = PAGE_SIZE
    list.hasMore = res?.hasMore === true
    list.noItemLabel = list.list.length ? '' : t('no_item')
  } catch (err: any) {
    if (listKey !== key) return
    console.log('[mv] list', err)
    if (more) list.moreError = errorLabel(err)
    else {
      setList([])
      list.hasMore = false
      list.noItemLabel = errorLabel(err)
    }
  } finally {
    list.isLoading = false
  }
}

/** 切排序：只有 order 真的生效，切了就重拉第 1 页。 */
const switchOrder = (order: number) => {
  if (list.order === order) return
  list.order = order
  void loadMvs(1, false)
}

const loadDetail = async(vid: string) => {
  const key = `mvd__${vid}`
  detailKey = key
  try {
    const res = await music.tx.mv.getMvDetail(vid)
    if (detailKey !== key) return
    player.detail = res as MvDetail
  } catch (err: any) {
    // 详情失败不影响播放：列表项的信息已经在弹窗里了，这里只记日志
    if (detailKey !== key) return
    console.log('[mv] detail', err)
    player.detail = null
  }
}

const loadUrl = async(vid: string) => {
  const key = `mvu__${vid}`
  urlKey = key
  player.isLoading = true
  player.urlError = ''
  player.url = ''
  try {
    const res = await music.tx.mv.getMvUrl(vid)
    if (urlKey !== key || player.mv?.vid !== vid) return
    player.url = res?.url ?? ''
    player.filetype = Number(res?.filetype ?? 0)
    player.sizeText = res?.sizeText ?? ''
    if (!player.url) player.urlError = t('mv__url_unavailable')
  } catch (err: any) {
    if (urlKey !== key || player.mv?.vid !== vid) return
    console.log('[mv] url', err)
    player.urlError = errorLabel(err)
  } finally {
    if (player.mv?.vid === vid) player.isLoading = false
  }
}

/** 打开某个 MV：弹窗立刻出现（用列表项占位），详情与播放地址并发拉。 */
const openMv = (item: MvInfo) => {
  player.show = true
  player.mv = item
  player.detail = null
  player.url = ''
  player.urlError = ''
  player.sizeText = ''
  player.filetype = null
  void Promise.all([loadDetail(item.vid), loadUrl(item.vid)])
}

const closePlayer = () => {
  player.show = false
  // 清 src 停播：material-modal 的离场动画期间 video 元素还在 DOM 里，只关 show 会继续响
  player.url = ''
  player.urlError = ''
  player.detail = null
  player.mv = null
  urlKey = ''
  detailKey = ''
}

/** 重新取播放地址（直链过期 / 取流失败时用）。 */
const retryUrl = () => {
  const vid = player.mv?.vid
  if (vid) void loadUrl(vid)
}

export default () => {
  return {
    list,
    player,
    loadMvs,
    switchOrder,
    openMv,
    closePlayer,
    retryUrl,
  }
}
