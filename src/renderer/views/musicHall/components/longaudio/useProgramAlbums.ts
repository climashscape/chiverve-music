import { computed, markRawList, reactive } from '@common/utils/vueTools'
import { getPageSize } from '@common/settings/pageSize'
import music from '@renderer/utils/musicSdk'
import { appSetting } from '@renderer/store/setting'

/**
 * 乐馆 → 有声节目 Tab 的取数（2026-09-26）。
 *
 * 数据来自 `tx/longAudio.js`（两个入口：feed 的「热门节目」楼层、`search_type=15` 搜索），
 * 单集与播放**不在这一层**——点专辑卡片进既有 `/album` 页，那里既有的数据层早已按
 * `songList[].songInfo` 解包（见 `tx/album.js` 文件头第 4 条），播放走既有取流。
 *
 * 状态放在**模块级**（与 `store/mv` 同样的理由）：乐馆的 Tab 是 `v-if` 懒挂载，
 * 切走再回来不该重打一次请求。首次进入由面板触发 `loadHot()`（`hot.loaded` 兜住重复）。
 */

const t = (key: string) => window.i18n.t(key as any)

export interface ProgramAlbum {
  id: string
  mid: string
  name: string
  img: string
  singer: string
  /** 集数（只有搜索结果带；feed 卡片没有 → 0 表示未知） */
  total: number
  /** 播放量（只有 feed 卡片带；搜索结果是 0） */
  playCount: number
  publishDate: string
  source: string
}

/** 失败文案与 `views/Album/useAlbum.ts` 同一套判据（数据层不导出错误码，只能认 message）。 */
const errorLabel = (err: any) => {
  if (err?.message === 'QQ 音乐未登录') return t('user_center__need_login')
  return t('list__load_failed')
}

const hot = reactive<{
  list: ProgramAlbum[]
  loaded: boolean
  isLoading: boolean
  noItemLabel: string
}>({
  list: [],
  loaded: false,
  isLoading: false,
  noItemLabel: '',
})

const searchState = reactive<{
  keyword: string
  list: ProgramAlbum[]
  page: number
  limit: number
  total: number
  hasMore: boolean
  isLoading: boolean
  /** 当前列表是不是搜索结果（决定标题与「返回热门」键的显隐） */
  active: boolean
  noItemLabel: string
}>({
  keyword: '',
  list: [],
  page: 1,
  // 每页条数走设置（`list.pageSize` 的唯一取值口）；首帧占位，真正每页拉多少在取数时现读
  limit: getPageSize(appSetting),
  total: 0,
  hasMore: false,
  isLoading: false,
  active: false,
  noItemLabel: '',
})

/** 面板当前展示的列表：搜索态看搜索，否则看热门（**派生值**，不另存一份免得两份不同步）。 */
const visibleList = computed(() => searchState.active ? searchState.list : hot.list)

const loadHot = async() => {
  if (hot.isLoading) return
  hot.isLoading = true
  hot.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.longAudio.getHotAlbums()
    // 列表整体替换（不做深度代理，§2.10）
    hot.list = markRawList(res.list as ProgramAlbum[])
    hot.loaded = true
    hot.noItemLabel = hot.list.length ? '' : t('no_item')
  } catch (err: any) {
    console.log('[program] hot albums', err)
    hot.list = []
    hot.noItemLabel = errorLabel(err)
  } finally {
    hot.isLoading = false
  }
}

const runSearch = async(keyword: string, page = 1) => {
  const str = keyword.trim()
  searchState.keyword = keyword
  // 只在「换关键词」时清列表：加载更多要接着后面的页
  if (page === 1) {
    searchState.list = []
    searchState.total = 0
    searchState.hasMore = false
  }
  if (!str) {
    searchState.active = false
    searchState.noItemLabel = ''
    return
  }
  searchState.active = true
  searchState.isLoading = true
  searchState.noItemLabel = t('list__loading')
  // 每页条数现读设置（改完设置下次搜索 / 加载更多生效，与其余列表同口径）
  const pageSize = getPageSize(appSetting)
  try {
    const res = await music.tx.longAudio.searchAlbums(str, page, pageSize)
    const list = (page === 1 ? res.list : [...searchState.list, ...res.list]) as ProgramAlbum[]
    searchState.list = markRawList(list)
    searchState.page = page
    searchState.limit = pageSize
    searchState.total = res.total
    searchState.hasMore = res.hasMore
    searchState.noItemLabel = searchState.list.length ? '' : t('no_item')
  } catch (err: any) {
    console.log('[program] search', err)
    searchState.list = []
    searchState.total = 0
    searchState.hasMore = false
    searchState.noItemLabel = errorLabel(err)
  } finally {
    searchState.isLoading = false
  }
}

/** 点「返回热门」：退出搜索态但保留关键词（用户多半想改词再搜）。 */
const clearSearch = () => {
  searchState.active = false
  searchState.list = []
  searchState.hasMore = false
  searchState.noItemLabel = ''
}

export default () => {
  return {
    hot,
    searchState,
    visibleList,
    loadHot,
    runSearch,
    clearSearch,
    loadMore: () => { void runSearch(searchState.keyword, searchState.page + 1) },
  }
}
