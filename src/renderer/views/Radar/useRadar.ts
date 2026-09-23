import { markRawList, reactive, ref } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'

/**
 * 雷达页（`/radar`）取数。数据来自 `GetRadarSong`（`tx/recommend.js` 的 getRadarRecommend），
 * 与发现页原来那个雷达区块**是同一个接口**——2026-09-23 从 `views/Discover/useDiscover.ts`
 * 搬到这里，不是复制（工单 01 的验收口径）。
 *
 * 三条约束是从发现页原样带过来的，改之前先读：
 *
 *   1. 🔴 **歌曲必须过 `toNewMusicInfo`**：数据层（`musicSdk/tx/**`）流通的是老式平铺对象，
 *      而 UI 侧读的是 `item.meta._qualitys`，漏了转换不是显示难看，是渲染期抛错。
 *   2. 🔴 **列表只做原地改（splice/push），不整体替换数组**：`usePlay` 在 setup 时就把
 *      `props.list` 的数组引用存下来了（`components/material/OnlineList/usePlay.ts:22`），
 *      换成新数组会让双击播放读到旧数组。
 *   3. **翻页带 key 竞态守卫**：连点「加载更多」时旧请求可能后到，回来先比 key。
 *
 * 状态放模块级（不是组合函数的局部变量）：路由页没有 keep-alive，切走再回来组件会重建，
 * 状态留在模块里才能「切回来立刻显示上次的内容」，`isInited` 则避免再打一轮请求。
 */

const t = (key: string) => window.i18n.t(key as any)

/** 雷达列表的区块状态（发现页 SongBlock 的同形状，字段含义见那边的注释）。 */
export interface RadarBlock {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
  /** 服务端 `HasMore` 恒为 true（`tx/recommend.js:241-242`），所以按钮一直在。 */
  hasMore: boolean
  /** 供「加载更多」按钮做禁用态（失败后必须还能重试，所以不能拿文案当判据）。 */
  isLoading: boolean
  /** 翻页失败只提示、不清空已有内容。 */
  moreError: string
}

const radar = reactive<RadarBlock>({
  list: [],
  total: 0,
  page: 1,
  // limit 恒等于「已加载条数」：让列表内部的分页器不出现（Pagination 在 maxPage <= 1 时不渲染），
  // 翻页统一走页面自己的「加载更多」按钮。
  limit: 1,
  noItemLabel: '',
  hasMore: false,
  isLoading: false,
  moreError: '',
})

let radarKey = ''

const isInited = ref(false)

/** 老式对象 → 新式模型 + 去重 + markRaw（列表不进深度代理，AGENTS §2.10）。 */
const toOnlineSongs = (list: any[]): LX.Music.MusicInfoOnline[] => {
  const next = deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[])
  return markRawList(next)
}

/** 整块替换（保持数组引用不变，见文件头第 2 条）。 */
const setSongs = (list: any[]) => {
  const next = toOnlineSongs(list)
  radar.list.splice(0, radar.list.length, ...next)
  radar.total = next.length
  radar.limit = next.length || 1
}

/** 追加（「加载更多」）。 */
const appendSongs = (list: any[]) => {
  const next = toOnlineSongs(list)
  radar.list.push(...next)
  radar.total = radar.list.length
  radar.limit = radar.list.length || 1
}

/** 失败文案：未登录与真失败分开，别把「没登录」说成「加载失败」。 */
const errorLabel = (err: any) =>
  err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')

const loadRadar = async(page = 1, more = false) => {
  if (radar.isLoading) return
  const key = `radar__${page}`
  radarKey = key
  radar.isLoading = true
  radar.moreError = ''
  if (!more) radar.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.recommend.getRadarRecommend(page)
    if (radarKey !== key) return
    const list = res?.list ?? []
    if (more) appendSongs(list)
    else setSongs(list)
    radar.page = page
    radar.hasMore = res?.hasMore === true
    radar.noItemLabel = radar.list.length ? '' : t('no_item')
  } catch (err: any) {
    if (radarKey !== key) return
    console.log('[radar] loadRadar', err)
    // 翻页失败只提示、不动已有内容：这里若落 noItemLabel 会把整块内容一起藏掉
    if (more) radar.moreError = errorLabel(err)
    else {
      setSongs([])
      radar.hasMore = false
      radar.noItemLabel = errorLabel(err)
    }
  } finally {
    radar.isLoading = false
  }
}

const initRadar = async(force = false) => {
  if (isInited.value && !force) return
  isInited.value = true
  await loadRadar(1, false)
}

export default () => {
  return {
    radar,
    isInited,
    initRadar,
    loadRadar,
  }
}
