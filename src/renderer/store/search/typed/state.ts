import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

/**
 * 搜索页「歌手 / 专辑 / MV」三类结果的状态（工单 10）。
 *
 * 与 `store/search/music`（歌曲）分开，因为**三类的条目形状与渲染方式都不一样**，
 * 共用一份 ListInfo 只会得到一堆 `any`。源仍然只有 tx（见 `LX.OnlineSource`），
 * 但这里的 key 是「类型」——三类各自翻页、互不干扰。
 *
 * 数据层复用同一个端点（`DoSearchForQQMusicDesktop` 换 `search_type`），
 * 见 `musicSdk/tx/musicSearch.js` 的 `searchSinger/searchAlbum/searchMv`。
 */

export type TypedSearchType = 'singer' | 'album' | 'mv'

export const TYPED_SEARCH_TYPES: TypedSearchType[] = ['singer', 'album', 'mv']

export declare interface ListInfo {
  list: any[]
  total: number
  page: number
  maxPage: number
  limit: number
  /** 竞态键：`${类型}__${关键词}__${页码}`，回来先比它（见 action.ts） */
  key: string | null
  noItemLabel: string
}

const createListInfo = (): ListInfo => reactive<ListInfo>({
  page: 1,
  maxPage: 1,
  limit: 30,
  total: 0,
  list: markRaw([]),
  key: null,
  noItemLabel: '',
})

export const listInfos: Record<TypedSearchType, ListInfo> = {
  singer: createListInfo(),
  album: createListInfo(),
  mv: createListInfo(),
}

/** 每页条数：卡片网格一行 6 张（宽屏）到 3 张（窄屏），30 条足够铺几屏。 */
export const PAGE_SIZE = 30

/** 源只可能是 tx；这里与 `store/search/music` 同款，保证加源时这里也不用改。 */
export const sources: LX.OnlineSource[] = markRaw(music.sources.map(s => s.id as LX.OnlineSource))
export const normalizeSource = (source?: string): LX.OnlineSource => {
  return sources.includes(source as LX.OnlineSource) ? source as LX.OnlineSource : sources[0]
}
