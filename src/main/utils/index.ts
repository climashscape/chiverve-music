import { encodePath, isUrl, throttle, isMac, log } from '@common/utils'
import migrateSetting from '@common/utils/migrateSetting'
import getStore from '@main/utils/store'
import { STORE_NAMES, URL_SCHEME_RXP } from '@common/constants'
import defaultSetting from '@common/defaultSetting'
import defaultHotKey from '@common/defaultHotKey'
import { migrateDataJson, migrateHotKey, migrateUserApi, parseDataFile } from './migrate'
import { nativeTheme, powerSaveBlocker } from 'electron'
import { joinPath } from '@common/utils/nodejs'
import themes from '@common/theme/index.json'

export const parseEnvParams = (argv = process.argv): { cmdParams: LX.CmdParams, deeplink: string | null } => {
  const cmdParams: LX.CmdParams = {}
  let deeplink = null
  const rx = /^-\w+/
  for (let param of argv) {
    if (URL_SCHEME_RXP.test(param)) {
      deeplink = param
    }

    if (!rx.test(param)) continue
    param = param.substring(1)
    let index = param.indexOf('=')
    if (index < 0) {
      cmdParams[param] = true
    } else {
      cmdParams[param.substring(0, index)] = param.substring(index + 1)
    }
  }
  return {
    cmdParams,
    deeplink,
  }
}

const primitiveType = ['string', 'boolean', 'number']
const checkPrimitiveType = (val: any): boolean => val === null || primitiveType.includes(typeof val)
// const handleMergeSetting = (defaultSetting: LX.AppSetting, currentSetting: Partial<LX.AppSetting>) => {
//   const updatedSettingKeys: Array<keyof LX.AppSetting> = []
//   for (const key of Object.keys(defaultSetting) as Array<keyof LX.AppSetting>) {
//     const currentValue: any = currentSetting[key]
//     const isPrimitive = checkPrimitiveType(currentValue)
//     // if (checkPrimitiveType(value)) {
//     if (!isPrimitive) continue
//     updatedSettingKeys.push(key)
//     // @ts-expect-error
//     defaultSetting[key] = currentValue
//     // } else {
//     //   if (!isPrimitive && currentValue != undefined) handleMergeSetting(value, currentValue)
//     // }
//   }
//   return {
//     setting: defaultSetting,
//     updatedSettingKeys,
//   }
// }

export const mergeSetting = (originSetting: LX.AppSetting, targetSetting?: Partial<LX.AppSetting> | null): {
  setting: LX.AppSetting
  updatedSettingKeys: Array<keyof LX.AppSetting>
  updatedSetting: Partial<LX.AppSetting>
} => {
  let originSettingCopy: LX.AppSetting = { ...originSetting }
  // const defaultVersion = targetSettingCopy.version
  const updatedSettingKeys: Array<keyof LX.AppSetting> = []
  const updatedSetting: Partial<LX.AppSetting> = {}

  if (targetSetting) {
    const originSettingKeys = Object.keys(originSettingCopy)
    const targetSettingKeys = Object.keys(targetSetting)

    if (originSettingKeys.length > targetSettingKeys.length) {
      for (const key of targetSettingKeys as Array<keyof LX.AppSetting>) {
        const targetValue: any = targetSetting[key]
        const isPrimitive = checkPrimitiveType(targetValue)
        // if (checkPrimitiveType(value)) {
        if (!isPrimitive || targetValue == originSettingCopy[key] || originSettingCopy[key] === undefined) continue
        updatedSettingKeys.push(key)
        updatedSetting[key] = targetValue
        // @ts-expect-error
        originSettingCopy[key] = targetValue
        // } else {
        //   if (!isPrimitive && currentValue != undefined) handleMergeSetting(value, currentValue)
        // }
      }
    } else {
      for (const key of originSettingKeys as Array<keyof LX.AppSetting>) {
        const targetValue: any = targetSetting[key]
        const isPrimitive = checkPrimitiveType(targetValue)
        // if (checkPrimitiveType(value)) {
        if (!isPrimitive || targetValue == originSettingCopy[key]) continue
        updatedSettingKeys.push(key)
        updatedSetting[key] = targetValue
        // @ts-expect-error
        originSettingCopy[key] = targetValue
        // } else {
        //   if (!isPrimitive && currentValue != undefined) handleMergeSetting(value, currentValue)
        // }
      }
    }
  }

  return {
    setting: originSettingCopy,
    updatedSettingKeys,
    updatedSetting,
  }
}

