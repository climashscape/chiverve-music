import { markRawList, reactive } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import { normalizeSingers, type JumpSinger } from '@common/utils/musicLink'
import music from '@renderer/utils/musicSdk'

/**
 * 歌曲详情页（`/songDetail?source=tx&mid=…`）的取数。
 *
 * 一条链：先按 mid 取详情 → 拿 `track_info.id/type` → 再用它取四个关联块。
 * 所以详情失败时四个关联块**不发请求**（没有 songId 可传），只落各自的空态文案。
 *
 * 约束（与仓库其它列表同一套）：
 *   1. 🔴 歌曲列表必须过 `toNewMusicInfo`（数据层是老式平铺对象，UI 读 `meta._qualitys`）
 *   2. 🔴 列表只做原地改（splice/push）：`usePlay` 存的是 `props.list` 的数组引用
 *   3. 每个块独立三段式文案（loading / 空 / 失败），互不阻塞
 */

const t = (key: string, named?: Record<string, unknown>) => window.i18n.t(key as any, named as any)

/** 详情页里可播放的歌曲块（相似歌曲 / 其他版本）。 */
export interface SongBlock {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
}

/** 制作人（幕后名单）：按职责分组，空数组 = 这块不渲染。 */
export interface ProducerGroup {
  title: string
  producers: Array<{ name: string, icon: string, singerMid: string }>
}

/** 曲谱条目：可展示形态就是 `images[]`（乐谱图片直链，见数据层 `getSheetMusic`）。 */
export interface SheetMusicItem {
  id: string
  name: string
  subName: string
  instrument: string
  scoreType: string
  cover: string
  images: string[]
  pageCount: number
}

const createSongBlock = (): SongBlock => ({ list: [], total: 0, page: 1, limit: 1, noItemLabel: '' })

const detail = reactive<{
  mid: string
  name: string
  singer: string
  /** 每位歌手的 mid 与 name（详情响应里就有）——头部歌手名可点的依据，见工单 02 */
  singers: JumpSinger[]
  albumMid: string
  albumName: string
  img: string
  interval: string
  /** 数字 songId / songType：关联能力的入参 */
  songId: number
  songType: number
  desc: string
  info: { company: string, genre: string, lan: string, pubTime: string }
  isLoading: boolean
  errorLabel: string
}>({
  mid: '',
  name: '',
  singer: '',
  singers: [],
  albumMid: '',
  albumName: '',
  img: '',
  interval: '',
  songId: 0,
  songType: 0,
  desc: '',
  info: { company: '', genre: '', lan: '', pubTime: '' },
  isLoading: false,
  errorLabel: '',
})

const similar = reactive<SongBlock>(createSongBlock())
const otherVersions = reactive<SongBlock>(createSongBlock())

export const relatedPlaylists = reactive<{ list: any[], noItemLabel: string }>({ list: [], noItemLabel: '' })
export const relatedMvs = reactive<{ list: any[], noItemLabel: string }>({ list: [], noItemLabel: '' })

/** 制作人块：**空数组时整块不渲染**（QQ 侧没有资料就是没有，不留一个空标题占位）。 */
export const producers = reactive<{ list: ProducerGroup[] }>({ list: [] })

/** 曲谱块：与相关歌单/相关 MV 同一套三段式（loading / 空 / 失败 都落在 `noItemLabel`）。 */
export const sheets = reactive<{ list: SheetMusicItem[], noItemLabel: string }>({ list: [], noItemLabel: '' })

/**
 * 「演唱」组不进制作人块：它是页面头部那行歌手名（而且头部那份可点、能跳歌手页），
 * 同屏再抄一遍只是噪音。`演唱` 是 **QQ 响应里的分组标题**（实测「晴天」「孤勇者」「夜的钢琴曲五」
 * 都用它），不是本仓的 i18n 文案。
 */
const SINGER_ROLE_TITLE = '演唱'

/** 卡片与弹窗共用的副标题：乐器 · 谱型 · 共 N 页，空字段跳过。 */
export const sheetMeta = (item: SheetMusicItem) => [
  item.instrument,
  item.scoreType,
  t('song_detail__sheet_pages', { num: item.pageCount }),
].filter(Boolean).join(' · ')

const setSongs = (block: SongBlock, list: any[]) => {
  const next = markRawList(deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[]))
  block.list.splice(0, block.list.length, ...next)
  block.total = next.length
  block.limit = next.length || 1
}

const errorLabel = (err: any) =>
  err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')

let detailKey = ''

