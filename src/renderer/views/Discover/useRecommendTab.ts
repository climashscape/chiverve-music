import { markRawList, reactive, ref } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import type { ListInfo, ListInfoItem } from '@renderer/store/songList/state'

/**
 * 发现页 → 歌单 Tab 取数：推荐歌单。
 *
 * 每页条数的理由：歌单卡片组件是 `width: 32%` 的方形卡（每行 3 张），9 条正好 3 行，
 * 与面板里给它的固定高度配平——那个组件内部是绝对定位 + 自滚动，父级必须给确定高度，
 * 条数一多就会变成「盒子内滚动条」。
 */

const t = (key: string) => window.i18n.t(key as any)

const RECOMMEND_PAGE_SIZE = 9

const recommend = reactive<{ listInfo: ListInfo, isLoading: boolean }>({
  listInfo: {
    list: [],
    total: 0,
    page: 1,
    limit: RECOMMEND_PAGE_SIZE,
    key: null,
    noItemLabel: '',
    source: 'tx',
    tagId: '',
    sortId: '',
  },
  isLoading: false,
})
let recommendKey = ''
const isInited = ref(false)

/** 推荐歌单。`total` 是服务端给的「最多能给到多少」（实测恒 400），只配当分页器的 count。 */
const loadRecommend = async(page = 1) => {
  const key = `recommend__${page}`
  recommendKey = key
  recommend.isLoading = true
  recommend.listInfo.noItemLabel = t('list__loading')
  try {
    const res = await music.tx.recommend.getRecommendSonglist(page, RECOMMEND_PAGE_SIZE)
    if (recommendKey !== key) return
    const list = (res?.list ?? []) as ListInfoItem[]
    recommend.listInfo.list = markRawList(list)
    recommend.listInfo.total = Number(res?.total ?? list.length)
    recommend.listInfo.page = page
    recommend.listInfo.limit = RECOMMEND_PAGE_SIZE
    recommend.listInfo.key = key
    recommend.listInfo.noItemLabel = list.length ? '' : t('no_item')
  } catch (err: any) {
    if (recommendKey !== key) return
    console.log('[discover] recommend', err)
    recommend.listInfo.list = []
    recommend.listInfo.total = 0
    recommend.listInfo.noItemLabel = err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')
  } finally {
    recommend.isLoading = false
  }
}

/** 进歌单 Tab 时跑一次（懒加载：不切到这个 Tab 就不打这个请求）。 */
const initRecommendTab = async() => {
  if (isInited.value) return
  isInited.value = true
  await loadRecommend(1)
}

export default () => {
  return {
    recommend,
    initRecommendTab,
    loadRecommend,
  }
}
