/**
 * 开发版数据播种：把安装版（正式数据）的 `LxDatas/` 拷进开发版的数据目录。
 *
 * 为什么需要它：开发版从 2026-09-23 起用**独立 userData**（`<appData>/chiverve-music-dev`，
 * 见 `src/main/app.ts` 的 `setUserDataPath()`），所以首次启动是空库——重新扫码登录、重新收藏一遍太亏。
 * 本脚本一次性把设置 / 列表库 / 明文凭证整套搬过去；之后两个库**各自演进**（dev 里的改动不会回到正式版）。
 *
 * 用法：
 *   npm run dev:seed              # 目标已有数据时跳过（幂等）
 *   npm run dev:seed -- --force   # 覆盖目标
 *
 * ⚠️ 建议先把正式版退掉再播种：SQLite 的 `-wal` 只有在没有写入者时才是完整一致的快照。
 * 脚本只打印文件项数与路径，**不打印任何文件内容**（`qq_auth.json` 是明文凭证）。
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const appDataDir = () => {
  if (process.platform == 'darwin') return path.join(os.homedir(), 'Library', 'Application Support')
  if (process.platform == 'win32') return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
}

const appData = appDataDir()
const src = path.join(appData, 'chiverve-music', 'LxDatas')
const dst = path.join(appData, 'chiverve-music-dev', 'LxDatas')
const force = process.argv.includes('--force')

if (!fs.existsSync(src)) {
  console.error(`[dev:seed] 找不到正式版数据目录：${src}`)
  process.exit(1)
}

const hasData = fs.existsSync(path.join(dst, 'config_v2.json')) || fs.existsSync(path.join(dst, 'lx.data.db'))
if (hasData && !force) {
  console.log(`[dev:seed] 开发版已有数据，跳过：${dst}`)
  console.log('           想用正式版数据覆盖它，加 --force')
  process.exit(0)
}

fs.mkdirSync(dst, { recursive: true })
const entries = fs.readdirSync(src)
for (const name of entries) {
  fs.cpSync(path.join(src, name), path.join(dst, name), { recursive: true, force: true })
}

console.log(`[dev:seed] 已播种 ${entries.length} 项：${src} → ${dst}`)
console.log('           提醒：正式版若还在运行，先退掉再播种，SQLite 快照才完整（-wal 需要没有写入者）')
