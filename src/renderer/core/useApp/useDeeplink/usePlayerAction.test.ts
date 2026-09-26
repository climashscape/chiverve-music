import { beforeEach, describe, expect, it, vi } from 'vitest'
import usePlayerAction from './usePlayerAction'

/**
 * deeplink 播放动作的 rejection 收口（票 03b 同类）。
 *
 * `dislikeMusic` 里两次 await 都可能 reject（写云端「不喜欢」的 IPC、切下一首）；原来
 * `usePlayerAction.ts` 的 `case 'dislike'` 既不 await 也不 void，rejection 直接漏到顶层——
 * dev 下 webpack-dev-server 据此弹全屏浮层（`position:fixed; inset:0`）**吞掉真实鼠标输入**，
 * 生产下也是未处理异常。
 *
 * ⚠️ 这里的播放器桩用**普通函数**返回裸 `Promise.reject`，不用 `vi.fn().mockRejectedValue`：
 * Vitest 会给 mock 的返回值挂结果跟踪的处理器，把「没人接的 rejection」提前吞掉
 * （实测：vi.fn 版本在修复前也收不到 `unhandledRejection`，钉子会假绿）。普通函数的裸
 * rejection 与真实代码返回的 Promise 一样，只有真被 `.catch` 接住才不会触发全局事件。
 */

const { playerMock, calls } = vi.hoisted(() => {
  const calls = { dislike: [] as unknown[][] }
  let dislikeError: Error | null = null
  const playerMock = {
    failDislike: (err: Error | null) => { dislikeError = err },
    dislikeMusic: async(...args: unknown[]) => {
      calls.dislike.push(args)
      if (dislikeError) throw dislikeError
    },
  }
  return { playerMock, calls }
})

vi.mock('@renderer/core/player', () => ({
  collectMusic: async() => {},
  dislikeMusic: playerMock.dislikeMusic,
  pause: () => {},
  play: () => {},
  playNext: async() => {},
  playPrev: async() => {},
  togglePlay: () => {},
  uncollectMusic: async() => {},
}))

const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

/** 等一轮宏任务：让 `void dislikeMusic().catch(...)` 那条链走完 */
const settle = async() => {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('useDeeplink/usePlayerAction 的动作收口', () => {
  beforeEach(() => {
    calls.dislike.length = 0
    playerMock.failDislike(null)
  })

  it('dislikeMusic 失败 → 无未处理的 rejection（dev 全屏浮层不再被触发）', async() => {
    playerMock.failDislike(new Error('写「不喜欢」失败'))
    const unhandled = trackUnhandledRejection()

    await usePlayerAction()('dislike')
    await settle()
    unhandled.stop()

    expect(calls.dislike).toHaveLength(1)
    expect(unhandled.reasons).toEqual([])
  })

  it('正常 dislike 不受影响：动作被调用且无 rejection', async() => {
    const unhandled = trackUnhandledRejection()

    await usePlayerAction()('dislike')
    await settle()
    unhandled.stop()

    expect(calls.dislike).toHaveLength(1)
    expect(unhandled.reasons).toEqual([])
  })
})
