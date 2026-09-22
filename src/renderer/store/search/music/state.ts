import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

export declare interface ListInfo {
  list: LX.Music.MusicInfo[]
  total: number
  page: number
  maxPage: number
  limit: number
  key: string | null
  noItemLabel: string
}

/**
 * 在线源只有 tx（见 LX.OnlineSource 的说明）。
 *
 * 这里仍按"每个源一份 ListInfo"存放——这是**加源时不用改动的结构**：新源只要在
 * musicSdk 注册表里出现，本文件与 action.ts 就自动多出一份列表状态。
 */
type ListInfos = Partial<Record<LX.OnlineSource, ListInfo>>

export const sources: LX.OnlineSource[] = markRaw([])

export const listInfos: ListInfos = markRaw<ListInfos>({})

export const maxPages: Partial<Record<LX.OnlineSource, number>> = {}

for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.musicSearch) continue
  sources.push(source.id as LX.OnlineSource)
  listInfos[source.id as LX.OnlineSource] = reactive<ListInfo>({
    page: 1,
    maxPage: 0,
    limit: 30,
    total: 0,
    list: [],
    key: '',
    noItemLabel: '',
  })
  maxPages[source.id as LX.OnlineSource] = 0
}

/**
 * 视图传进来的 source 可能是历史值（旧版本的 `'all'` 聚合，或已移除的源）——
 * 统一落到已注册的第一个源，避免 listInfos[source] 取到 undefined。
 */
export const normalizeSource = (source?: string): LX.OnlineSource => {
  return sources.includes(source as LX.OnlineSource) ? source as LX.OnlineSource : sources[0]
}