const applyInitSetting = (setting: LX.AppSetting) => {
  if (global.envParams.cmdParams.hidden && !setting['tray.enable']) {
    setting['tray.enable'] = true
  }
}

export const updateSetting = (setting?: Partial<LX.AppSetting>, isInit: boolean = false) => {
  const electronStore_config = getStore(STORE_NAMES.APP_SETTINGS)

  let originSetting: LX.AppSetting
  if (isInit) {
    setting &&= migrateSetting(setting)
    applyInitSetting(setting as LX.AppSetting)
    originSetting = { ...defaultSetting }
  } else originSetting = global.lx.appSetting

  const result = mergeSetting(originSetting, setting)

  result.setting.version = defaultSetting.version

  electronStore_config.override({ version: result.setting.version, setting: result.setting })
  return result
}

/**
 * 初始化设置
 */
export const initSetting = async() => {
  const electronStore_config = getStore(STORE_NAMES.APP_SETTINGS)

  let setting = electronStore_config.get('setting') as LX.AppSetting | undefined

  // migrate setting
  if (!setting) {
    const config = await parseDataFile<{ setting?: any }>('config.json')
    if (config?.setting) setting = config.setting as LX.AppSetting
    await migrateUserApi()
    await migrateDataJson()
  }

  // console.log(setting)
  return updateSetting(setting, true)
}

/**
 * 初始化快捷键设置
 */
export const initHotKey = async() => {
  const electronStore_hotKey = getStore(STORE_NAMES.HOTKEY)

  let localConfig = electronStore_hotKey.get('local') as LX.HotKeyConfig | null
  let globalConfig = electronStore_hotKey.get('global') as LX.HotKeyConfig | null

  if (globalConfig) {
    // 移除v2.2.0及之前设置的全局媒体快捷键注册
    if (globalConfig.keys.MediaPlayPause) {
      delete globalConfig.keys.MediaPlayPause
      delete globalConfig.keys.MediaNextTrack
      delete globalConfig.keys.MediaPreviousTrack
      electronStore_hotKey.set('global', globalConfig)
    }
  } else {
    // migrate hotKey
    const config = await migrateHotKey()
    if (config) {
      localConfig = config.local
      globalConfig = config.global
    } else {
      localConfig = JSON.parse(JSON.stringify(defaultHotKey.local))
      globalConfig = JSON.parse(JSON.stringify(defaultHotKey.global))
    }

    electronStore_hotKey.set('local', localConfig)
    electronStore_hotKey.set('global', globalConfig)
  }

  return {
    local: localConfig!,
    global: globalConfig!,
  }
}

type HotKeyType = 'local' | 'global'

const saveHotKeyConfig = throttle<[LX.HotKeyConfigAll]>((config: LX.HotKeyConfigAll) => {
  for (const key of Object.keys(config) as HotKeyType[]) {
    global.lx.hotKey.config[key] = config[key]
    getStore(STORE_NAMES.HOTKEY).set(key, config[key])
  }
})
export const saveAppHotKeyConfig = (config: LX.HotKeyConfigAll) => {
  saveHotKeyConfig(config)
}

export const openDevTools = (webContents: Electron.WebContents) => {
  webContents.openDevTools({
    mode: 'undocked',
  })
}


let userThemes: LX.Theme[]
export const getAllThemes = () => {
  userThemes ??= getStore(STORE_NAMES.THEME).get('themes') as (LX.Theme[] | null) ?? []
  return {
    themes,
    userThemes,
    dataPath: joinPath(global.lxDataPath, 'theme_images'),
  }
}

export const saveTheme = (theme: LX.Theme) => {
  const targetTheme = userThemes.find(t => t.id === theme.id)
  if (targetTheme) Object.assign(targetTheme, theme)
  else userThemes.push(theme)
  getStore(STORE_NAMES.THEME).set('themes', userThemes)
}

export const removeTheme = (id: string) => {
  const index = userThemes.findIndex(t => t.id === id)
  if (index < 0) return
  userThemes.splice(index, 1)
  getStore(STORE_NAMES.THEME).set('themes', userThemes)
}

