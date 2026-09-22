import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

/**
 * 热搜词 store。在线源只有 tx（见 LX.OnlineSource 的说明）——这里的 `'all'` 聚合
 * 已随多源移除：现在 `Source` 就是已注册的源本身。将来加源时本文件不需要改，
 * 按源存放的结构保留着。
 */
export type Source = LX.OnlineSource

export const sources: Source[] = markRaw([])

export const sourceList: Partial<Record<LX.OnlineSource, string[]>> = markRaw<Partial<Record<LX.OnlineSource, string[]>>>({})

for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.hotSearch) continue
  sources.push(source.id as LX.OnlineSource)
  sourceList[source.id as LX.OnlineSource] = reactive<string[]>([])
}

const setList = (source: LX.OnlineSource, list: string[]): string[] => {
  return sourceList[source] = list.slice(0, 20)
}

/** 历史值（旧 `'all'` 或已移除的源）统一落到已注册源。 */
export const normalizeSource = (source?: string): LX.OnlineSource => {
  if (sources.includes(source as LX.OnlineSource)) return source as LX.OnlineSource
  return (sources[0] ?? music.sources[0]?.id) as LX.OnlineSource
}

export const getList = async(source?: string): Promise<string[]> => {
  const id = normalizeSource(source)
  const cached = sourceList[id]
  if (cached?.length) return cached
  if (!music[id]?.hotSearch) {
    setList(id, [])
    return Promise.resolve([])
  }
  return music[id].hotSearch.getList().then(data => setList(id, data.list)).catch((err: any) => {
    console.log(err)
    setList(id, [])
    return []
  })
}

export const clearList = (source?: string) => {
  const id = normalizeSource(source)
  sourceList[id] = []
}
