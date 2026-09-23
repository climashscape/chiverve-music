import log from 'electron-log/node'
import path from 'path'
import { getUserDataPath } from './userDataPath'

log.transports.file.level = 'info'

/**
 * 日志文件路径**显式指向我们自己的数据目录**（安装版 `~/.config/chiverve-music/logs/main.log`、
 * 开发版 `~/.config/chiverve-music-dev/logs/main.log`）。
 *
 * 为什么不能吃默认值：electron-log 默认按 `app.getPath('logs')` 解析
 * （`electron-log/src/main/ElectronExternalApi.js:48`），而那条路径是 Electron **按应用名在启动时算好的**——
 * 开发版是运行期才 `setName('chiverve-music-dev')`（见 `./userDataPath`），对已算好的 logs 路径无效，
 * 于是 dev 的日志会一路写进正式目录（2026-09-23 实测：正式 main.log 里混进 12 处 dev 痕迹）。
 *
 * 改成由 `./userDataPath` 固定的路径推导后：`resolvePathFn` 每次写入时求值（顺序无关）、
 * 两套数据目录各自记自己的日志，也不再依赖 `app.getPath('logs')` 的语义。
 */
log.transports.file.resolvePathFn = () => path.join(getUserDataPath(), 'logs', 'main.log')
