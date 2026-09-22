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

let lastRefreshAt: number | null = null
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

export const getLastRefreshAt = (): number | null => lastRefreshAt

export const getLastRefreshError = (): string | null => lastRefreshError

export const markRefresh = (error: string | null): void => {
  lastRefreshAt = Date.now()
  lastRefreshError = error
}

/** 账号脱敏显示：只保留末 4 位。日志与界面都不应出现完整 musicid。 */
export const maskMusicid = (musicid: number | string | null | undefined): string | null => {
  if (musicid == null) return null
  const text = String(musicid)
  return text.length <= 4 ? text : `***${text.slice(-4)}`
}
