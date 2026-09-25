import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestMsg } from '@renderer/utils/message'
import {
  clearUnavailable,
  getUnavailableReason,
  hintUnavailableMusic,
  isUnavailable,
  isUnavailableError,
  isUnavailableMusic,
  markUnavailable,
  onChange,
} from './unavailable'

/**
 * 失效曲登记表的钉子（工单 01）。
 *
 * 钉两件事：
 * 1. **判据是白名单**——只有 tx 取流层「所有档位都没直链」的那条错误才算「不可播」，
 *    网络抖动 / 限流 / 未登录 / 无权限一律不算（算错了就会把能播的歌永久灰掉，
 *    而用户点不动是立即可见的坏体验）；
 * 2. **登记表只认在线歌曲 id**——本地文件（`source == 'local'`）与下载任务对象永远不算失效，
 *    哪怕 id 恰好在表里。
 */

const song = (id: string, source = 'tx') => ({ id, source, name: '歌', singer: '歌手', meta: {} }) as any

beforeEach(() => {
  clearUnavailable('tx_a')
  clearUnavailable('tx_b')
  clearUnavailable('local_/tmp/a.mp3')
})

describe('isUnavailableError：哪些取流失败算「不可播」', () => {
  it('带 `txNoPlayableUrl` 标记的错误算（tx 取流层的「所有档位都没直链」）', () => {
    const err = Object.assign(new Error(requestMsg.noPlayableUrl), { txNoPlayableUrl: true })
    expect(isUnavailableError(err)).toBe(true)
  })

  it('标记丢了但文案还在也算（错误对象可能被别处重新包过）', () => {
    expect(isUnavailableError(new Error(requestMsg.noPlayableUrl))).toBe(true)
  })

  it('网络类失败不算', () => {
    expect(isUnavailableError(new Error(requestMsg.timeout))).toBe(false)
    expect(isUnavailableError(new Error(requestMsg.notConnectNetwork))).toBe(false)
    expect(isUnavailableError(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBe(false)
  })

  it('限流 / 未登录 / 无权限 / 取消 / 初始化失败都不算', () => {
    expect(isUnavailableError(new Error(requestMsg.tooManyRequests))).toBe(false)
    expect(isUnavailableError(new Error('QQ 音乐未登录'))).toBe(false)
    expect(isUnavailableError(new Error(requestMsg.noPermission))).toBe(false)
    expect(isUnavailableError(new Error(requestMsg.cancelRequest))).toBe(false)
    expect(isUnavailableError(new Error('source init failed'))).toBe(false)
  })

  it('非错误对象（null / undefined / 字符串 / 空）都不算', () => {
    expect(isUnavailableError(null)).toBe(false)
    expect(isUnavailableError(undefined)).toBe(false)
    expect(isUnavailableError('该歌曲没有可用的播放地址')).toBe(false)
    expect(isUnavailableError({})).toBe(false)
  })

  it('标记为 false 且没有文案时不算（别把 `false` 当命中）', () => {
    expect(isUnavailableError(Object.assign(new Error('x'), { txNoPlayableUrl: false }))).toBe(false)
  })
})

describe('登记表：标记 / 查询 / 撤销 / 订阅', () => {
  it('登记后能查到，带上原因', () => {
    expect(isUnavailable('tx_a')).toBe(false)
    markUnavailable('tx_a')
    expect(isUnavailable('tx_a')).toBe(true)
    expect(getUnavailableReason('tx_a')).toBe('noPlayableUrl')
  })

  it('同一首重复登记只通知一次（幂等）', () => {
    const listener = vi.fn()
    const off = onChange(listener)
    markUnavailable('tx_a')
    markUnavailable('tx_a')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })

  it('撤销登记（真取到流时）后查不到，且通知一次 null', () => {
    const listener = vi.fn()
    const off = onChange(listener)
    markUnavailable('tx_a')
    clearUnavailable('tx_a')
    expect(isUnavailable('tx_a')).toBe(false)
    expect(getUnavailableReason('tx_a')).toBe(null)
    expect(listener).toHaveBeenLastCalledWith('tx_a', null)
    // 撤销一个本来就没登记的 id 不通知（免得白刷订阅方）
    clearUnavailable('tx_a')
    expect(listener).toHaveBeenCalledTimes(2)
    off()
  })

  it('空 id 不登记、不通知', () => {
    const listener = vi.fn()
    const off = onChange(listener)
    markUnavailable('')
    expect(listener).not.toHaveBeenCalled()
    expect(isUnavailable('')).toBe(false)
    off()
  })

  it('取消订阅后不再收到通知', () => {
    const listener = vi.fn()
    onChange(listener)()
    markUnavailable('tx_b')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('isUnavailableMusic：本地文件与下载任务永远不算失效', () => {
  it('在线歌曲按 id 认', () => {
    markUnavailable('tx_a')
    expect(isUnavailableMusic(song('tx_a'))).toBe(true)
    expect(isUnavailableMusic(song('tx_other'))).toBe(false)
  })

  it('本地文件即使 id 在表里也不算（它读磁盘，不走 tx 取流）', () => {
    markUnavailable('local_/tmp/a.mp3')
    expect(isUnavailableMusic(song('local_/tmp/a.mp3', 'local'))).toBe(false)
  })

  it('下载任务对象（带 progress）不算', () => {
    markUnavailable('tx_a')
    expect(isUnavailableMusic({ id: 'tx_a', progress: 1 } as any)).toBe(false)
  })

  it('空值不算', () => {
    expect(isUnavailableMusic(null)).toBe(false)
    expect(isUnavailableMusic(undefined)).toBe(false)
  })
})

describe('点不动时的那句提示走既有机制', () => {
  it('写进播放栏状态文本（仓库没有 toast，见 AGENTS §2.11）', async() => {
    const { statusText } = await import('@renderer/store/player/state')
    const zhCn = (await import('@root/lang/zh-cn.json')).default as Record<string, string>
    statusText.value = ''
    hintUnavailableMusic()
    // 文案 key 与行内 title 共用；顺带钉住它在语言文件里真的有值（漏翻/改名会红）
    expect(statusText.value).toBe(zhCn.list__unavailable_song)
    expect(zhCn.list__unavailable_song).toBeTruthy()
  })
})
