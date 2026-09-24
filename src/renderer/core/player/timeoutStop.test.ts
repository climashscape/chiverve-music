import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { normalizeTimeoutStopMinutes, restoreTimeoutStop, startTimeoutStop, stopTimeoutStop, useTimeout } from './timeoutStop'
import { appSetting, mergeSetting } from '@renderer/store/setting'

/**
 * 定时暂停（票 04 救活 `player.waitPlayEndStopTime`）的两件事：
 * 1. 分钟数校验只有一套口径（弹窗的确认与设置页的输入框共用它）；
 * 2. 启动时的恢复（`restoreTimeoutStop`）：开关为真且有存值才按存值重新武装倒计时。
 *
 * 真实到点暂停（`exit()` → `isPlayedStop`）要在真机上验——这里只钉住「有没有真的开始计时」。
 */
const setSetting = (setting: Record<string, unknown>) => {
  mergeSetting(setting as unknown as Partial<LX.AppSetting>)
}

/** 分钟数 → 秒（`useTimeout().time` 存的是剩余秒数）。 */
const { time, timeLabel } = useTimeout()

describe('normalizeTimeoutStopMinutes（弹窗与设置页共用的校验）', () => {
  it('抓第一段 ≥1 的整数：前后有杂物也认，但调用方会看出「被规整过」', () => {
    expect(normalizeTimeoutStopMinutes('30')).toBe('30')
    expect(normalizeTimeoutStopMinutes(' 30 分')).toBe('30')
    expect(normalizeTimeoutStopMinutes('0030')).toBe('30')
  })

  it('上限 1440 分钟，超出夹到上限', () => {
    expect(normalizeTimeoutStopMinutes('1440')).toBe('1440')
    expect(normalizeTimeoutStopMinutes('9999')).toBe('1440')
  })

  it('空 / 0 / 非数字 / 非字符串都给空串（调用方据此判断「没有有效输入」）', () => {
    for (const value of ['', '0', 'abc', null, undefined]) {
      expect(normalizeTimeoutStopMinutes(value), String(value)).toBe('')
    }
  })

  it('存值可能是数字（弹窗落盘的是 `parseInt` 结果），也要认', () => {
    expect(normalizeTimeoutStopMinutes(30)).toBe('30')
  })
})

describe('restoreTimeoutStop（启动时按存值接着计时）', () => {
  beforeEach(() => {
    stopTimeoutStop()
  })
  afterEach(() => {
    stopTimeoutStop()
  })

  it('开关为真 + 有存值：按存值武装倒计时，按钮标签显示设定值', () => {
    setSetting({ 'player.waitPlayEndStop': true, 'player.waitPlayEndStopTime': 30 })
    restoreTimeoutStop()
    expect(time.value).toBe(30 * 60)
    expect(timeLabel.value).toBe('30:00')
  })

  it('开关为假：不恢复（不擅自立一个倒计时）', () => {
    setSetting({ 'player.waitPlayEndStop': false, 'player.waitPlayEndStopTime': 30 })
    restoreTimeoutStop()
    expect(time.value).toBe(-1)
  })

  it('没设过时长（默认空串）：不恢复', () => {
    setSetting({ 'player.waitPlayEndStop': true, 'player.waitPlayEndStopTime': '' })
    restoreTimeoutStop()
    expect(time.value).toBe(-1)
  })

  it('已经在跑（本次启动内设过）：不被存值覆盖', () => {
    setSetting({ 'player.waitPlayEndStop': true, 'player.waitPlayEndStopTime': 30 })
    startTimeoutStop(5 * 60)
    restoreTimeoutStop()
    expect(time.value).toBe(5 * 60)
  })

  it('存值非法（历史脏数据）：不恢复', () => {
    setSetting({ 'player.waitPlayEndStop': true, 'player.waitPlayEndStopTime': 'abc' })
    restoreTimeoutStop()
    expect(time.value).toBe(-1)
  })

  it('恢复后 appSetting 里的存值不被改写（只读它）', () => {
    setSetting({ 'player.waitPlayEndStop': true, 'player.waitPlayEndStopTime': 30 })
    restoreTimeoutStop()
    expect(appSetting['player.waitPlayEndStopTime']).toBe(30)
  })
})
