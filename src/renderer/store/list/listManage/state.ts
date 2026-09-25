import { LIST_IDS } from '@common/constants'
import { markRaw, reactive } from '@common/utils/vueTools'

export const allMusicList: Map<string, LX.Music.MusicInfo[]> = markRaw(new Map())

// 「试听列表」（`LIST_IDS.DEFAULT`）的数据层已删除（票 08：库里真删旧行、同步与备份格式里都不再存在），
// 所以这里没有它对应的 listInfo；界面上的固定列表只剩收藏与临时列表两条。
export const loveList = markRaw<LX.List.MyLoveListInfo>({
  id: LIST_IDS.LOVE,
  name: 'list__name_love',
  // name: '我的收藏',
})
export const tempList = markRaw<LX.List.MyTempListInfo>({
  id: LIST_IDS.TEMP,
  name: '临时列表',
  meta: {},
})

export const userLists: LX.List.UserListInfo[] = reactive([])
