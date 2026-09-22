import { markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'

import { listInfos, normalizeSource } from './state'

interface SearchResult {
  list: LX.Music.MusicInfo[]
  allPage: number
  limit: number
  total: number
  source: LX.OnlineSource
}


const setList = (datas: SearchResult, page: number, text: string): LX.Music.MusicInfo[] => {
  let listInfo = listInfos[normalizeSource(datas.source)]!
  listInfo.list = deduplicationList(datas.list.map(s => markRaw(toNewMusicInfo(s))))
  if (page == 1 || (datas.total && datas.list.length)) listInfo.total = datas.total
  else listInfo.total = datas.limit * page
  listInfo.maxPage = datas.allPage
  listInfo.page = page
  listInfo.limit = datas.limit
  if (text && !datas.list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

export const resetListInfo = (sourceId?: string): [] => {
  let listInfo = listInfos[normalizeSource(sourceId)]
  if (!listInfo) return []
  listInfo.list = []
  listInfo.page = 0
  listInfo.maxPage = 0
  listInfo.total = 0
  listInfo.noItemLabel = ''
  return []
}

export const search = async(text: string, page: number, sourceId?: string): Promise<LX.Music.MusicInfo[]> => {
  const id = normalizeSource(sourceId)
  const listInfo = listInfos[id]!
  if (!text) return resetListInfo(id)
  const key = `${page}__${text}`
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  listInfo.noItemLabel = window.i18n.t('list__loading')
  listInfo.key = key
  return music[id].musicSearch.search(text, page, listInfo.limit).then((data: SearchResult) => {
    if (key != listInfo.key) return []
    return setList({ ...data, source: id }, page, text)
  }).catch((error: any) => {
    resetListInfo(id)
    listInfo.noItemLabel = window.i18n.t('list__load_failed')
    console.log(error)
    throw error
  })
}
