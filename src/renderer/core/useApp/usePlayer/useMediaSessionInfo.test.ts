import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { musicInfo, isPlay } from '@renderer/store/player/state'
import { playProgress } from '@renderer/store/player/playProgress'
import { mergeSetting } from '@renderer/store/setting'
import useMediaSessionInfo from './useMediaSessionInfo'

/**
 * 锁屏 / 媒体控件上报（`navigator.mediaSession`）的行为口径。
 *
 * 这里钉住的核心是**停止态**（2026-09-25 用户拍板：停止就从锁屏消失）：
 * 停止时音频元素被卸载（`audio.src = ''`），锁屏上不该再挂着这首歌——否则媒体控件显示成
 * 「暂停中」，点播放还能接着放。判定口径用 `isEmpty()`：停止是「没有 resource」，
 * 而切歌时 `src` 已换成新地址，同样会发的 emptied 事件不算停止。
 *
 * 音频元素、播放动作、进度都是被测模块的协作者，全部走桩；被测的是「哪些事件该写什么」。
 */
const mocks = {
  // 由各用例控制：音频元素现在有没有 resource（停止 vs 切歌）
  isEmpty: vi.fn(() => false),
  getCurrentTime: vi.fn(() => 0),
  getDuration: vi.fn(() => 0),
}

vi.mock('@renderer/plugins/player', () => ({
  getDuration: () => mocks.getDuration(),
  getPlaybackRate: () => 1,
  getCurrentTime: () => mocks.getCurrentTime(),
  isEmpty: () => mocks.isEmpty(),
}))

vi.mock('@renderer/core/player', () => ({
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  playNext: vi.fn(),
  playPrev: vi.fn(),
}))

vi.mock('@renderer/store/player/playProgress', () => ({
  playProgress: { nowPlayTime: 0, maxPlayTime: 0 },
}))

// jsdom 没有 MediaMetadata：只保留被测代码会读的那几个字段
class FakeMediaMetadata {
  title = ''
  artist = ''
  album = ''
  artwork: Array<{ src: string }> = []
  constructor(init: Record<string, unknown>) {
    Object.assign(this, init)
  }
}

class FakeAudio {
  src = ''
  autoplay = false
  controls = false
  preload = ''
  onplaying: (() => void) | null = null
  pause = vi.fn()
  play = vi.fn(async() => {
    this.onplaying?.()
  })
}

/** 事件总线的最小实现（dom setup 里的那份没有 setProgress 的 spy） */
const createAppEvent = () => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  return {
    on: (name: string, listener: (...args: any[]) => void) => {
      const set = listeners.get(name) ?? new Set()
      listeners.set(name, set)
      set.add(listener)
    },
    off: (name: string, listener: (...args: any[]) => void) => {
      listeners.get(name)?.delete(listener)
    },
    emit: (name: string, ...args: any[]) => {
      for (const listener of [...(listeners.get(name) ?? [])]) listener(...args)
    },
    setProgress: vi.fn(),
  }
}

const mediaSession = {
  metadata: null as any,
  playbackState: '' as MediaSessionPlaybackState,
  setPositionState: vi.fn(),
  setActionHandler: vi.fn(),
}

let appEvent = createAppEvent()

/** 元数据的写入发生在 `emptyAudio.play()` 的 finally 里，得让微任务跑完再断言 */
const flush = async() => {
  await new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}

