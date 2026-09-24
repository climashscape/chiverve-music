import { onBeforeRouteLeave } from '@common/utils/vueRouter'
import { ref, nextTick } from '@common/utils/vueTools'
import { getPageSize } from '@common/settings/pageSize'
import { addHistoryWord } from '@renderer/store/search/action'
// import { useI18n } from '@renderer/plugins/i18n'
// import { } from '@renderer/store/search/state'
import type { SearchListInfo, ListInfoItem } from '@renderer/store/search/songlist'
import { search as searchSongList, listInfos, normalizeSource } from '@renderer/store/search/songlist'
import { appSetting } from '@renderer/store/setting'

export type SearchSource = LX.OnlineSource | 'all'

export default () => {
  const listRef = ref<any>(null)

  // 首帧占位：第一次搜索时会被 store 里那份 ListInfo 顶掉（见下面的 search），
  // 每页条数则由 store 的取数现读设置（`list.pageSize`）
  const listInfo = ref<SearchListInfo>({
    page: 1,
    limit: getPageSize(appSetting),
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
    tagId: '',
    sortId: '',
  })

  const search = (text: string, source: SearchSource, page: number) => {
    // console.log(text, source, page)
    listInfo.value = listInfos[normalizeSource(source)] as SearchListInfo
    if (text.length) void addHistoryWord(text)
    void searchSongList(text, page, source).then((list: ListInfoItem[]) => {
      // console.log(list)
      if (listInfo.value.key == window.lx.songListInfo.searchKey && window.lx.songListInfo.searchPosition) {
        void nextTick(() => {
          listRef.value?.scrollTo(window.lx.songListInfo.searchPosition)
        })
      } else if (list.length && listRef.value) {
        window.lx.songListInfo.searchKey = null
        void nextTick(() => {
          listRef.value.scrollTo(0)
        })
      }
    })
  }

  onBeforeRouteLeave(() => {
    window.lx.songListInfo.searchKey = listInfo.value.key
    if (listRef.value) window.lx.songListInfo.searchPosition = listRef.value.getScrollTop()
  })


  return {
    listRef,
    listInfo,
    search,
  }
}
