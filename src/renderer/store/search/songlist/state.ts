import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

import { type ListInfo } from '@renderer/store/songList/state'

export type { ListInfoItem } from '@renderer/store/songList/state'

export const sources: LX.OnlineSource[] = markRaw([])

export type SearchListInfo = Omit<ListInfo, 'source'>

/** 在线源只有 tx（见 LX.OnlineSource 的说明）；按源存放的结构保留（加源时不用改本文件）。 */
type ListInfos = Partial<Record<LX.OnlineSource, SearchListInfo>>

export const listInfos: ListInfos = markRaw<ListInfos>({})
export const maxPages: Partial<Record<LX.OnlineSource, number>> = {}

for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.songList?.search) continue
  sources.push(source.id as LX.OnlineSource)
  listInfos[source.id as LX.OnlineSource] = reactive<SearchListInfo>({
    page: 1,
    limit: 18,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
    tagId: '',
    sortId: '',
  })
  maxPages[source.id as LX.OnlineSource] = 0
}

/**
 * 视图传进来的 source 可能是历史值（旧 `'all'` 聚合，或已移除的源）——
 * 统一落到已注册源，避免 listInfos[source] 取到 undefined。
 */
export const normalizeSource = (source?: string): LX.OnlineSource => {
  if (sources.includes(source as LX.OnlineSource)) return source as LX.OnlineSource
  return (sources[0] ?? music.sources[0]?.id) as LX.OnlineSource
}
