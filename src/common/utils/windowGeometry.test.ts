import { describe, expect, it } from 'vitest'
import { applyWindowDrag, clampWindowBoundsToWorkArea, moveWindowBounds, resizeWindowBounds, type ResizeEdge, type WindowBounds } from './windowGeometry'

/**
 * 歌词窗「下一次窗口几何」的行为约束——工单 03 尺寸缺陷的描述（移动不改尺寸、缩放只动被拖的
 * 那条边、不低于最小尺寸）加上工单 07 的锁定态约束（`applyWindowDrag`：锁定只许移动、缩放帧
 * 整帧丢弃）。
 *
 * 前三条断言在抽纯函数之前是红的（旧链路把滞后的 `window.innerWidth` 当绝对尺寸、
 * 把总位移叠加到当前坐标上，见 `src/renderer-lyric/useApp/useWindowSize.ts:77-87`
 * 与 `src/main/modules/winLyric/utils.ts:17-47`）；抽成纯函数后由本文件钉住。
 */

const base: WindowBounds = { x: 100, y: 200, width: 800, height: 300 }

describe('moveWindowBounds（移动只改位置）', () => {
  it('移动十次后宽高与初始完全一致（0 像素误差）', () => {
    let bounds = base
    for (let i = 1; i <= 10; i++) {
      // 每帧都按「自按下以来的总位移」重新算，基准始终是按下时的 bounds
      bounds = moveWindowBounds(base, i * 12, i * 6)
    }
    expect(bounds.width).toBe(base.width)
    expect(bounds.height).toBe(base.height)
    expect(bounds.x).toBe(base.x + 120)
    expect(bounds.y).toBe(base.y + 60)
  })

  it('同一组总位移重复套用结果相同（增量累积式实现不满足）', () => {
    const once = moveWindowBounds(base, 120, 60)
    const twice = moveWindowBounds(once, 0, 0)
    expect(twice).toEqual(once)
    expect(moveWindowBounds(base, 120, 60)).toEqual(once)
  })
})

describe('resizeWindowBounds（缩放只动被拖的那条边）', () => {
  it('拖右边：只改宽，高与左上角不变', () => {
    const next = resizeWindowBounds(base, 'right', 40, 0)
    expect(next).toEqual({ x: base.x, y: base.y, width: base.width + 40, height: base.height })
  })

  it('拖下边：只改高，宽与左上角不变', () => {
    const next = resizeWindowBounds(base, 'bottom', 0, 50)
    expect(next).toEqual({ x: base.x, y: base.y, width: base.width, height: base.height + 50 })
  })

  it('拖右下角：左上角不动', () => {
    const next = resizeWindowBounds(base, 'bottom-right', 30, 20)
    expect(next.x).toBe(base.x)
    expect(next.y).toBe(base.y)
    expect(next.width).toBe(base.width + 30)
    expect(next.height).toBe(base.height + 20)
  })

  it('拖左/上边：对边（右/下）严格不动', () => {
    const next = resizeWindowBounds(base, 'top-left', -30, -20)
    expect(next.x + next.width).toBe(base.x + base.width)
    expect(next.y + next.height).toBe(base.y + base.height)
    expect(next.width).toBe(base.width + 30)
    expect(next.height).toBe(base.height + 20)
  })

  it('低于最小尺寸时钳到 38，且对边仍不动（不会一边缩一边位移）', () => {
    const next = resizeWindowBounds(base, 'left', 10000, 0)
    expect(next.width).toBe(38)
    expect(next.x + next.width).toBe(base.x + base.width)
    expect(next.x).toBe(base.x + base.width - 38)

    const shrink = resizeWindowBounds({ x: 0, y: 0, width: 100, height: 100 }, 'bottom-right', -10000, -10000)
    expect(shrink).toEqual({ x: 0, y: 0, width: 38, height: 38 })
  })
})

describe('applyWindowDrag（锁定态只许移动，工单 07）', () => {
  const edges: ResizeEdge[] = ['left', 'top', 'right', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

  it('解锁态：移动帧只改位置，缩放帧只动被拖的边（不回归）', () => {
    expect(applyWindowDrag(base, { mode: 'move' }, 10, 20, false))
      .toEqual({ x: 110, y: 220, width: 800, height: 300 })
    expect(applyWindowDrag(base, { mode: 'resize', edge: 'right' }, 40, 0, false))
      .toEqual({ x: 100, y: 200, width: 840, height: 300 })
  })

  it('锁定态：八个手柄的缩放帧都不产生几何变化（null）', () => {
    for (const edge of edges) {
      expect(applyWindowDrag(base, { mode: 'resize', edge }, 40, 20, true)).toBeNull()
    }
  })

  it('锁定态：移动帧照常生效，且只改位置', () => {
    expect(applyWindowDrag(base, { mode: 'move' }, 12, -8, true))
      .toEqual({ x: 112, y: 192, width: 800, height: 300 })
  })

  it('缩放帧没带 edge 时按右下角算（与主进程原先的缺省一致）', () => {
    expect(applyWindowDrag(base, { mode: 'resize' }, 30, 20, false))
      .toEqual({ x: 100, y: 200, width: 830, height: 320 })
  })
})

describe('clampWindowBoundsToWorkArea（限制在屏幕内）', () => {
  const workArea = { width: 1920, height: 1080 }

  it('尺寸超过工作区时夹到工作区大小', () => {
    expect(clampWindowBoundsToWorkArea({ x: 0, y: 0, width: 4000, height: 3000 }, workArea)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('出屏的位置被夹回可视范围', () => {
    expect(clampWindowBoundsToWorkArea({ x: 5000, y: -50, width: 800, height: 300 }, workArea))
      .toEqual({ x: 1120, y: 0, width: 800, height: 300 })
  })

  it('没有工作区尺寸时原样返回', () => {
    expect(clampWindowBoundsToWorkArea({ x: 5000, y: -50, width: 800, height: 300 }, null)).toEqual({ x: 5000, y: -50, width: 800, height: 300 })
  })
})
