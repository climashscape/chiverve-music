
import { throttle } from '@common/utils/common'
import { getSearchHistoryMaxNum, nextHistoryList } from '@common/settings/searchHistory'
import { toRaw } from '@common/utils/vueTools'
import {
  getSearchHistoryList,
  saveSearchHistoryList,
} from '@renderer/utils/ipc'
import { appSetting } from '../setting'
import { searchText, historyList } from './state'


export const setSearchText = (text: string) => {
  searchText.value = text
}

let isInitedSearchHistory = false
const saveSearchHistoryListThrottle = throttle((list: LX.List.SearchHistoryList) => {
  saveSearchHistoryList(list)
}, 500)


export const getHistoryList = async() => {
  if (isInitedSearchHistory || historyList.length) return
  historyList.push(...(await getSearchHistoryList() ?? []))
  isInitedSearchHistory ||= true
}
export const addHistoryWord = async(word: string) => {
  if (!appSetting['search.isShowHistorySearch']) return
  // 条数上限（`search.historyMaxNum`，0 = 不记历史）：总闸是上面的 isShowHistorySearch，这里是条数闸。
  // 上限为 0 时直接返回，不动已有历史（「不记」不等于「清空」，清空有独立入口）
  const maxNum = getSearchHistoryMaxNum(appSetting)
  if (maxNum < 1) return
  if (!isInitedSearchHistory) await getHistoryList()
  let index = historyList.indexOf(word)
  if (index == 0) return
  // 置顶 + 去重 + 截断三步都在纯函数里（规则与量程见 common/settings/searchHistory.ts，单测覆盖）；
  // 整体替换而不是就地 splice，是为了让「列表内容只由纯函数决定」这件事在代码里看得出来
  historyList.splice(0, historyList.length, ...nextHistoryList(historyList, word, maxNum))
  saveSearchHistoryListThrottle(toRaw(historyList))
}
export const removeHistoryWord = (index: number) => {
  historyList.splice(index, 1)
  saveSearchHistoryListThrottle(toRaw(historyList))
}
export const clearHistoryList = (id: string) => {
  historyList.splice(0, historyList.length)
  saveSearchHistoryList([])
}
