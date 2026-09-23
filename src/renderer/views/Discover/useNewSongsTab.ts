import { markRawList, reactive, ref } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'

/**
 * 发现页 → 新歌 Tab 取数。
 *
 * 新歌地区。**type 到地区的映射是实测来的**（`tx/recommend.js` 文件头第 7 条：
 * 1=内地 2=欧美 3=日本 4=韩国 5=最新 6=港台），不走响应里的 `lanlist` 名字——
 * 那些名字是服务端给的中文，四语界面下不能直接用。
 */

const t = (key: string) => window.i18n.t(key as any)

const NEW_SONG_TYPES = [
  { type: 5, label: 'discover__new_song_all' },
  { type: 1, label: 'discover__area_inland' },
  { type: 6, label: 'discover__area_hktw' },
  { type: 2, label: 'discover__area_europe_us' },
  { type: 4, label: 'discover__area_korea' },
  { type: 3, label: 'discover__area_japan' },
]

/** 歌曲区块（与推荐 Tab 的 SongBlock 同形状，见 useFeedTab.ts 的注释）。 */
export interface SongBlock {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
  hasMore: boolean
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

/** 老式对象 → 新式模型 + 去重 + markRaw（AGENTS §2.10）。 */
const toOnlineSongs = (list: any[]): LX.Music.MusicInfoOnline[] => {
  const next = deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[])
  return markRawList(next)
}

/** 整块替换（保持数组引用不变：`usePlay` 存的是 `props.list` 的引用）。 */
const setSongs = (block: SongBlock, list: any[]) => {
  const next = toOnlineSongs(list)
  block.list.splice(0, block.list.length, ...next)
  block.total = next.length
  block.limit = next.length || 1
}

const newSongs = reactive<SongBlock & { type: number }>({ ...createSongBlock(), type: NEW_SONG_TYPES[0].type })
let newSongKey = ''
const isInited = ref(false)

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
    newSongs.noItemLabel = newSongs.list.length ? '' : t('no_item')
  } catch (err: any) {
    if (newSongKey !== key) return
    console.log('[discover] newSongs', err)
    setSongs(newSongs, [])
    newSongs.noItemLabel = err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')
  } finally {
    newSongs.isLoading = false
  }
}

const typeTabs = () => NEW_SONG_TYPES.map(item => ({ type: item.type, label: t(item.label) }))

/** 切换新歌地区。不比对当前值直接重拉：base-tab 只在值真的变了才 emit，
 *  而"5→1→5"这种快速切换下用区块里的 type 做判据会把第二次切换吞掉。 */
const switchNewSongType = (type: number) => {
  void loadNewSongs(type)
}

const initNewSongsTab = async() => {
  if (isInited.value) return
  isInited.value = true
  await loadNewSongs(newSongs.type)
}

export default () => {
  return {
    newSongs,
    typeTabs,
    initNewSongsTab,
    loadNewSongs,
    switchNewSongType,
  }
}