/** 取详情 + 六个块（相似/其他版本要等数字 songId，制作人/曲谱只要有 mid 就并发，各自兜自己的失败）。 */
const load = async(mid: string) => {
  if (!mid) return
  const key = `songdetail__${mid}`
  detailKey = key
  detail.isLoading = true
  detail.errorLabel = ''
  // 换 mid 时先清掉上一首的资料，别让旧的制作人/曲谱挂在新歌上
  producers.list.splice(0, producers.list.length)
  sheets.list.splice(0, sheets.list.length)
  sheets.noItemLabel = t('list__loading')
  similar.noItemLabel = t('list__loading')
  otherVersions.noItemLabel = t('list__loading')
  relatedPlaylists.noItemLabel = t('list__loading')
  relatedMvs.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.songDetail.getDetail(mid)
    if (detailKey !== key) return
    // 数据层给的是老式歌曲对象（musicSdk 内部形状），字段平铺——这里按需取，类型上不假装
    const track = res.track as Record<string, any>
    Object.assign(detail, {
      mid: track.songmid ?? mid,
      name: track.name ?? '',
      singer: track.singer ?? '',
      singers: normalizeSingers(res.trackRaw?.singer),
      albumMid: track.albumMid ?? '',
      albumName: track.albumName ?? '',
      img: track.img ?? '',
      interval: track.interval ?? '',
      songId: Number(res.trackRaw?.id ?? 0),
      songType: Number(res.trackRaw?.type ?? 0),
      desc: res.desc ?? '',
      info: res.info,
    })
    detail.isLoading = false
    // 制作人 / 曲谱只认 mid，不必等数字 songId（关联能力才需要它）
    const jobs = [loadProducers(), loadSheets()]
    if (!detail.songId) {
      // 没有数字 id 就没法取关联能力——不装作能取，四个块各自落空态
      const empty = t('no_item')
      similar.noItemLabel = empty
      otherVersions.noItemLabel = empty
      relatedPlaylists.noItemLabel = empty
      relatedMvs.noItemLabel = empty
    } else {
      jobs.push(loadSimilar(), loadOtherVersions(), loadRelatedPlaylists(), loadRelatedMvs())
    }
    await Promise.all(jobs)
  } catch (err: any) {
    if (detailKey !== key) return
    console.log('[songDetail]', err)
    detail.isLoading = false
    detail.errorLabel = errorLabel(err)
    const label = errorLabel(err)
    similar.noItemLabel = label
    otherVersions.noItemLabel = label
    relatedPlaylists.noItemLabel = label
    relatedMvs.noItemLabel = label
    sheets.noItemLabel = label
  }
}

/** 制作人：失败只清空（这块没有空态文案，清空即隐藏）。 */
const loadProducers = async() => {
  try {
    const list: ProducerGroup[] = await music.tx.songDetail.getProducer(detail.mid)
    const visible = list.filter(group => group.title != SINGER_ROLE_TITLE)
    producers.list.splice(0, producers.list.length, ...visible)
  } catch (err: any) {
    console.log('[songDetail] producers', err)
    producers.list.splice(0, producers.list.length)
  }
}

const loadSheets = async() => {
  try {
    const list: SheetMusicItem[] = await music.tx.songDetail.getSheetMusic(detail.mid)
    sheets.list.splice(0, sheets.list.length, ...list)
    sheets.noItemLabel = sheets.list.length ? '' : t('no_item')
  } catch (err: any) {
    console.log('[songDetail] sheets', err)
    sheets.list.splice(0, sheets.list.length)
    sheets.noItemLabel = errorLabel(err)
  }
}

const loadSimilar = async() => {
  try {
    const list = await music.tx.songDetail.getSimilarSongs(detail.songId, detail.songType)
    setSongs(similar, list)
    similar.noItemLabel = similar.list.length ? '' : t('no_item')
  } catch (err: any) {
    console.log('[songDetail] similar', err)
    setSongs(similar, [])
    similar.noItemLabel = errorLabel(err)
  }
}

const loadOtherVersions = async() => {
  try {
    const list = await music.tx.songDetail.getOtherVersions(detail.mid, detail.songType)
    setSongs(otherVersions, list)
    otherVersions.noItemLabel = otherVersions.list.length ? '' : t('no_item')
  } catch (err: any) {
    console.log('[songDetail] otherVersions', err)
    setSongs(otherVersions, [])
    otherVersions.noItemLabel = errorLabel(err)
  }
}

const loadRelatedPlaylists = async() => {
  try {
    const list = await music.tx.songDetail.getRelatedPlaylists(detail.songId, detail.songType)
    relatedPlaylists.list.splice(0, relatedPlaylists.list.length, ...list)
    relatedPlaylists.noItemLabel = list.length ? '' : t('no_item')
  } catch (err: any) {
    console.log('[songDetail] playlists', err)
    relatedPlaylists.list.splice(0, relatedPlaylists.list.length)
    relatedPlaylists.noItemLabel = errorLabel(err)
  }
}

const loadRelatedMvs = async() => {
  try {
    const list = await music.tx.songDetail.getRelatedMv(detail.songId)
    relatedMvs.list.splice(0, relatedMvs.list.length, ...list)
    relatedMvs.noItemLabel = list.length ? '' : t('no_item')
  } catch (err: any) {
    console.log('[songDetail] mvs', err)
    relatedMvs.list.splice(0, relatedMvs.list.length)
    relatedMvs.noItemLabel = errorLabel(err)
  }
}

export default () => {
  return {
    detail,
    similar,
    otherVersions,
    load,
  }
}
