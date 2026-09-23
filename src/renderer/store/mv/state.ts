import { reactive } from '@common/utils/vueTools'

/**
 * MV（列表 + 播放弹窗）的状态。
 *
 * 它原本是 `views/Mv/useMv.ts` 里的模块级单例（MV 页与歌手页共用同一份播放器状态）。
 * MV 页并入「乐馆」后**两个页面都要用**，所以按仓库惯例搬进 store
 * （跨页面共享的状态归 store；`useXxx.ts` 只留给页面自己的取数）。
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

/** 列表每页条数（与服务端无关，页面自己定）。 */
export const PAGE_SIZE = 20
/** 排序：只有它真的生效。0=最新 1=最热。 */
export const ORDER_LATEST = 0

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

export const list = reactive<{
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

export const player = reactive<{
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
