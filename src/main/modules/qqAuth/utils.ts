import { sendEvent } from '@main/modules/winMain/main'
import { QQ_AUTH_EVENT_NAME } from '@common/ipcNames'
import { log } from '@common/utils'
import {
  getCredential,
  saveCredential,
  getLastRefreshAt,
  getLastRefreshError,
  markRefresh,
  maskMusicid,
} from './store'
import { refreshCredential } from './refresh'

/**
 * QQ 凭证的业务逻辑层。
 *
 * 分三层是为了避开循环依赖（对照 hotKey 模块的组织方式）：
 *   index.ts（注册） → rendererEvent.ts（IPC 适配） → utils.ts（业务，本文件）
 * 业务层不 import 上面两层，故无环。
 *
 * 调度策略依据 M0 实测（docs/specs/0001 §5.0）：
 *   - `keyExpiresIn` = 259200 秒 = 3 天
 *   - 刷新有过渡期（新旧 key 短期并存），所以刷新失败不必登出、可重试
 */

/** 距过期不足该秒数即触发刷新（3 天有效期的前提下，提前半天足够） */
const REFRESH_AHEAD_SECONDS = 12 * 60 * 60
/** 巡检间隔 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

let timer: NodeJS.Timeout | null = null
let refreshing = false

/** 计算过期时间戳。优先用 expiredAt，缺失时用 createTime + keyExpiresIn 推导。 */
const expiresAtOf = (cred: LX.QQAuth.Credential | null): number | null => {
  if (cred == null) return null
  if (typeof cred.expiredAt === 'number' && cred.expiredAt > 0) return cred.expiredAt
  if (typeof cred.musickeyCreateTime === 'number' && typeof cred.keyExpiresIn === 'number') {
    return cred.musickeyCreateTime + cred.keyExpiresIn
  }
  return null
}

export const getStatus = (): LX.QQAuth.Status => {
  const cred = getCredential()
  const expiresAt = expiresAtOf(cred)
  return {
    isLogin: cred != null,
    // 界面上只显示脱敏账号，避免完整 musicid 出现在截图/日志里
    musicidMasked: maskMusicid(cred?.musicid),
    expiresAt,
    expiresInSeconds: expiresAt == null ? null : expiresAt - Math.floor(Date.now() / 1000),
    lastRefreshAt: getLastRefreshAt(),
    lastRefreshError: getLastRefreshError(),
  }
}

const broadcast = (): LX.QQAuth.Status => {
  const status = getStatus()
  sendEvent(QQ_AUTH_EVENT_NAME.status_change, status)
  return status
}

/** 登录成功后由 M2 的登录流程调用。 */
export const setCredential = (cred: LX.QQAuth.Credential): LX.QQAuth.Status => {
  saveCredential(cred)
  markRefresh(null)
  startTimer()
  return broadcast()
}

export const logout = (): LX.QQAuth.Status => {
  saveCredential(null)
  return broadcast()
}

/**
 * 刷新凭证。
 * @param force 跳过「距过期还早」的判断强制刷新（界面上的手动刷新按钮用）
 */
export const refresh = async(force = false): Promise<LX.QQAuth.RefreshResult> => {
  const cred = getCredential()
  if (cred == null) return { ok: false, status: getStatus(), message: '未登录' }
  if (refreshing) return { ok: false, status: getStatus(), message: '已有刷新任务进行中' }

  if (!force) {
    const { expiresInSeconds } = getStatus()
    if (expiresInSeconds != null && expiresInSeconds > REFRESH_AHEAD_SECONDS) {
      return { ok: true, status: getStatus() }
    }
  }

  refreshing = true
  try {
    const next = await refreshCredential(cred)
    saveCredential(next)
    markRefresh(null)
    return { ok: true, status: broadcast() }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    markRefresh(message)
    log.error('[qqAuth] refresh failed:', message)
    // 刷新失败不登出：M0 实测刷新有过渡期，旧 key 短期仍可用，可重试
    return { ok: false, status: broadcast(), message }
  } finally {
    refreshing = false
  }
}

export const startTimer = (): void => {
  if (timer) return
  timer = setInterval(() => {
    void refresh()
  }, CHECK_INTERVAL_MS)
  timer.unref()
}

export { getCredential } from './store'
export { refreshCredential } from './refresh'
