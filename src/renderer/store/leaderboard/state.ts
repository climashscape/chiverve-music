import { reactive, markRaw, shallowReactive } from '@common/utils/vueTools'
import { getPageSize } from '@common/settings/pageSize'
import music from '@renderer/utils/musicSdk'
import { appSetting } from '@renderer/store/setting'

export type Source = LX.OnlineSource

export const sources: LX.OnlineSource[] = markRaw([])

for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.leaderboard?.getBoards) continue
  sources.push(source.id as LX.OnlineSource)
}

export interface BoardItem {
  id: string
  name: string
  bangid: string
}
export interface Board {
  list: BoardItem[]
  source: LX.OnlineSource
}
type Boards = Partial<Record<LX.OnlineSource, Board>>

export const boards = shallowReactive<Boards>({})

export interface ListDetailInfo {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  source: LX.OnlineSource | null
  limit: number
  key: string | null
  id: string
  noItemLabel: string
}

export const listDetailInfo = reactive<ListDetailInfo>({
  list: [],
  total: 0,
  page: 1,
  // 只当首帧占位：排行榜的取数是「一次拿整榜」（数据层 `leaderboard.js` 的 `limit: 300`），
  // 落库后这里会被服务端回的 limit 覆盖（见 action.ts 的 setListDetail）。取值来源仍是设置
  limit: getPageSize(appSetting),
  key: null,
  source: null,
  id: '',
  noItemLabel: '',
})

