import { markRawList, reactive, ref } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'

/**
 * 专辑页（M5）取数：详情 + 歌曲分页。
 *
 * 三个注意点：
 *   1. 🔴 **歌曲必须过 `toNewMusicInfo`**：数据层给的是老式平铺对象，UI 侧要新式 meta 模型
 *      （AGENTS §2.10）。`material-online-list` 会读 `item.meta._qualitys`，漏转换是渲染期报错。
 *   2. **歌曲列表原地改（splice）不换数组**：`usePlay` 把 `props.list` 的数组引用存下来了
 *      （`components/material/OnlineList/usePlay.ts:22`），换新数组会让双击播放拿到旧数组。
 *   3. **详情与歌曲各自兜自己的失败**：两者都失败通常是「专辑不存在」（同一张专辑的详情与
 *      歌曲列表都查不到），但只挂一个时不该把另一个也藏起来。
 */

const t = (key: string) => window.i18n.t(key as any)

/** 专辑歌曲每页条数（专辑常见几十首，50 一页够用）。 */
const PAGE_SIZE = 50

export interface AlbumDetail {
  id: string
  mid: string
  name: string
  transName: string
  img: string
  singer: string
  singers: Array<{ id: string, mid: string, name: string, img: string }>
  publishDate: string
  language: string
  albumType: string
  genre: string
  desc: string
  company: string
}

const emptyDetail = (): AlbumDetail => ({
  id: '',
  mid: '',
  name: '',
  transName: '',
  img: '',
  singer: '',
  singers: [],
  publishDate: '',
  language: '',
  albumType: '',
  genre: '',
  desc: '',
  company: '',
})

const detail = reactive<AlbumDetail>(emptyDetail())

const songs = reactive<{
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
}>({
  list: [],
  total: 0,
  page: 1,
  limit: PAGE_SIZE,
  noItemLabel: '',
})

/** 头部区块的文案（加载中/失败/不存在）；有值时页面不渲染歌曲列表，避免同一句话显示两遍。 */
const headerLabel = ref('')

// 当前专辑 id：等详情与歌曲的首屏都回来后再对一次，防止快速切专辑时旧结果覆盖新结果
let currentId = ''
let detailKey = ''
let songKey = ''

/**
 * 失败文案。数据层不导出错误码，只能认 message（与 M4 的 `store/user/action.ts` 同一套判据）；
 * 文案本身来自数据层文件头，改动数据层时这里要一起看。
 */
const errorLabel = (err: any) => {
  if (err?.message === 'QQ 音乐未登录') return t('user_center__need_login')
  if (err?.message === '专辑不存在或已下架') return t('album__not_found')
  return t('list__load_failed')
}

/** 老式平铺对象 → 新式模型 + 去重 + markRaw（列表不进深度代理，§2.10）。 */
const toOnlineSongs = (list: any[]): LX.Music.MusicInfoOnline[] => {
  const next = deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[])
  return markRawList(next)
}

const clearSongs = () => {
  songs.list.splice(0, songs.list.length)
  songs.total = 0
  songs.page = 1
  songs.limit = PAGE_SIZE
}

const loadDetail = async(id: string) => {
  const key = `album__${id}`
  detailKey = key
  headerLabel.value = t('list__loading')
  try {
    const res = await music.tx.album.getAlbumDetail(id)
    if (detailKey !== key) return
    Object.assign(detail, emptyDetail(), res ?? {})
    headerLabel.value = ''
  } catch (err: any) {
    if (detailKey !== key) return
    console.log('[album] detail', err)
    Object.assign(detail, emptyDetail())
    headerLabel.value = errorLabel(err)
  }
}

const loadSongs = async(id: string, page = 1) => {
  const key = `album_songs__${id}__${page}`
  songKey = key
  songs.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.album.getAlbumSongs(id, page, PAGE_SIZE)
    if (songKey !== key) return
    const list = toOnlineSongs(res?.list ?? [])
    songs.list.splice(0, songs.list.length, ...list)
    songs.total = Number(res?.total ?? list.length)
    songs.page = page
    songs.limit = PAGE_SIZE
    songs.noItemLabel = list.length ? '' : t('no_item')
  } catch (err: any) {
    if (songKey !== key) return
    console.log('[album] songs', err)
    clearSongs()
    songs.noItemLabel = errorLabel(err)
  }
}

/** 进入/切换专辑：详情与第 1 页歌曲并发（各自 try/catch，失败不影响对方）。 */
const initAlbum = async(value: unknown) => {
  const id = String(value ?? '').trim()
  currentId = id
  if (!id) {
    // 路由没带 mid：不发请求，直接给「不存在」文案（数据层对空 id 会抛"缺少专辑 id"）
    Object.assign(detail, emptyDetail())
    clearSongs()
    headerLabel.value = t('album__not_found')
    songs.noItemLabel = t('album__not_found')
    return
  }
  await Promise.all([loadDetail(id), loadSongs(id, 1)])
}

/** 翻页（只动歌曲，详情不用重拉）。 */
const loadSongPage = (page: number) => {
  if (!currentId) return
  void loadSongs(currentId, page)
}

export default () => {
  return {
    detail,
    songs,
    headerLabel,
    initAlbum,
    loadSongPage,
  }
}
