import { ref, computed, type ComputedRef } from '@common/utils/vueTools'
import { log } from '@common/utils'
import { isPlay } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'
// import { interval, intervalCancel } from '@renderer/utils/ipc'
import { pause } from './action'

const time = ref(-1)


const timeoutTools: {
  isRunning: boolean
  // time: number
  interval: null | number
  timeout: NodeJS.Timeout | null
  endTime: number
  exit: () => void
  clearTimeout: () => void
  start: (_time: number) => void
} = {
  isRunning: false,
  timeout: null,
  // time: -1,
  endTime: 0,
  interval: null,
  exit() {
    window.lx.isPlayedStop = true
    // 到点这一下留一行时间戳：验收「定时暂停到点真的暂停」时在 `<userData>/logs/main.log` 里对时间
    // （不打印时长就行——时长在设置里，日志只需要证明「到点确实触发了」）
    log.info(`[timeoutStop] fired (waitPlayEndStop=${appSetting['player.waitPlayEndStop']}, isPlay=${isPlay.value})`)
    if (!appSetting['player.waitPlayEndStop'] && isPlay.value) {
      pause()
    }
  },
  clearTimeout() {
    if (this.interval) {
      window.clearInterval(this.interval)
      this.interval = null
    }
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    if (!this.isRunning) return
    // this.time = -1
    time.value = -1
    this.isRunning = false
  },
  start(_time: number) {
    this.clearTimeout()
    // this.time = _time
    time.value = _time
    this.isRunning = true
    this.endTime = performance.now() + _time * 1000

    this.interval = window.setInterval(() => {
      // this.endTime = performance.now()
      // if (this.time > 0) {
      //   this.time--
      // }
      time.value = Math.max(0, Math.round((this.endTime - performance.now()) / 1000))
    }, 1000)
    this.timeout = setTimeout(() => {
      this.timeout = null
      time.value = -1
      this.clearTimeout()
      this.exit()
    }, _time * 1000)
  },
}

export const startTimeoutStop = (time: number) => {
  window.lx.isPlayedStop &&= false
  timeoutTools.start(time)
}
export const stopTimeoutStop = () => {
  console.warn('stopTimeoutStop')
  window.lx.isPlayedStop &&= false
  timeoutTools.clearTimeout()
}

/** 定时暂停的时长上限（分钟）：弹窗与设置页的输入校验都走 `normalizeTimeoutStopMinutes`，上限只此一处。 */
const TIMEOUT_STOP_MAX_MIN = 1440

/**
 * 把输入框里的文本规整成可落盘的分钟数：抓第一段 ≥1 的整数、夹到 `TIMEOUT_STOP_MAX_MIN`，
 * 抓不到（空 / 0 / 没有数字）返回空串。
 *
 * 弹窗的「确认」（`PlayTimeoutModal.vue`）与设置页的时长输入框共用它——两处各写一套校验迟早会漂移。
 */
export const normalizeTimeoutStopMinutes = (text: unknown): string => {
  const matched = /([1-9]\d*)/.exec(String(text ?? ''))
  if (!matched) return ''
  return String(Math.min(Number(matched[1]), TIMEOUT_STOP_MAX_MIN))
}

/**
 * 应用启动时把上次设的定时接上（spec §4「救活 `player.waitPlayEndStopTime`」）。
 *
 * 为什么要有这一步：时长存在 `appSetting['player.waitPlayEndStopTime']` 里，但**只有弹窗自己读写它**——
 * 每次启动都是空的 `time`（`time.value` 初值 -1），上次设的时长既看不到也不再计时。
 * 这里在开关为真且有存值时按存值重新武装倒计时，让「设定值」在重启后仍然是真在跑的定时。
 *
 * 开关取舍：只在 `player.waitPlayEndStop` 为真时恢复——它是「到点后等本曲放完再停」，
 * 用户明确关掉时不该在启动时自作主张再立一个倒计时。两个值都在本模块读（与 `exit()` 读开关同一处）。
 *
 * ⚠️ 行为面：这是**启动时的行为**（会真的在 N 分钟后暂停一次），改这里要真机验：
 * 设 30 分钟 → 重启 → 设置页按钮上的剩余时间应接着走，到点真的暂停。
 */
export const restoreTimeoutStop = () => {
  if (timeoutTools.isRunning) return
  if (!appSetting['player.waitPlayEndStop']) return
  const text = normalizeTimeoutStopMinutes(appSetting['player.waitPlayEndStopTime'])
  if (!text) return
  startTimeoutStop(Number(text) * 60)
}

const formatTime = (time: number): string => {
  // let d = parseInt(time / 86400)
  // d = d ? d.toString() + ':' : ''
  // time = time % 86400
  let h: number | string = Math.trunc(time / 3600)
  h = h ? h.toString() + ':' : ''
  time = time % 3600
  const m = Math.trunc(time / 60).toString().padStart(2, '0')
  const s = Math.trunc(time % 60).toString().padStart(2, '0')
  return `${h}${m}:${s}`
}
export const useTimeout = () => {
  const timeLabel: ComputedRef<string> = computed(() => {
    return time.value > 0 ? formatTime(time.value) : ''
  })

  return {
    time,
    timeLabel,
  }
}
