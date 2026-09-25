import { updateListMusics } from '@renderer/store/list/action'
import { appSetting } from '@renderer/store/setting'
import {
  saveLyric,
  saveMusicUrl,
  getMusicUrl as getStoreMusicUrl,
  removeMusicUrl,
} from '@renderer/utils/ipc'
import {
  buildLyricInfo,
  getPlayQuality,
  handleGetOnlineLyricInfo,
  handleGetOnlineMusicUrl,
  handleGetOnlinePicUrl,
  getCachedLyricInfo,
} from './utils'
import { clearUnavailable, isUnavailableError, markUnavailable } from './unavailable'

/* export const setMusicUrl = ({ musicInfo, type, url }: {
  musicInfo: LX.Music.MusicInfo
  type: LX.Quality
  url: string
}) => {
  saveMusicUrl(musicInfo, type, url)
}

export const setPic = (datas: {
  listId: string
  musicInfo: LX.Music.MusicInfo
  url: string
}) => {
  datas.musicInfo.img = datas.url
  updateMusicInfo({
    listId: datas.listId,
    id: datas.musicInfo.songmid,
    data: { img: datas.url },
    musicInfo: datas.musicInfo,
  })
}
 */


/**
 * 在线取流。**失效曲的登记点**（工单 01）：
 *
 * 只有「所有档位都问过、服务端一个直链都没给」这一种失败才登记（判据见 `./unavailable.ts`），
 * 网络抖动 / 限流 / 未登录 / 无权限一律不登记——它们与「这首歌有没有版权」无关。
 * 真取到流就撤销登记（服务端恢复、或判据误判时，界面能自己恢复可点）。
 *
 * 这里同时也是「预加载」与「下载」的取流入口（`usePreloadNextMusic` / `store/download`）：
 * 预加载跑在**本曲快播完、下一首即将上场**的时点，登记它等同「队列已经推到这首了」，
 * 所以不改判据；下载拿到同样的结论也一样（取不到 128k 即真的播不了）。
 */
export const getMusicUrl = async({ musicInfo, quality, isRefresh }: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
}): Promise<string> => {
  // if (!musicInfo._types[type]) {
  //   // 兼容旧版酷我源搜索列表过滤128k音质的bug
  //   if (!(musicInfo.source == 'kw' && type == '128k')) throw new Error('该歌曲没有可播放的音频')

  //   // return Promise.reject(new Error('该歌曲没有可播放的音频'))
  // }
  const targetQuality = quality ?? getPlayQuality(appSetting['player.playQuality'], musicInfo)
  const cachedUrl = await getStoreMusicUrl(musicInfo, targetQuality)
  if (cachedUrl && !isRefresh) return cachedUrl

  // 走到这里说明调用方要求**重新取流**（`isRefresh`），而它的由来都是「这条 URL 没播成」：
  // 播放出错重试、加载超时刷新、预加载时 `checkMusicUrl` 判定打不开（usePlayEvent / usePreloadNextMusic）。
  // 那就把缓存里这条已知打不开的行删掉再取新流——否则取流失败时它仍留在表里，下次播放又先失败一次
  // 才刷新。删的只有刚查到的那一条（key = `${id}_${档位}`，即取流要用的 key），不动别的行、更不动列表数据。
  // 必须 await：先删后取，新行写回时不会被这次删除误删（反过来会有「新行刚写就被删」的竞态）。
  if (cachedUrl) await removeMusicUrl([`${musicInfo.id}_${targetQuality}`])

  return handleGetOnlineMusicUrl({ musicInfo, quality, isRefresh }).then(({ url, quality: targetQuality }) => {
    void saveMusicUrl(musicInfo, targetQuality, url)
    // 取到过就撤销「失效」标记（表只对登记那一刻成立）
    clearUnavailable(musicInfo.id)
    return url
  }).catch((err) => {
    if (isUnavailableError(err)) {
      // 无版权 / 已下架：登记成失效曲，界面据此置灰、点不动，连播据此跳过（见 core/player/action.ts）
      console.warn(`[unavailable] ${musicInfo.id} 取流结论：不可播（${err.message}）`)
      markUnavailable(musicInfo.id)
    }
    throw err
  })
}

export const getPicUrl = async({ musicInfo, listId, isRefresh }: {
  musicInfo: LX.Music.MusicInfoOnline
  listId?: string | null
  isRefresh: boolean
}): Promise<string> => {
  if (musicInfo.meta.picUrl && !isRefresh) return musicInfo.meta.picUrl
  return handleGetOnlinePicUrl({ musicInfo, isRefresh }).then(({ url }) => {
    // picRequest = null
    if (listId) {
      musicInfo.meta.picUrl = url
      void updateListMusics([{ id: listId, musicInfo }])
    }
    // savePic({ musicInfo, url, listId })
    return url
  })
}
export const getLyricInfo = async({ musicInfo, isRefresh }: {
  musicInfo: LX.Music.MusicInfoOnline
  isRefresh: boolean
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  // lrcRequest = music[musicInfo.source].getLyric(musicInfo)
  return handleGetOnlineLyricInfo({ musicInfo, isRefresh }).then(async({ lyricInfo }) => {
    // lrcRequest = null
    void saveLyric(musicInfo, lyricInfo)

    return buildLyricInfo(lyricInfo)
  })
}
