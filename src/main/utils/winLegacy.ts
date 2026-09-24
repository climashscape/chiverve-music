import os from 'node:os'

import { dialog } from 'electron'
import { STORE_NAMES } from '@common/constants'
import getStore from '@main/utils/store'


const showWinLegacyMessage = () => {
  if (process.platform !== 'win32') return
  const storeKey = 'winLegacyMessageShown'
  const dataStore = getStore(STORE_NAMES.DATA)
  const count = dataStore.get<number>(storeKey) || 0
  if (count > 2) return
  const osVersion = os.release()
  const majorVersion = parseInt(osVersion.split('.')[0], 10)
  const isOldWindows = majorVersion < 10

  if (isOldWindows) {
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Windows 旧版提示',
      message: '您正在使用专为旧版 Windows 准备的 Ch\'iverve，它仅用于实在无法升级到新版系统的用户。\n该版本缺乏安全更新，可能存在安全风险，并且功能未经测试，可能存在兼容性问题。\n\n如果您的设备支持 Windows 10 或更高版本，强烈建议升级系统，切换到标准版本的 Ch\'iverve，以获得更好的安全性和性能。',
      buttons: ['知道了'],
    })
    if (result === 0) {
      dataStore.set(storeKey, count + 1)
    }
  } else {
    // 只有「知道了」：原先这里有个「跳转新版发布页」按钮指向 GitHub Releases，
    // 2026-09-24 用户裁定删除发布链路、ADR-0008 不对外发布任何打包版，没有发布页可跳。
    // 文案里也不能再承诺「切换到标准版本」的下载入口——标准版本要自己构建。
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      title: '您正在使用旧版',
      message: '您正在使用专为旧版 Windows 准备的 Ch\'iverve，它仅用于实在无法升级到新版系统的用户，但您的系统似乎在标准版的支持范围内，为了获得最佳体验，请改用标准版本（本仓库不提供打包版，需自行构建）。\n\n注意：当前版本缺乏安全更新，可能存在安全风险，并且功能未经测试，可能存在兼容性问题。',
      buttons: ['知道了'],
    })
    if (result === 0) {
      dataStore.set(storeKey, count + 1)
    }
  }
}

showWinLegacyMessage()
