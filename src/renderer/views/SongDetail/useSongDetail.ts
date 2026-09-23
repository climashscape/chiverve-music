import { markRawList, reactive } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
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

const t = (key: string) => window.i18n.t(key as any)

/** 详情页里可播放的歌曲块（相似歌曲 / 其他版本）。 */
export interface SongBlock {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
}

const createSongBlock = (): SongBlock => ({ list: [], total: 0, page: 1, limit: 1, noItemLabel: '' })

const detail = reactive<{
  mid: string
  name: string
  singer: string
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

const setSongs = (block: SongBlock, list: any[]) => {
  const next = markRawList(deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[]))
  block.list.splice(0, block.list.length, ...next)
  block.total = next.length
  block.limit = next.length || 1
}

const errorLabel = (err: any) =>
  err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')

let detailKey = ''

/** 取详情 + 四个关联块（关联块在拿到 songId 后并发，各自兜自己的失败）。 */
const load = async(mid: string) => {
  if (!mid) return
  const key = `songdetail__${mid}`
  detailKey = key
  detail.isLoading = true
  detail.errorLabel = ''
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
    if (!detail.songId) {
      // 没有数字 id 就没法取关联能力——不装作能取，四个块各自落空态
      const empty = t('no_item')
      similar.noItemLabel = empty
      otherVersions.noItemLabel = empty
      relatedPlaylists.noItemLabel = empty
      relatedMvs.noItemLabel = empty
      return
    }
    await Promise.all([
      loadSimilar(),
      loadOtherVersions(),
      loadRelatedPlaylists(),
      loadRelatedMvs(),
    ])
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
