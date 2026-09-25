import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendWindowDrag } from '@lyric/utils/ipc'
import { setting } from '@lyric/store/state'
import { endWindowDrag, isWindowDragging, startWindowDrag, updateWindowDrag } from './windowDrag'

vi.mock('@lyric/utils/ipc', () => ({ sendWindowDrag: vi.fn() }))

/**
 * 拖动协议的行为约束（工单 07 的锁定态那条是本文件的主角）。
 *
 * 为什么值得一条用例：锁定态的守卫原先只写在一个调用方的 mousemove 里
 * （`useWindowSize.handleMove`），但 `drag` 是**模块级共享状态**、document 上的 mousemove
 * 监听有三处（缩放手柄 / 顶栏 `useDrag` / 歌词区 `useLyric`）——拖手柄时 `useDrag` 也会
 * 按共享状态把位移转成 update，于是那条守卫被绕过，锁定态照样改尺寸。
 * 所以守卫必须收在共享状态这一层（`windowDrag.ts`），本文件把「锁定 = 缩放请求一个都不发、
 * 移动照旧」钉住；主进程侧还有同一道守卫（`applyWindowDrag`，见 windowGeometry.test.ts）。
 */
describe('windowDrag（锁定态只许移动）', () => {
  const originLock = setting['desktopLyric.isLock']

  beforeEach(() => {
    // 模块级单例：上一个用例可能留下未结束的拖动或改过的锁定值
    endWindowDrag()
    vi.mocked(sendWindowDrag).mockClear()
    setting['desktopLyric.isLock'] = false
  })
  afterEach(() => {
    // `setting` 与拖动状态都是模块级单例，别把改动留给同进程里的其它用例
    endWindowDrag()
    setting['desktopLyric.isLock'] = originLock
  })

  it('解锁态：缩放手柄按下发 start、拖动发 update（基准是屏幕坐标下的总位移）', () => {
    startWindowDrag('resize', 100, 200, 'bottom-right')
    expect(isWindowDragging()).toBe(true)
    updateWindowDrag(140, 230)
    expect(sendWindowDrag).toHaveBeenNthCalledWith(1, { type: 'start', mode: 'resize', edge: 'bottom-right' })
    expect(sendWindowDrag).toHaveBeenNthCalledWith(2, { type: 'update', dx: 40, dy: 30 })
  })

  it('锁定态：缩放按下连 start 都不发（不进拖动状态），后续位移也就无从发出', () => {
    setting['desktopLyric.isLock'] = true
    startWindowDrag('resize', 100, 200, 'bottom-right')
    expect(isWindowDragging()).toBe(false)
    updateWindowDrag(140, 230)
    expect(sendWindowDrag).not.toHaveBeenCalled()
  })

  it('锁定态：移动照常下发（只改位置的那条路径不受影响）', () => {
    setting['desktopLyric.isLock'] = true
    startWindowDrag('move', 100, 200)
    updateWindowDrag(120, 210)
    expect(sendWindowDrag).toHaveBeenNthCalledWith(1, { type: 'start', mode: 'move', edge: undefined })
    expect(sendWindowDrag).toHaveBeenNthCalledWith(2, { type: 'update', dx: 20, dy: 10 })
  })

  it('拖动中途被锁：后续缩放帧立即停住（这一帧不写窗口）', () => {
    startWindowDrag('resize', 100, 200, 'right')
    updateWindowDrag(110, 210)
    vi.mocked(sendWindowDrag).mockClear()

    setting['desktopLyric.isLock'] = true
    updateWindowDrag(140, 230)
    expect(sendWindowDrag).not.toHaveBeenCalled()
  })

  it('解锁后重新拖缩放：照常下发（守卫不是一次性的）', () => {
    setting['desktopLyric.isLock'] = true
    startWindowDrag('resize', 100, 200, 'right')
    setting['desktopLyric.isLock'] = false
    startWindowDrag('resize', 100, 200, 'right')
    updateWindowDrag(130, 200)
    expect(sendWindowDrag).toHaveBeenNthCalledWith(1, { type: 'start', mode: 'resize', edge: 'right' })
    expect(sendWindowDrag).toHaveBeenNthCalledWith(2, { type: 'update', dx: 30, dy: 0 })
  })
})
