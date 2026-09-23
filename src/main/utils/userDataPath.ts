import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

/**
 * 数据目录与身份：**显式固定**，不依赖 `app.getName()`。
 *
 * 开发版与安装版并存（2026-09-23 用户定）：dev 走 `<appData>/chiverve-music-dev`，安装版走 `<appData>/chiverve-music`。
 * 目录一分开，跟着 userData 建的**单实例锁也分开**——于是 `npm run dev` 与装好的包可以同时跑，
 * 且开发版不会读写你日常那套设置 / 列表库 / 明文凭证。
 *
 * ⚠️ **这个模块靠 import 顺序生效**：`src/main/index.ts` 必须在 `./utils/logInit` 与
 * `initSingleInstanceHandle()` **之前** import 它——electron-log 是按 userData 决定日志文件位置的，
 * 晚一步就会把开发版的日志写进正式目录（2026-09-23 实测踩过）；单实例锁同理（按 userData 建立）。
 * 所以这里**在模块顶层直接执行**，而不是导出一个函数指望调用方记得调。
 */
const setup = () => {
  const isDev = process.env.NODE_ENV === 'development'
  const appDirName = isDev ? 'chiverve-music-dev' : 'chiverve-music'
  // 开发版在系统层面也自报家门（WM_CLASS / 任务栏 / 托盘），一眼能看出哪个窗口是 dev
  if (isDev) app.setName(appDirName)

  // windows平台下如果应用目录下存在 portable 文件夹则将数据存在此文件下
  let userDataPath = ''
  if (process.platform == 'win32') {
    const portablePath = path.join(path.dirname(app.getPath('exe')), '/portable')
    if (existsSync(portablePath)) {
      app.setPath('appData', portablePath)
      userDataPath = path.join(portablePath, '/userData')
      if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })
    }
  }
  if (!userDataPath) {
    // 显式固定：显示名怎么改都不动数据目录（AGENTS §8 的红线）
    userDataPath = path.join(app.getPath('appData'), appDirName)
  }
  app.setPath('userData', userDataPath)

  global.lxOldDataPath = userDataPath
  global.lxDataPath = path.join(userDataPath, 'LxDatas')
  // recursive：开发版首次启动时 userData 目录本身还不存在
  if (!existsSync(global.lxDataPath)) mkdirSync(global.lxDataPath, { recursive: true })
}

setup()
