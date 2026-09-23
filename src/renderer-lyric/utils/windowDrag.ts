import { sendWindowDrag } from '@lyric/utils/ipc'

/**
 * 歌词窗拖动（移动 / 缩放）的共用状态与协议 —— 移动、八个缩放手柄三处共用一份实现。
 *
 * 两个要点（都是工单 03 复现出来的坑）：
 * 1. 位移用**屏幕坐标**算（`clientX + window.screenX`）。窗口跟着指针移动时，指针在窗口内的
 *    clientX 会同步变小，只用 clientX 的话位移会自我抵消（窗口只跟到指针位移的一半）；
 *    加上 screenX 才是稳定的屏幕坐标。
 * 2. 发给主进程的是「自按下以来的**总**位移」，主进程以按下瞬间的 bounds 为基准套用它
 *    （`src/main/modules/winLyric/main.ts` 的 `handleWindowDrag`）。渲染侧一律不报尺寸，
 *    也就不可能把滞后的 `window.innerWidth` 写回窗口（那是尺寸漂移的根源）。
 */
const drag: {
  mode: 'move' | 'resize' | null
  edge: LX.DesktopLyric.ResizeEdge | undefined
  downScreenX: number
  downScreenY: number
} = {
  mode: null,
  edge: undefined,
  downScreenX: 0,
  downScreenY: 0,
}

const screenPos = (clientX: number, clientY: number) => [clientX + window.screenX, clientY + window.screenY]

export const isWindowDragging = () => drag.mode != null

export const startWindowDrag = (mode: 'move' | 'resize', clientX: number, clientY: number, edge?: LX.DesktopLyric.ResizeEdge) => {
  const [sx, sy] = screenPos(clientX, clientY)
  drag.mode = mode
  drag.edge = edge
  drag.downScreenX = sx
  drag.downScreenY = sy
  sendWindowDrag({ type: 'start', mode, edge })
}

export const updateWindowDrag = (clientX: number, clientY: number) => {
  if (drag.mode == null) return
  const [sx, sy] = screenPos(clientX, clientY)
  sendWindowDrag({
    type: 'update',
    dx: sx - drag.downScreenX,
    dy: sy - drag.downScreenY,
  })
}

export const endWindowDrag = () => {
  if (drag.mode == null) return
  drag.mode = null
  drag.edge = undefined
  sendWindowDrag({ type: 'end' })
}
