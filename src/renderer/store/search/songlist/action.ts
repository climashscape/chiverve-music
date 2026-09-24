import { markRawList } from '@common/utils/vueTools'
import { getPageSize } from '@common/settings/pageSize'
import music from '@renderer/utils/musicSdk'
import { appSetting } from '@renderer/store/setting'

import type { ListInfoItem } from './state'
import { listInfos, normalizeSource } from './state'

interface SearchResult {
  list: ListInfoItem[]
  limit: number
  total: number
  source: LX.OnlineSource
}


const setList = (datas: SearchResult, page: number, text: string): ListInfoItem[] => {
  let listInfo = listInfos[normalizeSource(datas.source)]
  if (!listInfo) return []
  listInfo.list = markRawList(datas.list)
  if (page == 1 || (datas.total && datas.list.length)) listInfo.total = datas.total
  else listInfo.total = datas.limit * page
  listInfo.page = page
  listInfo.limit = datas.limit
  if (text && !datas.list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

export const resetListInfo = (sourceId?: string): [] => {
  let listInfo = listInfos[normalizeSource(sourceId)]
  if (!listInfo) return []
  listInfo.page = 1
  // 每页条数现读设置（`list.pageSize`）；改前这里是写死的 20（而 state.ts 的初值是 18，两处并不一致）
  listInfo.limit = getPageSize(appSetting)
  listInfo.total = 0
  listInfo.list = []
  listInfo.key = null
  listInfo.noItemLabel = ''
  listInfo.tagId = ''
  listInfo.sortId = ''
  return []
}

export const search = async(text: string, page: number, sourceId?: string): Promise<ListInfoItem[]> => {
  const id = normalizeSource(sourceId)
  const listInfo = listInfos[id]
  if (!listInfo) return []
  if (!text) return resetListInfo(id)
  const key = `${page}__${id}__${text}`
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  // 请求用多少条就写回 listInfo.limit，分页器的页数与这里的口径保持一致
  listInfo.limit = getPageSize(appSetting)
  listInfo.noItemLabel = window.i18n.t('list__loading')
  listInfo.key = key
  return (music[id]?.songList.search(text, page, listInfo.limit).then((data: SearchResult) => {
    if (key != listInfo.key) return []
    return setList({ ...data, source: id }, page, text)
  }) ?? Promise.reject(new Error('source not found: ' + id))).catch((error: any) => {
    resetListInfo(id)
    listInfo.noItemLabel = window.i18n.t('list__load_failed')
    console.log(error)
    throw error
  })
}
