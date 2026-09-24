import { onBeforeUnmount } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { setStop, isEmpty } from '@renderer/plugins/player'
import { playNext, setMusicUrl } from '@renderer/core/player'
import { setAllStatus } from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'
import { getDegradedQuality } from '@renderer/core/music/utils'

export default () => {
  const t = useI18n()
  let retryNum = 0
  let prevTimeoutId: string | null = null

  let loadingTimeout: NodeJS.Timeout | null = null
  let delayNextTimeout: NodeJS.Timeout | null = null
  const startLoadingTimeout = () => {
    // console.log('start load timeout')
    clearLoadingTimeout()
    // 定时器是模块级单例：**每次启动时现读设置**（`player.retryUrlDelay` 改了立即生效）
    loadingTimeout = setTimeout(() => {
      if (window.lx.isPlayedStop) {
        prevTimeoutId = null
        setAllStatus('')
        return
      }

      // 如果加载超时，则尝试刷新URL
      if (prevTimeoutId == musicInfo.id) {
        prevTimeoutId = null
        void playNext(true)
      } else {
        prevTimeoutId = musicInfo.id
        if (playMusicInfo.musicInfo) setMusicUrl(playMusicInfo.musicInfo, true)
      }
    }, appSetting['player.retryUrlDelay'] * 1000)
  }
  const clearLoadingTimeout = () => {
    if (!loadingTimeout) return
    // console.log('clear load timeout')
    clearTimeout(loadingTimeout)
    loadingTimeout = null
  }

  const clearDelayNextTimeout = () => {
    // console.log(this.delayNextTimeout)
    if (!delayNextTimeout) return
    clearTimeout(delayNextTimeout)
    delayNextTimeout = null
  }
  const addDelayNextTimeout = () => {
    clearDelayNextTimeout()
    // 同上：延时时长现读 `player.errorSkipDelay`
    delayNextTimeout = setTimeout(() => {
      if (window.lx.isPlayedStop) {
        setAllStatus('')
        return
      }
      void playNext(true)
    }, appSetting['player.errorSkipDelay'] * 1000)
  }

  const handleLoadstart = () => {
    if (window.lx.isPlayedStop) return
    if (appSetting['player.autoSkipOnError']) startLoadingTimeout()
    setAllStatus(t('player__loading'))
  }

  const handleLoadeddata = () => {
    setAllStatus(t('player__loading'))
  }

  const handlePlaying = () => {
    setAllStatus('')
    clearLoadingTimeout()
  }

  const handleEmpied = () => {
    clearDelayNextTimeout()
    clearLoadingTimeout()
  }

  const handleWating = () => {
    setAllStatus(t('player__buffering'))
  }

  /**
   * 出链失败的处理，按 `player.onUrlFailStrategy` 分三档（默认 `retry` = 改造前的行为）：
   * - `retry`：同源刷新 URL，次数上限 `player.retryUrlMaxNum`（原写死的 2 次）；
   * - `degrade`：沿档位阶梯降一档再取一次流（降的档数同样受上限约束，见 `getDegradedQuality`），
   *   本地 / 下载歌曲与已到 128k 的情况降无可降，与 `error` 一样直接走下面的提示 / 跳过；
   * - `error`：不重试，直接按 `player.errorSkipDelay` 提示（窗口可见）或跳过（窗口不可见）。
   *
   * `retryNum` 在切歌时清零（`handleSetPlayInfo`），所以两种重试都按「每首歌」重新计数。
   */
  const handleError = (errCode?: number) => {
    if (!musicInfo.id) return
    clearLoadingTimeout()
    if (window.lx.isPlayedStop) return
    if (!isEmpty()) setStop()
    const minfo = playMusicInfo.musicInfo
    // 只有在线歌曲有档位可降（本地 / 下载歌曲的 meta 里没有 _qualitys）
    const onlineMusicInfo = minfo && !('progress' in minfo) && minfo.source != 'local' ? minfo : null
    const strategy = appSetting['player.onUrlFailStrategy']
    if (minfo && errCode !== 1 && retryNum < appSetting['player.retryUrlMaxNum'] && strategy != 'error') {
      // 降档：第 n 次重试就往下走 n 档（retryNum 从 0 起，所以 +1）
      const degradedQuality = strategy == 'degrade' && onlineMusicInfo
        ? getDegradedQuality(onlineMusicInfo, retryNum + 1)
        : null
      // degrade 但降无可降时不要空转一次：直接落到下面的提示 / 跳过
      if (strategy != 'degrade' || degradedQuality) {
        retryNum++
        setMusicUrl(minfo, true, degradedQuality ?? undefined)
        setAllStatus(degradedQuality
          ? t('player__degrade_quality', { quality: degradedQuality })
          : t('player__refresh_url'))
        return
      }
    }

    if (appSetting['player.autoSkipOnError']) {
      if (document.hidden) {
        console.warn('error skip to next')
        void playNext(true)
      } else {
        setAllStatus(t('player__error', { time: appSetting['player.errorSkipDelay'] }))
        setTimeout(addDelayNextTimeout)
      }
    }
  }

  const handleSetPlayInfo = () => {
    retryNum = 0
    prevTimeoutId = null
    clearDelayNextTimeout()
    clearLoadingTimeout()
  }

  // const handlePlayedStop = () => {
  //   clearDelayNextTimeout()
  //   clearLoadingTimeout()
  // }


  window.app_event.on('playerLoadstart', handleLoadstart)
  window.app_event.on('playerLoadeddata', handleLoadeddata)
  window.app_event.on('playerPlaying', handlePlaying)
  window.app_event.on('playerWaiting', handleWating)
  window.app_event.on('playerEmptied', handleEmpied)
  window.app_event.on('playerError', handleError)
  window.app_event.on('musicToggled', handleSetPlayInfo)

  onBeforeUnmount(() => {
    window.app_event.off('playerLoadstart', handleLoadstart)
    window.app_event.off('playerLoadeddata', handleLoadeddata)
    window.app_event.off('playerPlaying', handlePlaying)
    window.app_event.off('playerWaiting', handleWating)
    window.app_event.off('playerEmptied', handleEmpied)
    window.app_event.off('playerError', handleError)
    window.app_event.off('musicToggled', handleSetPlayInfo)
  })
}
