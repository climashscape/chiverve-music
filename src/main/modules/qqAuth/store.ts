import { STORE_NAMES } from '@common/constants'
import getStore from '@main/utils/store'
import { log } from '@common/utils'

/**
 * QQ 凭证的持久化与运行期状态。
 *
 * 落盘位置：`<userData>/LxDatas/qq_auth.json`，单键 `credential` 存整个对象
 * （沿用本仓库「一个业务键存整个结构」的惯例，对照 userApi/utils.ts:9-16）。
 *
 * ⚠️ 安全现状：明文 JSON，无加密（本仓库没有 safeStorage/keytar）。
 * 该决定的成立前提是「单用户本地机器」，详见 docs/specs/0001 §2.3。
 */

// undefined = 尚未从磁盘加载；null = 已加载但未登录
let credential: LX.QQAuth.Credential | null | undefined

let lastRefreshError: string | null = null

export const getCredential = (): LX.QQAuth.Credential | null => {
  if (credential === undefined) {
    credential = (getStore(STORE_NAMES.QQ_AUTH).get('credential') as LX.QQAuth.Credential | null) ?? null
    log.info('[qqAuth] credential loaded:', credential == null ? 'none' : 'present')
  }
  return credential
}

export const saveCredential = (value: LX.QQAuth.Credential | null): void => {
  credential = value
  // Store 无 delete，用 null 占位即可（JSON.stringify 保留 null）
  getStore(STORE_NAMES.QQ_AUTH).set('credential', value)
  log.info('[qqAuth] credential saved:', value == null ? 'cleared' : 'present')
}

export const getLastRefreshError = (): string | null => lastRefreshError

/**
 * 记录最后一次刷新的结果（`null` = 成功/清除）。
 *
 * 只存错误文案：曾经还有一个 `lastRefreshAt` 时间戳，但全仓没有任何消费方（只有写与类型声明），
 * 而 `setCredential` 走 `markRefresh(null)` 还会把它刷成「刚刷新过」的假象——2026-09-26 自审查时删掉。
 */
export const markRefresh = (error: string | null): void => {
  lastRefreshError = error
}

/** 账号脱敏显示：只保留末 4 位。日志与界面都不应出现完整 musicid。 */
export const maskMusicid = (musicid: number | string | null | undefined): string | null => {
  if (musicid == null) return null
  const text = String(musicid)
  return text.length <= 4 ? text : `***${text.slice(-4)}`
}
