import { reactive, markRaw, shallowReactive } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

export interface SortInfo {
  name: string
  id: string
}

export const sources: LX.OnlineSource[] = markRaw([])
export const sortList = markRaw<Partial<Record<LX.OnlineSource, SortInfo[]>>>({})

for (const source of music.sources) {
  const songList = music[source.id as LX.OnlineSource]?.songList
  if (!songList) continue
  sources.push(source.id as LX.OnlineSource)
  // id 统一成字符串：各源排序 ID 有数字有字符串，而 store 里 sortId 一路是字符串
  // （tx 的模块自己对 id 做 parseInt，见 tx/songList.js:38）
  sortList[source.id as LX.OnlineSource] = songList.sortList.map(item => ({ name: item.name, id: String(item.id) }))
}

export interface TagInfoItem<T extends LX.OnlineSource = LX.OnlineSource> {
  parent_id: string
  parent_name: string
  id: string
  name: string
  source: T
}
export interface TagInfoTypeItem<T extends LX.OnlineSource = LX.OnlineSource> {
  name: string
  list: Array<TagInfoItem<T>>
}
export interface TagInfo<Source extends LX.OnlineSource = LX.OnlineSource> {
  tags: Array<TagInfoTypeItem<Source>>
  hotTag: Array<TagInfoItem<Source>>
  source: Source
}

type Tags = Partial<Record<LX.OnlineSource, TagInfo>>

export const tags = shallowReactive<Tags>({})


export interface ListInfoItem {
  play_count: string
  id: string
  author: string
  name: string
  time?: string
  img: string
  // grade: basic.favorcnt / 10,
  desc: string | null
  source: LX.OnlineSource
  total?: string
}
export interface ListInfo {
  list: ListInfoItem[]
  total: number
  page: number
  limit: number
  key: string | null
  noItemLabel: string
  source?: LX.OnlineSource
  tagId: string
  sortId: string
}

export interface ListDetailInfo {
  list: LX.Music.MusicInfoOnline[]
  source: LX.OnlineSource
  desc: string | null
  total: number
  page: number
  limit: number
  key: string | null
  id: string
  info: {
    name?: string
    img?: string
    desc?: string
    author?: string
    play_count?: string
  }
  noItemLabel: string
}

export const listInfo = reactive<ListInfo>({
  list: [],
  total: 0,
  page: 1,
  limit: 30,
  key: null,
  noItemLabel: '',
  source: 'tx',
  tagId: '',
  sortId: '',
})

export const listDetailInfo = reactive<ListDetailInfo>({
  list: [],
  id: '',
  desc: null,
  total: 0,
  page: 1,
  limit: 30,
  key: null,
  source: 'tx',
  info: {},
  noItemLabel: '',
})

export const selectListInfo = markRaw<ListInfoItem>({
  play_count: '',
  id: '',
  author: '',
  name: '',
  time: '',
  img: '',
  // grade: basic.favorcnt / 10,
  desc: '',
  source: 'tx',
})

export const openSongListInputInfo = markRaw({
  text: '',
  source: '',
})
