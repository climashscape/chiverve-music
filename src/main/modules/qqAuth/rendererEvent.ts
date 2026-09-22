import { mainHandle } from '@common/mainIpc'
import { QQ_AUTH_EVENT_NAME } from '@common/ipcNames'
import { getWebContents } from '@main/modules/winMain/main'
import { getCredential, getStatus, setCredential, logout, refresh } from './utils'
import { startLogin, checkLogin, cancelLogin } from './login'

/**
 * qqAuth 的 IPC 适配层。
 *
 * ⚠️ 安全约束：`mainHandle` 注册在全局 ipcMain 上、**不分窗口**——同一通道任何窗口
 * 都能调用（既有代码只有 winLyric 一处做了来源校验）。QQ 凭证是本项目最敏感的数据，
 * 因此这里对「会返回凭证值」的通道强制校验调用方必须来自主窗口的主 frame，
 * 防止沙箱化的 userApi 窗口或未来新增的窗口读到它。
 */
const assertFromMainWindow = (event: Electron.IpcMainInvokeEvent): void => {
  const mainFrame = getWebContents()?.mainFrame
  if (mainFrame == null || event.senderFrame !== mainFrame) {
    throw new Error('qqAuth: 拒绝来自非主窗口的调用')
  }
}

export const registerRendererEvent = (): void => {
  // 注意：无入参但有返回值的处理器必须用 `mainHandle<返回值>` 并把参数显式标注为
  // `LX.IpcMainInvokeEvent`（不含 params）。若只写 `{ event }` 让 TS 自行推断，
  // 它会先匹配 Params<T> 重载、推成含 params 的形状，进而与 Value<V> 重载不兼容。
  mainHandle<LX.QQAuth.Status>(QQ_AUTH_EVENT_NAME.get_status, async({ event }: LX.IpcMainInvokeEvent) => {
    assertFromMainWindow(event)
    return getStatus()
  })

  // 渲染侧的 musicSdk 需要 musicid/musickey 构造取流请求（见 specs §4.2/§4.6），
  // 这是唯一会把凭证值交给渲染进程的通道，故来源校验最严格。
  mainHandle<LX.QQAuth.Credential | null>(QQ_AUTH_EVENT_NAME.get_credential, async({ event }: LX.IpcMainInvokeEvent) => {
    assertFromMainWindow(event)
    return getCredential()
  })

  // M2 的登录流程登录成功后调用
  mainHandle<LX.QQAuth.SetCredentialParams, LX.QQAuth.Status>(
    QQ_AUTH_EVENT_NAME.set_credential,
    async({ event, params }: LX.IpcMainInvokeEventParams<LX.QQAuth.SetCredentialParams>) => {
      assertFromMainWindow(event)
      return setCredential(params)
    },
  )

  mainHandle<LX.QQAuth.RefreshResult>(QQ_AUTH_EVENT_NAME.refresh, async({ event }: LX.IpcMainInvokeEvent) => {
    assertFromMainWindow(event)
    return refresh(true)
  })

  mainHandle<LX.QQAuth.Status>(QQ_AUTH_EVENT_NAME.logout, async({ event }: LX.IpcMainInvokeEvent) => {
    assertFromMainWindow(event)
    return logout()
  })

  // ---- 扫码登录（M2）。整个流程在主进程跑，渲染侧只负责显示二维码与轮询。 ----

  /** 取二维码：返回 data URL，渲染侧直接塞进 <img src> 即可，无需落盘。 */
  mainHandle<LX.QQAuth.QrCode>(QQ_AUTH_EVENT_NAME.login_get_qrcode, async({ event }: LX.IpcMainInvokeEvent) => {
    assertFromMainWindow(event)
    return startLogin()
  })

  /** 轮询一次状态。返回 DONE 时登录已完成、凭证已落盘（由 M1 的凭证层接管）。 */
  mainHandle<LX.QQAuth.LoginCheckResult>(QQ_AUTH_EVENT_NAME.login_check, async({ event }: LX.IpcMainInvokeEvent) => {
    assertFromMainWindow(event)
    return checkLogin()
  })

  mainHandle(QQ_AUTH_EVENT_NAME.login_cancel, async({ event }: LX.IpcMainInvokeEvent) => {
    assertFromMainWindow(event)
    cancelLogin()
  })
}
