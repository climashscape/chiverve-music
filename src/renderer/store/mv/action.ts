import { markRawList } from '@common/utils/vueTools'
import { getPageSize } from '@common/settings/pageSize'
import music from '@renderer/utils/musicSdk'
import { appSetting } from '@renderer/store/setting'
import { list, player, type MvInfo, type MvDetail } from './state'

/** MV 取数（列表 / 详情 / 播放地址）。约束见 state.ts 文件头。 */

const t = (key: string) => window.i18n.t(key as any)

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

/**
 * 编码 → 展示名。`H.264`/`H.265` 是编码专名，不进 i18n（同 `download_lxlyric` 的处理）。
 * 认不出来（服务端回了别的值/缺失）就回空串——提示行宁可不显示编码，也别显示错的东西。
 */
const codecLabel = (format?: number) => {
  if (format === 264) return 'H.264'
  if (format === 265) return 'H.265'
  return ''
}

/** 提示行：`编码 · 体积`（为什么编码必须在里面见 state.ts 的 `sizeText` 注释）。 */
const buildSizeText = (format?: number, sizeText?: string) =>
  [codecLabel(format), sizeText ?? ''].filter(Boolean).join(' · ')

/** 列表。`more` 为 true 时追加（分页器不可用，见 state.ts 文件头第 2 条）。 */
export const loadMvs = async(page = 1, more = false) => {
  const key = `mv__${list.order}__${page}`
  listKey = key
  list.isLoading = true
  list.moreError = ''
  if (!more) list.noItemLabel = t('list__loading')
  // 每页条数现读设置（`list.pageSize`）：改完设置下次进页 / 翻页就生效，不必重启
  const pageSize = getPageSize(appSetting)
  try {
    const res = await music.tx.mv.getMvList({ order: list.order, page, num: pageSize })
    if (listKey !== key) return
    const items = (res?.list ?? []) as MvInfo[]
    if (more) list.list.push(...markRawList(items))
    else setList(markRawList(items))
    list.page = page
    list.limit = pageSize
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
export const switchOrder = (order: number) => {
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
    player.sizeText = buildSizeText(res?.format, res?.sizeText)
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
export const openMv = (item: MvInfo) => {
  player.show = true
  player.mv = item
  player.detail = null
  player.url = ''
  player.urlError = ''
  player.sizeText = ''
  player.filetype = null
  void Promise.all([loadDetail(item.vid), loadUrl(item.vid)])
}

export const closePlayer = () => {
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
export const retryUrl = () => {
  const vid = player.mv?.vid
  if (vid) void loadUrl(vid)
}