beforeEach(() => {
  mocks.isEmpty.mockReturnValue(false)
  mocks.getCurrentTime.mockReturnValue(0)
  mocks.getDuration.mockReturnValue(0)
  mediaSession.metadata = null
  mediaSession.playbackState = '' as MediaSessionPlaybackState
  mediaSession.setPositionState.mockClear()
  mediaSession.setActionHandler.mockClear()
  appEvent = createAppEvent()
  ;(window as any).app_event = appEvent
  ;(window as any).MediaMetadata = FakeMediaMetadata
  ;(window as any).Audio = FakeAudio
  Object.defineProperty(navigator, 'mediaSession', { value: mediaSession, configurable: true })
  musicInfo.id = null
  musicInfo.name = ''
  musicInfo.singer = ''
  musicInfo.album = ''
  musicInfo.pic = null
  isPlay.value = false
  playProgress.nowPlayTime = 0
  playProgress.maxPlayTime = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 切歌：把 store 里的当前曲目换成一首有名字的歌 */
const setCurrentMusic = () => {
  musicInfo.id = 's1'
  musicInfo.name = 'Soul Cure'
  musicInfo.singer = 'Melchi'
  musicInfo.album = 'Stormless'
}

describe('停止态：停止就从锁屏消失', () => {
  it('音频被卸载（isEmpty）时的 emptied：清空元数据、上报 none，且不再写进度', async() => {
    useMediaSessionInfo()
    setCurrentMusic()
    appEvent.emit('musicToggled')
    await flush()
    expect(mediaSession.metadata?.title).toBe('Soul Cure')
    const positionCalls = mediaSession.setPositionState.mock.calls.length

    mocks.isEmpty.mockReturnValue(true)
    appEvent.emit('playerEmptied')
    await flush()

    expect(mediaSession.metadata).toBe(null)
    expect(mediaSession.playbackState).toBe('none')
    // 停止后不该再写进度（否则时长/位置会以 0 挂在媒体控件上）
    expect(mediaSession.setPositionState.mock.calls.length).toBe(positionCalls)
  })

  it('随后的 stop 事件不会把这首歌挂回去', async() => {
    useMediaSessionInfo()
    setCurrentMusic()
    appEvent.emit('musicToggled')
    await flush()

    mocks.isEmpty.mockReturnValue(true)
    appEvent.emit('playerEmptied')
    appEvent.emit('stop')
    await flush()

    expect(mediaSession.metadata).toBe(null)
    expect(mediaSession.playbackState).toBe('none')
  })

  it('停止后重新加载音频（loadeddata）把元数据挂回来', async() => {
    useMediaSessionInfo()
    setCurrentMusic()
    mocks.isEmpty.mockReturnValue(true)
    appEvent.emit('playerEmptied')
    await flush()
    expect(mediaSession.metadata).toBe(null)

    mocks.isEmpty.mockReturnValue(false)
    appEvent.emit('playerLoadeddata')
    await flush()

    expect(mediaSession.metadata?.title).toBe('Soul Cure')
    expect(mediaSession.setPositionState).toHaveBeenCalled()
  })
})

describe('切歌不算停止', () => {
  it('切歌时的 emptied（src 已换成新地址，isEmpty 为假）保持上报这首歌', async() => {
    useMediaSessionInfo()
    setCurrentMusic()
    appEvent.emit('playerEmptied')
    await flush()

    expect(mediaSession.metadata?.title).toBe('Soul Cure')
    expect(mediaSession.metadata?.artist).toBe('Melchi')
    expect(mediaSession.metadata?.album).toBe('Stormless')
    // 新歌还没真正开始播，先按暂停上报，等 playing 事件再改成 playing
    expect(mediaSession.playbackState).toBe('paused')
  })

  it('musicToggled 同时带上时长与位置', async() => {
    // 切歌时上报的是播放进度里记着的值（`playProgress`），不是音频元素的当前值
    playProgress.nowPlayTime = 12
    playProgress.maxPlayTime = 168
    useMediaSessionInfo()
    setCurrentMusic()
    appEvent.emit('musicToggled')
    await flush()

    expect(mediaSession.setPositionState).toHaveBeenCalledWith({ duration: 168, position: 12, playbackRate: 1 })
  })

  it('没有当前曲目（musicInfo.id 为空）时清空元数据', async() => {
    useMediaSessionInfo()
    appEvent.emit('musicToggled')
    await flush()

    expect(mediaSession.metadata).toBe(null)
  })
})

describe('播放状态上报', () => {
  it('play / pause / error 驱动 playbackState', () => {
    useMediaSessionInfo()

    appEvent.emit('play')
    expect(mediaSession.playbackState).toBe('playing')

    appEvent.emit('pause')
    expect(mediaSession.playbackState).toBe('paused')

    appEvent.emit('play')
    appEvent.emit('error')
    expect(mediaSession.playbackState).toBe('paused')
  })
})

describe('锁屏上的快进/快退', () => {
  it('系统没给 seekOffset 时用播放设置里的步长', () => {
    const setting: Partial<LX.AppSetting> = { 'player.skipStepSeconds': 7 }
    mergeSetting(setting)
    mocks.getCurrentTime.mockReturnValue(30)
    mocks.getDuration.mockReturnValue(168)
    useMediaSessionInfo()

    const handlers = new Map<string, (details: any) => void>()
    for (const call of mediaSession.setActionHandler.mock.calls) handlers.set(call[0], call[1])

    handlers.get('seekbackward')?.({})
    expect(appEvent.setProgress).toHaveBeenCalledWith(23)

    handlers.get('seekforward')?.({})
    expect(appEvent.setProgress).toHaveBeenCalledWith(37)
  })
})
