/**
 * 窗口几何：把「下一次窗口几何」算成纯函数，主进程与渲染侧共用同一套语义。
 *
 * 为什么要有这个模块（工单 03 的复现结论）：
 * 旧链路里「当前尺寸」有两个来源——渲染侧 `window.innerWidth/innerHeight`（异步滞后，
 * 小数 DPR 下还比真实值大 1）与主进程 `getBounds()`（权威值）；渲染侧把前者当绝对尺寸
 * 发上来、主进程把 x/y 当增量叠加，结果同一份几何被三种语义描述：
 *   移动 10 次 → 宽高各涨 17/20 px、窗口跑了 658px（请求位移只有 120px）；
 *   拖右下角 → 左上角跟着跑 116px；拖左上角 → 尺寸翻倍。
 *
 * 本模块统一成**绝对几何 + 单侧锚定**：
 * - `bounds` 的 x/y/width/height 全是绝对值（DIP，与 Electron `getBounds()` 同义）；
 * - 移动只改 x/y，宽高原样带过（不读任何外部尺寸来源，所以不可能漂）；
 * - 缩放只改被拖的那条边，对边严格不动（钳到最小尺寸时也一样：宁可拖不动，
 *   也不让对边跑——旧实现在钳位后仍继续移动 x，窗口会「一边缩一边位移」）；
 * - 锁定态（`desktopLyric.isLock`）只许移动：缩放帧整帧丢弃（`applyWindowDrag` 返回 `null`）。
 *
 * 位移由调用方给**自按下以来的总位移**（不是每帧增量）：套用到按下瞬间的基准 bounds 上，
 * 因此丢帧、慢帧、窗口跟着指针跑都不会累积误差。
 */

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** 被拖的边（含四个角） */
export type ResizeEdge =
  | 'left'
  | 'top'
  | 'right'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface MinSize {
  minWidth: number
  minHeight: number
}

/** 歌词窗最小尺寸（与上游一致，见 `src/main/modules/winLyric/utils.ts`） */
export const MIN_SIZE: MinSize = { minWidth: 38, minHeight: 38 }

/** 移动：只改位置。宽高按传入值原样输出，绝不从别处取尺寸 */
export const moveWindowBounds = (bounds: WindowBounds, dx: number, dy: number): WindowBounds => ({
  x: bounds.x + dx,
  y: bounds.y + dy,
  width: bounds.width,
  height: bounds.height,
})

/**
 * 缩放：只动被拖的边。
 * 拖左边/上边时，对边（右/下）钉死：x 按**实际生效的**尺寸变化回推，而不是按指针位移，
 * 于是钳到最小尺寸后继续拖只会停在原地，对边不会被推着走。
 */
export const resizeWindowBounds = (bounds: WindowBounds, edge: ResizeEdge, dx: number, dy: number, minSize: MinSize = MIN_SIZE): WindowBounds => {
  let { x, y, width, height } = bounds

  if (edge === 'right' || edge === 'top-right' || edge === 'bottom-right') {
    width = Math.max(bounds.width + dx, minSize.minWidth)
  } else if (edge === 'left' || edge === 'top-left' || edge === 'bottom-left') {
    width = Math.max(bounds.width - dx, minSize.minWidth)
    x = bounds.x + (bounds.width - width)
  }

  if (edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right') {
    height = Math.max(bounds.height + dy, minSize.minHeight)
  } else if (edge === 'top' || edge === 'top-left' || edge === 'top-right') {
    height = Math.max(bounds.height - dy, minSize.minHeight)
    y = bounds.y + (bounds.height - height)
  }

  return { x, y, width, height }
}

/**
 * 一次拖动帧要落到的几何；`null` = 这一帧**不产生任何几何变化**（调用方整帧跳过写入）。
 *
 * 「锁定态只许移动」这条规则（ui-polish-followups 工单 07）落在这里：
 * `desktopLyric.isLock` 为真时缩放帧一律丢弃，移动帧照常。
 *
 * 为什么主进程还要再判一次（渲染侧也有一道守卫，见 `renderer-lyric/utils/windowDrag.ts`）：
 * 1. 锁定的真值在主进程（快捷键 `winLyric/index.ts:62` 随时可改），渲染侧那份可能还没跟上；
 * 2. 拖动中途被锁时，主进程每一帧现读设置，能立刻停住，不依赖渲染侧是否收到配置推送。
 *
 * 锁定态收到缩放帧**不做「降级成移动」**：上游 `useWindowSize.handleMove` 的守卫意图就是
 * 「这一次交互不发生」（`return`），改成移动会让拖右边缘变成横向平移，语义更坏。
 */
export const applyWindowDrag = (bounds: WindowBounds, drag: { mode: 'move' | 'resize', edge?: ResizeEdge }, dx: number, dy: number, isLock: boolean): WindowBounds | null => {
  if (drag.mode === 'move') return moveWindowBounds(bounds, dx, dy)
  if (isLock) return null
  return resizeWindowBounds(bounds, drag.edge ?? 'bottom-right', dx, dy)
}

/**
 * 把窗口限制在屏幕工作区内（`desktopLyric.isLockScreen` 生效时的行为，与上游一致：
 * 尺寸先夹到工作区大小，位置再夹进 [0, 工作区 - 尺寸]）。
 * 未取到工作区尺寸时原样返回。
 */
export const clampWindowBoundsToWorkArea = (bounds: WindowBounds, workAreaSize?: { width: number, height: number } | null): WindowBounds => {
  if (!workAreaSize) return bounds
  const width = Math.min(bounds.width, workAreaSize.width)
  const height = Math.min(bounds.height, workAreaSize.height)
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, 0), workAreaSize.width - width),
    y: Math.min(Math.max(bounds.y, 0), workAreaSize.height - height),
  }
}
