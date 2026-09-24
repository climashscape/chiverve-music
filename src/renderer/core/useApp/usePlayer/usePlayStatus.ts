import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { sendPlayerStatus, onPlayerAction } from '@renderer/utils/ipc'
// import store from '@renderer/store'

import { favSongIds } from '@renderer/store/user/state'
import { loadFavSongIds, isFavSongInCloud, addFavSongToCloud, removeFavSongFromCloud, favErrorText } from '@renderer/store/user/action'
import { dialog } from '@renderer/plugins/Dialog'
import { playMusicInfo, musicInfo } from '@renderer/store/player/state'
import { throttle } from '@common/utils'
import { pause, play, playNext, playPrev } from '@renderer/core/player'
import { playProgress } from '@renderer/store/player/playProgress'
import { appSetting } from '@renderer/store/setting'
import { lyric } from '@renderer/store/player/lyric'

export default () => {
  // const setVisibleDesktopLyric = useCommit('setVisibleDesktopLyric')
  // const setLockDesktopLyric = useCommit('setLockDesktopLyric')
  let collect = false

  /** 当前播放的这一首（`progress` 包装时取里面的歌）；没在播返回 null。 */
  const getPlayMusic = () => playMusicInfo.musicInfo == null
    ? null
    : ('progress' in playMusicInfo.musicInfo ? playMusicInfo.musicInfo.metadata.musicInfo : playMusicInfo.musicInfo)

  /**
   * 收藏态（托盘 / 任务栏的图标与「取消收藏」项）现在问**云端**：本地收藏已取消
   * （2026-09-24），收藏只写 QQ「我喜欢」。
   *
   * 全量 id 集合第一次用到才拉（`loadFavSongIds` 自带缓存）；未登录/拉不动按「没收藏」
   * 处理——托盘图标不该因为取不到收藏态而影响播放链路。
   */
  const updateCollectStatus = async() => {
    const minfo = getPlayMusic()
    if (minfo != null) {
      try {
        await loadFavSongIds()
      } catch (err) {
        console.log('[collect] fav song ids', err)
      }
    }
    const status = minfo != null && isFavSongInCloud(minfo as LX.Music.MusicInfoOnline)
    if (collect == status) return false
    collect = status
    return true
  }

  /** 托盘 / 任务栏的收藏与取消收藏：写云端，失败弹出来（用户主动动作，不静默）。 */
  const handleToggleCollect = async(toCollect: boolean) => {
    const minfo = getPlayMusic()
    if (minfo == null) return
    try {
      if (toCollect) await addFavSongToCloud(minfo as LX.Music.MusicInfoOnline)
      else await removeFavSongFromCloud(minfo as LX.Music.MusicInfoOnline)
    } catch (err) {
      void dialog({ message: favErrorText(err) })
    }
    if (await updateCollectStatus()) sendPlayerStatus({ collect })
  }

  const handlePlay = () => {
    sendPlayerStatus({ status: 'playing' })
  }
  const handlePause = () => {
    sendPlayerStatus({ status: 'paused' })
  }
  const handleStop = () => {
    if (playMusicInfo.musicInfo != null) return
    sendPlayerStatus({ status: 'stoped' })
  }
  const handleError = () => {
    sendPlayerStatus({ status: 'error' })
  }
  const handleSetPlayInfo = async() => {
    await updateCollectStatus()
    sendPlayerStatus({
      collect,
      name: musicInfo.name,
      singer: musicInfo.singer,
      albumName: musicInfo.album,
      picUrl: musicInfo.pic ?? '',
      lyric: musicInfo.lrc ?? '',
      lyricLineText: '',
      lyricLineAllText: '',
    })
  }
  const handleSetLyric = () => {
    sendPlayerStatus({
      lyric: musicInfo.lrc ?? '',
      tlyric: musicInfo.tlrc ?? '',
      rlyric: musicInfo.rlrc ?? '',
      lxlyric: musicInfo.lxlrc ?? '',
      lyricLineText: '',
      lyricLineAllText: '',
    })
  }
  const handleSetPic = () => {
    sendPlayerStatus({
      picUrl: musicInfo.pic ?? '',
    })
  }
  const handleSetLyricLine = (text: string, line: number) => {
    let curLine = lyric.lines[line]?.extendedLyrics.join('\n') ?? ''
    sendPlayerStatus({
      lyricLineText: text,
      lyricLineAllText: curLine ? text + '\n' + curLine : text,
    })
  }
  // const handleSetTaskbarThumbnailClip = (clip) => {
  //   setTaskbarThumbnailClip(clip)
  // }
  // 云端「我喜欢」变了（任一入口写入/移除都会就地改 favSongIds）就把收藏态同步给托盘/任务栏。
  // 监听源要 `slice()`：favSongIds 是 shallowReactive 数组，就地增删要读一次才收得到依赖
  // （同 LocalRail.vue 监听 userLists 的写法）
  const throttleFavChange = throttle(async() => {
    if (await updateCollectStatus()) sendPlayerStatus({ collect })
  })
  // const updateSetting = () => {
  //   const setting = store.getters.setting
  //   buttons.lrc = setting.desktopLyric.enable
  //   buttons.lockLrc = setting.desktopLyric.isLock
  //   setButtons()
  // }
  const rTaskbarThumbarClick = onPlayerAction(async({ params: { action, data } }) => {
    switch (action) {
      case 'play':
        play()
        break
      case 'pause':
        pause()
        break
      case 'prev':
        void playPrev()
        break
      case 'next':
        void playNext()
        break
      case 'collect':
        void handleToggleCollect(true)
        break
      case 'unCollect':
        void handleToggleCollect(false)
        break
      case 'seek': {
        let progress = data as number
        if (progress < 0) progress = 0
        else if (progress > playProgress.maxPlayTime) progress = playProgress.maxPlayTime
        window.app_event.setProgress(progress)
        break
      }
      case 'mute':
        window.app_event.setVolumeIsMute(data as boolean)
        break
      case 'volume':
        window.app_event.setVolume(data as number)
        break
      // case 'lrc':
      //   setVisibleDesktopLyric(true)
      //   updateSetting()
      //   break
      // case 'unLrc':
      //   setVisibleDesktopLyric(false)
      //   updateSetting()
      //   break
      // case 'lockLrc':
      //   setLockDesktopLyric(true)
      //   updateSetting()
      //   break
      // case 'unlockLrc':
      //   setLockDesktopLyric(false)
      //   updateSetting()
      //   break
    }
  })
  watch(() => playProgress.nowPlayTime, (newValue, oldValue) => {
    // console.log(playProgress.nowPlayTime, newValue, oldValue)
    // if (newValue.toFixed(2) === oldValue.toFixed(2)) return
    // console.log(playProgress.nowPlayTime)
    sendPlayerStatus({ progress: newValue })
  })
  watch(() => playProgress.maxPlayTime, (newValue) => {
    sendPlayerStatus({ duration: newValue })
  })
  watch(() => appSetting['player.playbackRate'], rate => {
    sendPlayerStatus({ playbackRate: rate })
  })
  watch(() => favSongIds.slice(), throttleFavChange)

  window.app_event.on('play', handlePlay)
  window.app_event.on('pause', handlePause)
  window.app_event.on('stop', handleStop)
  window.app_event.on('error', handleError)
  window.app_event.on('musicToggled', handleSetPlayInfo)
  window.app_event.on('lyricUpdated', handleSetLyric)
  window.app_event.on('picUpdated', handleSetPic)
  window.app_event.on('lyricLinePlay', handleSetLyricLine)
  // window.app_event.on(eventTaskbarNames.setTaskbarThumbnailClip, handleSetTaskbarThumbnailClip)

  onBeforeUnmount(() => {
    rTaskbarThumbarClick()
    window.app_event.off('play', handlePlay)
    window.app_event.off('pause', handlePause)
    window.app_event.off('stop', handleStop)
    window.app_event.off('error', handleError)
    window.app_event.off('musicToggled', handleSetPlayInfo)
    window.app_event.off('lyricUpdated', handleSetLyric)
    window.app_event.off('picUpdated', handleSetPic)
    window.app_event.off('lyricLinePlay', handleSetLyricLine)
    // window.app_event.off(eventTaskbarNames.setTaskbarThumbnailClip, handleSetTaskbarThumbnailClip)
  })

  return async() => {
    // const setting = store.getters.setting
    // buttons.lrc = setting.desktopLyric.enable
    // buttons.lockLrc = setting.desktopLyric.isLock
    await updateCollectStatus()
    if (playMusicInfo.musicInfo == null) return
    sendPlayerStatus({
      collect,
      name: musicInfo.name,
      singer: musicInfo.singer,
      albumName: musicInfo.album,
      playbackRate: appSetting['player.playbackRate'],
      picUrl: musicInfo.pic ?? '',
      lyric: musicInfo.lrc ?? '',
      tlyric: musicInfo.tlrc ?? '',
      rlyric: musicInfo.rlrc ?? '',
      lxlyric: musicInfo.lxlrc ?? '',
    })
  }
}
