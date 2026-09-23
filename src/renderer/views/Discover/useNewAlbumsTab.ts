import { markRawList, reactive, ref } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

/**
 * 发现页 → 新碟 Tab 取数。
 *
 * 新碟地区。与 MV 列表不同，**新碟的 `area` 实测真的过滤**（`tx/album.js` 文件头第 5 条：
 * 1=内地 2=港台 3=欧美 4=韩国 5=日本 6=其他），所以这里做成真筛选。
 */

const t = (key: string) => window.i18n.t(key as any)

const NEW_ALBUM_PAGE_SIZE = 12

const NEW_ALBUM_AREAS = [
  { area: 1, label: 'discover__area_inland' },
  { area: 2, label: 'discover__area_hktw' },
  { area: 3, label: 'discover__area_europe_us' },
  { area: 4, label: 'discover__area_korea' },
  { area: 5, label: 'discover__area_japan' },
  { area: 6, label: 'discover__area_other' },
]

/** 新碟卡片（数据层 toNewAlbum 的 list 项）。 */
export interface AlbumCard {
  id: string
  mid: string
  name: string
  transName: string
  img: string
  singer: string
  publishDate: string
}

const newAlbums = reactive<{
  list: AlbumCard[]
  total: number
  page: number
  limit: number
  area: number
  noItemLabel: string
  isLoading: boolean
}>({
  list: [],
  total: 0,
  page: 1,
  limit: NEW_ALBUM_PAGE_SIZE,
  area: NEW_ALBUM_AREAS[0].area,
  noItemLabel: '',
  isLoading: false,
})
let newAlbumKey = ''
const isInited = ref(false)

/** 新碟上架。area 真的生效，所以按地区分页各拉各的。 */
const loadNewAlbums = async(page = 1, area = newAlbums.area) => {
  const key = `newalbum__${area}__${page}`
  newAlbumKey = key
  newAlbums.isLoading = true
  newAlbums.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.album.getNewAlbum(area, NEW_ALBUM_PAGE_SIZE, page)
    if (newAlbumKey !== key) return
    const list = (res?.list ?? []) as AlbumCard[]
    newAlbums.list = markRawList(list)
    newAlbums.total = Number(res?.total ?? list.length)
    newAlbums.page = page
    newAlbums.area = area
    newAlbums.noItemLabel = list.length ? '' : t('no_item')
  } catch (err: any) {
    if (newAlbumKey !== key) return
    console.log('[discover] newAlbums', err)
    newAlbums.list = []
    newAlbums.total = 0
    newAlbums.noItemLabel = err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')
  } finally {
    newAlbums.isLoading = false
  }
}

const areaTabs = () => NEW_ALBUM_AREAS.map(item => ({ area: item.area, label: t(item.label) }))

/** 切换新碟地区（切回第 1 页）。 */
const switchNewAlbumArea = (area: number) => {
  void loadNewAlbums(1, area)
}

const initNewAlbumsTab = async() => {
  if (isInited.value) return
  isInited.value = true
  await loadNewAlbums(1, newAlbums.area)
}

export default () => {
  return {
    newAlbums,
    areaTabs,
    initNewAlbumsTab,
    loadNewAlbums,
    switchNewAlbumArea,
  }
}
