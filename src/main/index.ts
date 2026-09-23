// ⚠️ 第一行必须是它：userData 与开发版身份要在 logInit（按 userData 决定日志位置）与
// 单实例锁（按 userData 建立）之前定好——顺序错了，开发版会把日志写进正式目录（见该文件注释）
import './utils/userDataPath'
import { app } from 'electron'
import './utils/logInit'
import '@common/error'
import {
  initGlobalData,
  initSingleInstanceHandle,
  applyElectronEnvParams,
  registerDeeplink,
  listenerAppEvent,
} from './app'
import { isLinux } from '@common/utils'
import { initAppSetting } from '@main/app'
import registerModules from '@main/modules'

// 初始化应用
const init = () => {
  console.log('init')
  if (process.env.BUILD_WIN7 == 'true') import('./utils/winLegacy')
  void initAppSetting().then(() => {
    registerModules()
    global.lx.event_app.app_inited()
  })
}

initGlobalData()
// 数据目录与身份已在文件头的 `./utils/userDataPath` 里定好（必须在它之后、单实例锁之前，见该文件注释）
initSingleInstanceHandle()
applyElectronEnvParams()
registerDeeplink(init)
listenerAppEvent(init)


// https://github.com/electron/electron/issues/16809
void app.whenReady().then(() => {
  isLinux ? setTimeout(init, 300) : init()
})
