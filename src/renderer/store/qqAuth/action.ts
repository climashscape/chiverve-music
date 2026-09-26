import {
  getQQAuthStatus,
  getQQLoginQrcode,
  checkQQLogin,
  cancelQQLogin,
  logoutQQ,
  refreshQQCredential,
  onQQAuthStatusChange,
} from '@renderer/utils/ipc'
import { resetUserCenter } from '@renderer/store/user/action'
import { isShowLoginModal, loginError, loginState, qrcode, qrCreatedAt, status, isRefreshing } from './state'

/**
 * QQ 账号交互逻辑。
 *
 * 登录流程本身在主进程跑（见 src/main/modules/qqAuth/login.ts），渲染侧只负责
 * 显示二维码并按 2 秒轮询状态——与 QQ 官方网页登录的节奏一致。
 */

/** 二维码轮询间隔。QQ 二维码约 2 分钟失效，2 秒一次足够及时。 */
const POLL_INTERVAL_MS = 2000

let pollTimer: ReturnType<typeof setInterval> | null = null
let stopStatusListener: (() => void) | null = null

const stopPoll = (): void => {
  if (pollTimer == null) return
  clearInterval(pollTimer)
  pollTimer = null
}

/** 拉一次状态并写入 store。 */
export const initQQAuth = async(): Promise<void> => {
  try {
    Object.assign(status, await getQQAuthStatus())
  } catch (err: any) {
    // 首次调用时主窗口可能尚未就绪，静默即可
    console.log('[qqAuth] get status failed:', err?.message ?? err)
  }
  // 主进程刷新成功/失败都会推状态变更；只订阅一次
  if (stopStatusListener == null) {
    stopStatusListener = onQQAuthStatusChange(({ params }) => {
      Object.assign(status, params)
    })
  }
}

/**
 * 一轮轮询是否还在飞。
 *
 * `setInterval` 每 2 秒发起一次，而 `DONE` 那一轮在主进程里还要串行跑 authorize / 票据兑换，
 * 比 2 秒长——没有这个闸就会叠第二轮：既可能撞上主进程的会话已被消费（旧代码会抛
 * `TypeError: reading 'jar'`，被界面当成登录失败），又会让同一个二维码被重复兑换。
 */
let pollInFlight = false

const poll = async(): Promise<void> => {
  if (pollInFlight) return
  pollInFlight = true
  try {
    const res = await checkQQLogin()
    loginState.value = res.event
    switch (res.event) {
      case 'DONE':
        stopPoll()
        if (res.status != null) Object.assign(status, res.status)
        // 登录成功 = 换了一个会话：清掉账号中心的会话缓存（未登录时进过页面的话，`isInited`
        // 已经被置 true，不清就永远不再取数）。清完由各页在登录信号到达时重拉——
        // 见 store/user/action.ts 的 resetUserCenter 与 Favorites 各面板的 watch
        resetUserCenter()
        // 登录成功后自动关闭弹窗
        isShowLoginModal.value = false
        qrcode.value = ''
        break
      case 'TIMEOUT':
      case 'REFUSE':
        // 保留弹窗，由用户点「刷新二维码」；倒计时提示由模板根据这两个状态给出
        stopPoll()
        break
      default:
        // SCAN / CONF：继续轮询
        break
    }
  } catch (err: any) {
    stopPoll()
    loginError.value = err?.message ?? String(err)
    loginState.value = 'idle'
  } finally {
    // eslint-disable-next-line require-atomic-updates -- 与开头的 `pollInFlight = true` 配对，必须清掉
    pollInFlight = false
  }
}

const startPoll = (): void => {
  stopPoll()
  pollTimer = setInterval(() => {
    void poll()
  }, POLL_INTERVAL_MS)
}

/** 取一张新二维码（首次打开弹窗、或二维码过期后手动刷新）。 */
export const refreshQrcode = async(): Promise<void> => {
  loginError.value = ''
  loginState.value = 'idle'
  try {
    const qr = await getQQLoginQrcode()
    qrcode.value = qr.dataUrl
    qrCreatedAt.value = qr.createdAt
    loginState.value = 'SCAN'
    startPoll()
  } catch (err: any) {
    loginError.value = err?.message ?? String(err)
  }
}

export const openLoginModal = async(): Promise<void> => {
  isShowLoginModal.value = true
  await refreshQrcode()
}

/** 关闭弹窗并通知主进程丢弃当前登录会话。 */
export const closeLoginModal = async(): Promise<void> => {
  stopPoll()
  qrcode.value = ''
  loginState.value = 'idle'
  loginError.value = ''
  isShowLoginModal.value = false
  try {
    await cancelQQLogin()
  } catch (err: any) {
    console.log('[qqAuth] cancel login failed:', err?.message ?? err)
  }
}

export const logout = async(): Promise<void> => {
  try {
    Object.assign(status, await logoutQQ())
  } catch (err: any) {
    // 登出没成功：不动账号中心缓存（凭证可能仍有效，清了会留下没有任何数据可拉的空白页）
    console.log('[qqAuth] logout failed:', err?.message ?? err)
    return
  }
  // 换号 / 登出后绝不把上一个账号的列表与收藏态留在界面上：
  // `favSongIds` 尤其要命（点收藏会按上一个人的数据判方向）
  resetUserCenter()
}

/** 手动刷新凭证。主进程侧刷新有过渡期，失败也不影响已登录状态。 */
export const refreshCredential = async(): Promise<LX.QQAuth.RefreshResult | null> => {
  if (isRefreshing.value) return null
  isRefreshing.value = true
  try {
    const result = await refreshQQCredential()
    Object.assign(status, result.status)
    return result
  } catch (err: any) {
    console.log('[qqAuth] refresh failed:', err?.message ?? err)
    return null
  } finally {
    isRefreshing.value = false
  }
}
