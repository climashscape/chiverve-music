/* eslint-disable @typescript-eslint/no-dynamic-delete */
import {
  saveListPositionInfo as saveListPositionInfoFromData,
  getListPositionInfo as getListPositionInfoFromData,
  saveListPrevSelectId as saveListPrevSelectIdFromData,
  getListPrevSelectId as getListPrevSelectIdFromData,
  saveListUpdateInfo as saveListUpdateInfoFromData,
  getListUpdateInfo as getListUpdateInfoFromData,
  saveSearchSetting as saveSearchSettingFromData,
  getSearchSetting as getSearchSettingFromData,
  saveSongListSetting as saveSongListSettingFromData,
  getSongListSetting as getSongListSettingFromData,
  saveLeaderboardSetting as saveLeaderboardSettingFromData,
  getLeaderboardSetting as getLeaderboardSettingFromData,
  saveViewPrevState as saveViewPrevStateFromData,
} from '@renderer/utils/ipc'
import { throttle } from '@common/utils'
import { type DEFAULT_SETTING, LIST_IDS } from '@common/constants'
import { dateFormat } from './index'
import music from '@renderer/utils/musicSdk'
import { setUpdateTime } from '@renderer/store/list/action'

let listPosition: LX.List.ListPositionInfo
let listPrevSelectId: string
let listUpdateInfo: LX.List.ListUpdateInfo

let searchSetting: typeof DEFAULT_SETTING['search']
let songListSetting: typeof DEFAULT_SETTING['songList']
let leaderboardSetting: typeof DEFAULT_SETTING['leaderboard']

const saveListPositionThrottle = throttle(() => {
  saveListPositionInfoFromData(listPosition)
}, 1000)
const saveSearchSettingThrottle = throttle(() => {
  saveSearchSettingFromData(searchSetting)
}, 1000)
const saveSongListSettingThrottle = throttle(() => {
  saveSongListSettingFromData(songListSetting)
}, 1000)
const saveLeaderboardSettingThrottle = throttle(() => {
  saveLeaderboardSettingFromData(leaderboardSetting)
}, 1000)
const saveViewPrevStateThrottle = throttle((state) => {
  saveViewPrevStateFromData(state)
}, 1000)

const initPosition = async() => {
  // eslint-disable-next-line require-atomic-updates
  listPosition ??= await getListPositionInfoFromData() ?? {}
}
export const getListPosition = async(id: string): Promise<number> => {
  await initPosition()
  return listPosition[id] ?? 0
}
export const setListPosition = async(id: string, position?: number) => {
  await initPosition()
  listPosition[id] = position ?? 0
  saveListPositionThrottle()
}
export const removeListPosition = async(id: string) => {
  await initPosition()
  if (listPosition[id] == null) return
  delete listPosition[id]
  saveListPositionThrottle()
}
export const overwriteListPosition = async(ids: string[]) => {
  await initPosition()
  const removedIds = []
  for (const id of Object.keys(listPosition)) {
    if (ids.includes(id)) continue
    removedIds.push(id)
  }
  for (const id of removedIds) delete listPosition[id]
  saveListPositionThrottle()
}

const saveListPrevSelectIdThrottle = throttle(() => {
  saveListPrevSelectIdFromData(listPrevSelectId)
}, 200)
export const getListPrevSelectId = async() => {
  // eslint-disable-next-line require-atomic-updates
  listPrevSelectId ??= await getListPrevSelectIdFromData() ?? LIST_IDS.DEFAULT
  return listPrevSelectId ?? LIST_IDS.DEFAULT
}
export const saveListPrevSelectId = (id: string) => {
  listPrevSelectId = id
  saveListPrevSelectIdThrottle()
}

const saveListUpdateInfo = throttle(() => {
  saveListUpdateInfoFromData(listUpdateInfo)
}, 1000)

