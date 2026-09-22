import { registerRendererEvent } from './rendererEvent'
import { getCredential, refresh, startTimer } from './utils'

/**
 * QQ 凭证模块注册入口（M1）。
 *
 * 职责：接上主进程生命周期，并在应用启动时对已有凭证做一次巡检。
 * 不含登录流程本身（M2 实现），登录成功后调 `utils.setCredential()` 交给本模块接管。
 *
 * 分层：本文件只做注册；IPC 适配在 rendererEvent.ts；业务在 utils.ts。
 */
export * from './utils'
export * from './login'

export default () => {
  registerRendererEvent()

  global.lx.event_app.on('app_inited', () => {
    // 已登录才需要巡检；未登录时不启动定时器
    if (getCredential() == null) return
    void refresh()
    startTimer()
  })
}