const copyTheme = (theme: LX.Theme): LX.Theme => {
  return {
    ...theme,
    config: {
      ...theme.config,
      extInfo: { ...theme.config.extInfo },
      themeColors: { ...theme.config.themeColors },
    },
  }
}
export const getTheme = () => {
  // fs.promises.readdir()
  const shouldUseDarkColors = nativeTheme.shouldUseDarkColors
  let themeId = global.lx.appSetting['theme.id'] == 'auto'
    ? shouldUseDarkColors
      ? global.lx.appSetting['theme.darkId']
      : global.lx.appSetting['theme.lightId']
    : global.lx.appSetting['theme.id']
  // themeId = 'naruto'
  // themeId = 'pink'
  // themeId = 'black'
  let theme = themes.find(theme => theme.id == themeId)
  if (!theme) {
    userThemes = getStore(STORE_NAMES.THEME).get('themes') as LX.Theme[] | null ?? []
    theme = userThemes.find(theme => theme.id == themeId)
    if (theme) {
      if (theme.config.extInfo['--background-image'] != 'none') {
        theme = copyTheme(theme)
        theme.config.extInfo['--background-image'] =
          isUrl(theme.config.extInfo['--background-image'])
            ? `url(${theme.config.extInfo['--background-image']})`
            : `url(${encodePath(joinPath(global.lxDataPath, 'theme_images', theme.config.extInfo['--background-image']))})`
      }
    } else {
      themeId = global.lx.appSetting['theme.id'] == 'auto' && shouldUseDarkColors ? 'black' : 'green'
      theme = themes.find(theme => theme.id == themeId) as LX.Theme
    }
  }

  const colors: Record<string, string> = {
    ...theme.config.themeColors,
    ...theme.config.extInfo,
  }

  return {
    shouldUseDarkColors,
    theme: {
      id: global.lx.appSetting['theme.id'],
      name: theme.name,
      isDark: theme.isDark,
      isDarkFont: theme.isDarkFont,
      colors,
    },
  }
}

let powerSaveBlockerId: number | null = null
export const setPowerSaveBlocker = (enabled: boolean) => {
  let isEnabled = powerSaveBlockerId != null && powerSaveBlocker.isStarted(powerSaveBlockerId)
  if (enabled) {
    if (isEnabled) return
    powerSaveBlockerId = powerSaveBlocker.start(isMac ? 'prevent-display-sleep' : 'prevent-app-suspension')
  } else {
    if (!isEnabled) return
    powerSaveBlocker.stop(powerSaveBlockerId!)
    powerSaveBlockerId = null
  }
}


let envProxy: null | { host: string, port: number } = null
export const getProxy = () => {
  if (global.lx.appSetting['network.proxy.enable'] && global.lx.appSetting['network.proxy.host']) {
    return {
      host: global.lx.appSetting['network.proxy.host'],
      port: parseInt(global.lx.appSetting['network.proxy.port'] || '80'),
    }
  }
  if (envProxy) {
    return {
      host: envProxy.host,
      port: envProxy.port,
    }
  } else {
    const envProxyStr = envParams.cmdParams['proxy-server']
    if (envProxyStr && typeof envProxyStr == 'string') {
      const [host, port = ''] = envProxyStr.split(':')
      return envProxy = {
        host,
        port: parseInt(port || '80'),
      }
    }
  }

  return null
}

/**
 * 启动时按设置回收一次 URL 缓存（设置页重构票 08，在 `main/app.ts` 的 `initAppSetting` 里 await）。
 *
 * 为什么是主进程、且在这个时间点：
 * - 两个阈值（`cache.musicUrlKeepDays` / `cache.maxSizeMB`）只有主进程手里的 `global.lx.appSetting`
 *   是权威值，渲染侧要到设置下发之后才有；
 * - `initAppSetting` 跑在 `registerModules()`（建窗口）**之前**，await 它等于「窗口还没出现就收完了」——
 *   启动这一次不可能删到「正在播的那条 URL」，所以不需要传 `keepIdPrefix`（那时还没开始取流）；
 * - 两个阈值都是 0（默认）时 worker 侧直接返回、不读库：默认配置下这段是零开销，行为与改造前一致。
 *
 * 失败只记日志不抛：回收是维护动作，最坏是下次播放多取一次流，不该挡住启动。
 * 日志只记条数与字节数，**不记 URL**（缓存里的 URL 带签名参数，属不该落盘的凭证类信息）。
 */
export const recycleMusicUrlCache = async() => {
  const { 'cache.musicUrlKeepDays': keepDays, 'cache.maxSizeMB': maxSizeMB } = global.lx.appSetting
  try {
    const result = await global.lx.worker.dbService.musicUrlRecycle({ keepDays, maxSizeMB })
    if (result.skipped) return
    log.info(`[cache] music url recycle: keepDays=${keepDays} maxSizeMB=${maxSizeMB} deleted=${result.deleted} bytes=${result.bytesBefore}->${result.bytesAfter}`)
  } catch (err) {
    log.error(err)
  }
}
