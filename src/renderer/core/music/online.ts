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
    return url
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
