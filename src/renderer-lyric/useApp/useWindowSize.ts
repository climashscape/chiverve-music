import { setting } from '@lyric/store/state'
import { onBeforeUnmount, onMounted } from '@common/utils/vueTools'
import { endWindowDrag, isWindowDragging, startWindowDrag, updateWindowDrag } from '@lyric/utils/windowDrag'

export default () => {
  // 缩放手柄只负责「按下哪条边」；几何一律交给主进程按拖动协议算（见 utils/windowDrag.ts）
  const handleMove = (clientX: number, clientY: number) => {
    if (!isWindowDragging() || setting['desktopLyric.isLock']) return
    updateWindowDrag(clientX, clientY)
  }

  const handleDown = (origin: LX.DesktopLyric.ResizeEdge, clientX: number, clientY: number) => {
    handleMouseUp()
    startWindowDrag('resize', clientX, clientY, origin)
  }
  const handleMouseUp = () => {
    endWindowDrag()
  }

  const handleMouseDown = (origin: LX.DesktopLyric.ResizeEdge, event: MouseEvent) => {
    handleDown(origin, event.clientX, event.clientY)
  }
  const handleTouchDown = (origin: LX.DesktopLyric.ResizeEdge, event: TouchEvent) => {
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0]
      handleDown(origin, touch.clientX, touch.clientY)
    }
  }

  const handleMouseMove = (event: MouseEvent) => {
    handleMove(event.clientX, event.clientY)
  }
  const handleTouchMove = (event: TouchEvent) => {
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0]
      handleMove(touch.clientX, touch.clientY)
    }
  }


  onMounted(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleMouseUp)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleMouseUp)
  })

  return {
    handleMouseDown,
    handleTouchDown,
  }
}
