import { reactive, ref, shallowReactive } from '@common/utils/vueTools'

/**
 * 账号中心（我的音乐，M4）的渲染侧状态。
 *
 * 结构照仓库惯例：`state.ts` 只放状态与接口，取数在 `action.ts`。
 * 列表用 `shallowReactive` 防深度代理（§2.10 的响应式纪律），歌曲列表另有
 * `markRawList` 处理。
 */

export interface UserProfile {
  name: string
  avatar: string
  bigAvatar: string
  isSinger: boolean
  fans: number
  follow: number
  friends: number
  visitor: number
}

export interface VipInfo {
  canRenew: boolean
  hires: boolean
  dolby: boolean
  maxSongNum: number
  maxDirNum: number
}

/** 歌单/专辑卡片（对齐 store/songList 的 ListInfoItem，便于复用卡片组件）。 */
export interface PlaylistCard {
  id: string
  /** QQ 歌单目录 id（「我喜欢」= 201）；收藏歌单没有这个字段。 */
  dirId?: string
  name: string
  img: string
  author: string
  total?: string
  time?: string
  desc: string | null
  source: LX.OnlineSource
}

export interface FollowSinger {
  id: string
  name: string
  img: string
  desc: string
  fans: number
  source: LX.OnlineSource
}

export interface GeneItem {
  id: string
  name: string
  img: string
  slogan: string
}

export const profile = reactive<UserProfile>({
  name: '',
  avatar: '',
  bigAvatar: '',
  isSinger: false,
  fans: 0,
  follow: 0,
  friends: 0,
  visitor: 0,
})

export const vip = reactive<VipInfo>({
  canRenew: false,
  hires: false,
  dolby: false,
  maxSongNum: 0,
  maxDirNum: 0,
})

export const musicGene = reactive<{
  nick: string
  avatar: string
  mainDescription: string
  singers: GeneItem[]
  genres: GeneItem[]
}>({
  nick: '',
  avatar: '',
  mainDescription: '',
  singers: [],
  genres: [],
})

/** 我喜欢：分页拉取（QQ 的 dirid=201 目录）。 */
export const favSongs = reactive<{
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
}>({
  list: [],
  total: 0,
  page: 1,
  limit: 50,
  noItemLabel: '',
})

export const createdLists = shallowReactive<PlaylistCard[]>([])
export const favLists = shallowReactive<PlaylistCard[]>([])
export const favAlbums = shallowReactive<PlaylistCard[]>([])
export const followSingers = shallowReactive<FollowSinger[]>([])

/** 每页条数：QQ 这几个接口都按 offset/size 分页。 */
export const PAGE_SIZE = 50

/** 云端歌单取歌的每页条数（`CgiGetDiss` 的 `song_num`）。 */
export const CLOUD_LIST_PAGE_SIZE = 30

/**
 * 「我的歌单」页里选中的**云端自建歌单**的歌曲（工单 06）。
 * 与 `favSongs`（我喜欢，dirId=201）分开存：两者来源不同、翻页参数也不同。
 */
export const cloudListSongs = reactive<{
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  limit: number
  noItemLabel: string
  /** 当前这份数据属于哪个歌单（切换时用来丢弃迟到的响应） */
  dirId: string
}>({
  list: [],
  total: 0,
  page: 1,
  limit: CLOUD_LIST_PAGE_SIZE,
  noItemLabel: '',
  dirId: '',
})

/** 各区块的加载/失败文案（§2.11 的三段式：loading → 数据 → 失败文案）。 */
export const labels = reactive<Record<'profile' | 'musicGene' | 'favSongs' | 'createdLists' | 'favLists' | 'favAlbums' | 'followSingers', string>>({
  profile: '',
  musicGene: '',
  favSongs: '',
  createdLists: '',
  favLists: '',
  favAlbums: '',
  followSingers: '',
})

export const isInited = ref(false)
export const isLoading = ref(false)

/** 分页游标（收藏歌单 161 条、收藏专辑 445 条这种量级，要能"加载更多"）。 */
export const pagers = reactive({
  favLists: { page: 1, hasMore: false },
  favAlbums: { page: 1, hasMore: false },
  followSingers: { page: 1, hasMore: false },
})
