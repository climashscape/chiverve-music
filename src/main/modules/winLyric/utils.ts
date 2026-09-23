import { clampWindowBoundsToWorkArea, MIN_SIZE, type WindowBounds } from '@common/utils/windowGeometry'

// 设置窗口位置、大小
export const minWidth = MIN_SIZE.minWidth
export const minHeight = MIN_SIZE.minHeight


export const watchConfigKeys = [
  'desktopLyric.enable',
  'desktopLyric.isLock',
  'desktopLyric.isAlwaysOnTop',
  'desktopLyric.isAlwaysOnTopLoop',
  'desktopLyric.isShowTaskbar',
  'desktopLyric.pauseHide',
  'desktopLyric.audioVisualization',
  'desktopLyric.width',
  'desktopLyric.height',
  'desktopLyric.x',
  'desktopLyric.y',
  'desktopLyric.isLockScreen',
  'desktopLyric.isDelayScroll',
  'desktopLyric.scrollAlign',
  'desktopLyric.isHoverHide',
  'desktopLyric.direction',
  'desktopLyric.style.align',
  'desktopLyric.style.lyricUnplayColor',
  'desktopLyric.style.lyricPlayedColor',
  'desktopLyric.style.lyricShadowColor',
  'desktopLyric.style.font',
  'desktopLyric.style.fontSize',
  'desktopLyric.style.lineGap',
  // 'desktopLyric.style.fontWeight',
  'desktopLyric.style.opacity',
  'desktopLyric.style.ellipsis',
  'desktopLyric.style.isFontWeightFont',
  'desktopLyric.style.isFontWeightLine',
  'desktopLyric.style.isFontWeightExtended',
  'desktopLyric.style.isZoomActiveLrc',
  'common.langId',
  'player.isShowLyricTranslation',
  'player.isShowLyricRoma',
  'player.isSwapLyricTranslationAndRoma',
  'player.isPlayLxlrc',
  'player.playbackRate',
] satisfies Array<keyof LX.AppSetting>

export const buildLyricConfig = (appSetting: Partial<LX.AppSetting>): Partial<LX.DesktopLyric.Config> => {
  const setting: Partial<LX.DesktopLyric.Config> = {}
  for (const key of watchConfigKeys) {
    // @ts-expect-error
    if (key in appSetting) setting[key] = appSetting[key]
  }
  return setting
}

/**
 * 首次建窗/恢复时确定窗口几何：x/y 为 null（用户还没拖过）时落到工作区右下角，
 * 否则按工作区做一次夹取。几何一律是**绝对值**（与 `getBounds()` 同义）。
 */
export const initWindowSize = (x: LX.AppSetting['desktopLyric.x'], y: LX.AppSetting['desktopLyric.y'], width: LX.AppSetting['desktopLyric.width'], height: LX.AppSetting['desktopLyric.height']): WindowBounds => {
  const size = { width: Math.max(width, minWidth), height: Math.max(height, minHeight) }
  const workAreaSize = global.envParams.workAreaSize
  if (x == null || y == null) {
    return clampWindowBoundsToWorkArea({
      ...size,
      x: workAreaSize ? workAreaSize.width - size.width : 0,
      y: workAreaSize ? workAreaSize.height - size.height : 0,
    }, workAreaSize)
  }
  return clampWindowBoundsToWorkArea({ ...size, x, y }, global.lx.appSetting['desktopLyric.isLockScreen'] ? workAreaSize : null)
}
