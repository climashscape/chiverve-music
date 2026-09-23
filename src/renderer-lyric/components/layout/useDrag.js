import { onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { endWindowDrag, isWindowDragging, startWindowDrag, updateWindowDrag } from '@lyric/utils/windowDrag'

export default () => {
  const handleLyricDown = (target, x, y) => {
    // 拖动只发「开始」；位移与几何由主进程按拖动协议算（见 utils/windowDrag.ts）
    startWindowDrag('move', x, y)
  }
  const handleLyricMouseDown = event => {
    console.log(event.target, event.currentTarget)
    if (event.target !== event.currentTarget) return
    handleLyricDown(event.target, event.clientX, event.clientY)
  }
  const handleLyricTouchStart = event => {
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0]
      if (touch.target !== touch.currentTarget) return
      handleLyricDown(event.target, touch.clientX, touch.clientY)
    }
  }
  const handleMouseMsUp = () => {
    endWindowDrag()
  }

  const handleMove = (x, y) => {
    if (!isWindowDragging()) return
    updateWindowDrag(x, y)
  }
  const handleMouseMsMove = event => {
    handleMove(event.clientX, event.clientY)
  }
  const handleTouchMove = (e) => {
    if (e.changedTouches.length) {
      const touch = e.changedTouches[0]
      handleMove(touch.clientX, touch.clientY)
    }
  }

  onMounted(() => {
    document.addEventListener('mousemove', handleMouseMsMove)
    document.addEventListener('mouseup', handleMouseMsUp)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleMouseMsUp)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', handleMouseMsMove)
    document.removeEventListener('mouseup', handleMouseMsUp)
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleMouseMsUp)
  })

  return {
    handleLyricMouseDown,
    handleLyricTouchStart,
  }
}
