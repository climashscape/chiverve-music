import { onBeforeUnmount } from '@common/utils/vueTools'
import { getDuration, getPlaybackRate, getCurrentTime, isEmpty } from '@renderer/plugins/player'
import { isPlay, musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { playProgress } from '@renderer/store/player/playProgress'
import { pause, play, playNext, playPrev, stop } from '@renderer/core/player'
import { appSetting } from '@renderer/store/setting'
import silenceAudioSrc from '@renderer/assets/medias/Silence02s.mp3'

export default () => {
  // 创建一个空白音频以保持对 Media Session 的注册
  // （Chromium 只在页面里有媒体元素时维持会话；真音频在停止时会被卸载，锁屏/媒体控件就没了）
  const emptyAudio = new Audio()
  emptyAudio.autoplay = false
  emptyAudio.src = silenceAudioSrc
  emptyAudio.controls = false
  emptyAudio.preload = 'auto'
  emptyAudio.onplaying = () => {
    emptyAudio.pause()
  }
  void emptyAudio.play()
  let prevPicUrl = ''

  const updateMediaSessionInfo = () => {
    if (musicInfo.id == null) {
      navigator.mediaSession.metadata = null
      return
    }
    const mediaMetadata: MediaMetadata = {
      title: musicInfo.name,
      artist: musicInfo.singer,
      album: musicInfo.album,
      artwork: [],
    }
    if (musicInfo.pic) {
      const pic = new Image()
      pic.src = prevPicUrl = musicInfo.pic
      pic.onload = () => {
        if (prevPicUrl == pic.src) {
          mediaMetadata.artwork = [{ src: pic.src }]
          // @ts-expect-error
          navigator.mediaSession.metadata = new window.MediaMetadata(mediaMetadata)
        }
      }
    } else prevPicUrl = ''

    // @ts-expect-error
    navigator.mediaSession.metadata = new window.MediaMetadata(mediaMetadata)
  }

  const updatePositionState = (state: {
    duration?: number
    position?: number
    playbackRate?: number
  } = {}) => {
    navigator.mediaSession.setPositionState({
      duration: state.duration ?? getDuration(),
      playbackRate: state.playbackRate ?? getPlaybackRate(),
      position: state.position ?? getCurrentTime(),
    })
  }

  const setProgress = (time: number) => {
    window.app_event.setProgress(time)
  }

  const setStop = () => {
    stop()
  }

  // 停止（或音频被卸载）时的上报：元数据清掉、状态置 none。
  // 不清的话媒体控件会显示成「这首歌，暂停中」，点播放还能继续。
  const clearMediaSessionInfo = () => {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  }

  const handlePlay = () => {
    navigator.mediaSession.playbackState = 'playing'
  }
  const handlePause = () => {
    navigator.mediaSession.playbackState = 'paused'
  }
  const handleStop = () => {
    clearMediaSessionInfo()
  }
  const handleSetPlayInfo = () => {
    void emptyAudio.play().finally(() => {
      updateMediaSessionInfo()
      updatePositionState({
        position: playProgress.nowPlayTime,
        duration: playProgress.maxPlayTime,
      })
      handlePause()
    })
  }

  /**
   * 音频元素被卸载时会发 emptied，**切歌与停止都会走到这里**，用 `isEmpty()` 区分：
   * 切歌时 `src` 已换成新地址，停止时 `src` 被清掉（`setStop()`）。
   * 停止走清空分支——若当成切歌处理，`emptyAudio` 那次 play 的 finally 会把这首歌
   * 连同「暂停中」再挂回锁屏（它比 stop 事件还晚）。
   */
  const handleEmptied = () => {
    if (isEmpty()) {
      clearMediaSessionInfo()
      return
    }
    handleSetPlayInfo()
  }

  // 音频数据加载完成：元数据挂回去。停止后再播放时（`play()` → 重新取流 → 这里）
  // 锁屏靠这一步恢复显示，否则会一直空着。
  const handleLoadeddata = () => {
    updateMediaSessionInfo()
    updatePositionState()
  }

  // const registerMediaSessionHandler = () => {
  navigator.mediaSession.setActionHandler('play', () => {
    if (isPlay.value || !playMusicInfo) return
    play()
  })
  navigator.mediaSession.setActionHandler('pause', () => {
    if (!isPlay.value || !playMusicInfo) return
    pause()
  })
  navigator.mediaSession.setActionHandler('stop', () => {
    setStop()
  })
  navigator.mediaSession.setActionHandler('seekbackward', details => {
    // 系统没给 seekOffset 时的兜底 = 快进/快退步长设置（`player.skipStepSeconds`，默认 5 秒）
    const seekOffset = details.seekOffset ?? appSetting['player.skipStepSeconds']
    setProgress(Math.max(getCurrentTime() - seekOffset, 0))
  })
  navigator.mediaSession.setActionHandler('seekforward', details => {
    const seekOffset = details.seekOffset ?? appSetting['player.skipStepSeconds']
    setProgress(Math.min(getCurrentTime() + seekOffset, getDuration()))
  })
  navigator.mediaSession.setActionHandler('seekto', details => {
    if (details.seekTime == null) return
    let time = Math.min(details.seekTime, getDuration())
    time = Math.max(time, 0)
    setProgress(time)
  })
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    void playPrev()
  })
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    void playNext()
  })
  // navigator.mediaSession.setActionHandler('skipad', () => {
  //   console.log('')
  // })
  // }

  window.app_event.on('playerLoadeddata', handleLoadeddata)
  window.app_event.on('playerPlaying', updatePositionState)
  window.app_event.on('play', handlePlay)
  window.app_event.on('pause', handlePause)
  window.app_event.on('stop', handleStop)
  window.app_event.on('error', handlePause)
  window.app_event.on('playerEmptied', handleEmptied)
  // window.app_event.on('playerLoadstart', handleSetPlayInfo)
  window.app_event.on('musicToggled', handleSetPlayInfo)
  window.app_event.on('picUpdated', updateMediaSessionInfo)

  onBeforeUnmount(() => {
    window.app_event.off('playerLoadeddata', handleLoadeddata)
    window.app_event.off('playerPlaying', updatePositionState)
    window.app_event.off('play', handlePlay)
    window.app_event.off('pause', handlePause)
    window.app_event.off('stop', handleStop)
    window.app_event.off('error', handlePause)
    window.app_event.off('playerEmptied', handleEmptied)
    // window.app_event.off('playerLoadstart', handleSetPlayInfo)
    window.app_event.off('musicToggled', handleSetPlayInfo)
    window.app_event.off('picUpdated', updateMediaSessionInfo)
  })
}