const initListUpdateInfo = async() => {
  if (listUpdateInfo == null) {
    // eslint-disable-next-line require-atomic-updates
    listUpdateInfo = await getListUpdateInfoFromData() ?? {}
    for (const [id, info] of Object.entries(listUpdateInfo)) {
      setUpdateTime(id, info.updateTime ? dateFormat(info.updateTime) : '')
    }
  }
}
export const getListUpdateInfo = async() => {
  await initListUpdateInfo()
  return listUpdateInfo
}
export const setListUpdateInfo = async(info: LX.List.ListUpdateInfo) => {
  await initListUpdateInfo()
  listUpdateInfo = info
  saveListUpdateInfo()
}
export const setListAutoUpdate = async(id: string, enable: boolean) => {
  await initListUpdateInfo()
  const targetInfo = listUpdateInfo[id] ?? { updateTime: 0, isAutoUpdate: false }
  targetInfo.isAutoUpdate = enable
  listUpdateInfo[id] = targetInfo
  saveListUpdateInfo()
}
export const setListUpdateTime = async(id: string, time: number) => {
  await initListUpdateInfo()
  const targetInfo = listUpdateInfo[id] ?? { updateTime: 0, isAutoUpdate: false }
  targetInfo.updateTime = time
  listUpdateInfo[id] = targetInfo
  saveListUpdateInfo()
}
// export const setListUpdateInfo = (id, { updateTime, isAutoUpdate }) => {
//   listUpdateInfo[id] = { updateTime, isAutoUpdate }
//   saveListUpdateInfo()
// }
export const removeListUpdateInfo = async(id: string) => {
  await initListUpdateInfo()
  if (listUpdateInfo[id] == null) return
  delete listUpdateInfo[id]
  saveListUpdateInfo()
}
export const overwriteListUpdateInfo = async(ids: string[]) => {
  await initListUpdateInfo()
  const removedIds = []
  for (const id of Object.keys(listUpdateInfo)) {
    if (ids.includes(id)) continue
    removedIds.push(id)
  }
  for (const id of removedIds) delete listUpdateInfo[id]
  saveListUpdateInfo()
}


/**
 * 把持久化数据里的源归一到"当前已注册的源"。
 *
 * 实测（2026-09-22）：单源化之后 `LxDatas/data.json` 里仍留着 `temp_source: 'kw'`，
 * 而 `music['kw']` 已不存在 —— 搜索联想那类 `music[source].xxx` 的查找会拿到 undefined 并
 * **静默失败**（错误被 .catch 吞掉，表现为"功能没反应"）。所以在数据出口统一归一，
 * 而不是在每个消费者里各自判空。加源时本函数自动跟随源注册表。
 */
const pickRegisteredSource = (source?: string | null): LX.OnlineSource => {
  const ids = music.sources.map(item => item.id) as LX.OnlineSource[]
  return ids.includes(source as LX.OnlineSource) ? source as LX.OnlineSource : (ids[0] ?? 'tx')
}

export const getSearchSetting = async() => {
  // eslint-disable-next-line require-atomic-updates
  searchSetting ??= await getSearchSettingFromData()
  const source = pickRegisteredSource(searchSetting.source)
  const tempSource = pickRegisteredSource(searchSetting.temp_source)
  if (source !== searchSetting.source || tempSource !== searchSetting.temp_source) {
    void setSearchSetting({ source, temp_source: tempSource })
  }
  return { ...searchSetting }
}
export const setSearchSetting = async(setting: Partial<typeof DEFAULT_SETTING['search']>) => {
  if (!searchSetting) await getSearchSetting()
  let requiredSave = false
  if (setting.source && searchSetting.source != setting.source) requiredSave = true
  if (setting.type && searchSetting.type != setting.type) requiredSave = true
  if (setting.temp_source && searchSetting.temp_source != setting.temp_source) requiredSave = true

  if (!requiredSave) return
  searchSetting = Object.assign(searchSetting, setting)
  saveSearchSettingThrottle()
}

export const getSongListSetting = async() => {
  // eslint-disable-next-line require-atomic-updates
  songListSetting ??= await getSongListSettingFromData()
  const source = pickRegisteredSource(songListSetting.source)
  if (source !== songListSetting.source) void setSongListSetting({ source })
  return { ...songListSetting }
}
export const setSongListSetting = async(setting: Partial<typeof DEFAULT_SETTING['songList']>) => {
  if (!songListSetting) await getSongListSetting()
  songListSetting = Object.assign(songListSetting, setting)
  saveSongListSettingThrottle()
}

export const getLeaderboardSetting = async() => {
  // eslint-disable-next-line require-atomic-updates
  leaderboardSetting ??= await getLeaderboardSettingFromData()
  return { ...leaderboardSetting }
}
export const setLeaderboardSetting = async(setting: Partial<typeof DEFAULT_SETTING['leaderboard']>) => {
  if (!leaderboardSetting) await getLeaderboardSetting()
  leaderboardSetting = Object.assign(leaderboardSetting, setting)
  saveLeaderboardSettingThrottle()
}

export const saveViewPrevState = (state: typeof DEFAULT_SETTING['viewPrevState']) => {
  saveViewPrevStateThrottle(state)
}
