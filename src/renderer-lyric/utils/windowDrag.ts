import { sendWindowDrag } from '@lyric/utils/ipc'
import { setting } from '@lyric/store/state'

/**
 * 歌词窗拖动（移动 / 缩放）的共用状态与协议 —— 移动、八个缩放手柄三处共用一份实现。
 *
 * 三个要点（前两条是工单 03 复现出来的坑，第三条是工单 07）：
 * 1. 位移用**屏幕坐标**算（`clientX + window.screenX`）。窗口跟着指针移动时，指针在窗口内的
 *    clientX 会同步变小，只用 clientX 的话位移会自我抵消（窗口只跟到指针位移的一半）；
 *    加上 screenX 才是稳定的屏幕坐标。
 * 2. 发给主进程的是「自按下以来的**总**位移」，主进程以按下瞬间的 bounds 为基准套用它
 *    （`src/main/modules/winLyric/main.ts` 的 `handleWindowDrag`）。渲染侧一律不报尺寸，
 *    也就不可能把滞后的 `window.innerWidth` 写回窗口（那是尺寸漂移的根源）。
 * 3. **锁定态（`desktopLyric.isLock`）只许移动**：缩放请求在这一层就丢弃。守卫必须收在这里、
 *    而不是某一个调用方的 mousemove 里——`drag` 是模块级共享状态，而 document 上的 mousemove
 *    监听有三处（缩放手柄 `useWindowSize`、顶栏 `useDrag`、歌词区 `useLyric`）：按下与位移
 *    往往不是同一个监听方（拖手柄时 `useDrag` 也会收到 mousemove 并按共享状态转成 update）。
 *    守卫只写在其中一处就会被另一处绕过（锁定态拖手柄仍会改尺寸）。
 */
const drag: {
  mode: 'move' | 'resize' | null
  downScreenX: number
  downScreenY: number
} = {
  mode: null,
  downScreenX: 0,
  downScreenY: 0,
}
// 缩放手柄（`edge`）只在 start 那一帧随参数下发给主进程，主进程记着它算几何；
// 渲染侧后续的 update 只报总位移，不需要留一份——别在 drag 上加回 `edge`（只写不读的死状态）。

const screenPos = (clientX: number, clientY: number) => [clientX + window.screenX, clientY + window.screenY]

export const isWindowDragging = () => drag.mode != null

/** 这一次拖动是不是「锁定态下不该发生」的缩放（判据现读设置，拖动中途被锁也能立刻停住）。 */
const isLockedResize = (mode: 'move' | 'resize' | null) => mode == 'resize' && !!setting['desktopLyric.isLock']

export const startWindowDrag = (mode: 'move' | 'resize', clientX: number, clientY: number, edge?: LX.DesktopLyric.ResizeEdge) => {
  // 锁定态按下缩放手柄：不进拖动状态（后续 update 也就无从发出）。
  // 不降级成移动——上游 `useWindowSize.handleMove` 的守卫意图是「这次交互不发生」。
  if (isLockedResize(mode)) return
  const [sx, sy] = screenPos(clientX, clientY)
  drag.mode = mode
  drag.downScreenX = sx
  drag.downScreenY = sy
  sendWindowDrag({ type: 'start', mode, edge })
}

export const updateWindowDrag = (clientX: number, clientY: number) => {
  if (drag.mode == null) return
  if (isLockedResize(drag.mode)) return
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
  sendWindowDrag({ type: 'end' })
}
