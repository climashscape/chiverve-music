import { markRaw, markRawList } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { listInfos, normalizeSource, PAGE_SIZE, type TypedSearchType } from './state'

/**
 * 搜索页「歌手 / 专辑 / MV」三类的取数（工单 10）。
 *
 * 与 `store/search/music/action.ts` 同一套纪律：
 *   1. **竞态键**：请求前把 `key` 写进 listInfo，回来先比 key，不一致就丢弃（快速改关键词时旧结果后到）
 *   2. **三段式文案**：loading → 数据 → 失败/空（§2.11），视图只负责渲染 noItemLabel
 *   3. 列表进 `markRawList`，不进深度代理（§2.10）
 */

const t = (key: string) => window.i18n.t(key as any)

/** 类型 → 数据层方法名（`searchSinger` / `searchAlbum` / `searchMv`）。
 *  用映射表而不是拼字符串：数据层的方法名有类型，拼出来的字符串索引会退化成 `any`（TS7053）。 */
const METHOD_NAME = {
  singer: 'searchSinger',
  album: 'searchAlbum',
  mv: 'searchMv',
} as const

export const setList = (type: TypedSearchType, list: any[]) => {
  const info = listInfos[type]
  info.list = markRawList(list)
}

export const resetListInfo = (type: TypedSearchType) => {
  const info = listInfos[type]
  info.list = markRaw([])
  info.total = 0
  info.page = 1
  info.maxPage = 1
  info.limit = PAGE_SIZE
  info.key = null
  info.noItemLabel = ''
}

export const search = async(type: TypedSearchType, text: string, page = 1, source?: string): Promise<void> => {
  const info = listInfos[type]
  const id = normalizeSource(source)
  const api = music[id]?.musicSearch
  if (!api) return

  text = text?.trim()
  if (!text) {
    resetListInfo(type)
    return
  }
  info.limit = PAGE_SIZE
  const key = `${id}__${type}__${text}__${page}`
  if (info.key === key && info.list.length) return

  info.noItemLabel = t('list__loading')
  info.key = key
  try {
    const res = await api[METHOD_NAME[type]](text, page, PAGE_SIZE)
    if (info.key !== key) return
    setList(type, res.list)
    info.total = res.total
    info.maxPage = res.allPage
    info.page = page
    info.noItemLabel = res.list.length ? '' : t('no_item')
  } catch (err) {
    if (info.key !== key) return
    console.log(`[search] ${type}`, err)
    resetListInfo(type)
    info.noItemLabel = t('list__load_failed')
    throw err
  }
}
