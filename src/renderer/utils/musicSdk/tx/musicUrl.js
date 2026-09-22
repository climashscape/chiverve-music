import { getQQCredential } from '@renderer/utils/ipc'
import { requestMsg } from '../../message'
import { txCgi, buildComm } from './utils/request'

/**
 * QQ 音乐取流（M3）。
 *
 * 链路：`vkey.GetVkeyServer/CgiGetVkey` → `data.midurlinfo[i].purl`，用
 * `data.sip[0]` 拼成直链。M0 实测：直链返回 `200` + `audio/mpeg` +
 * `Access-Control-Allow-Origin: *`（WebAudio 的硬要求），且与平台档案无关。
 *
 * 音质映射用**非加密枚举**（见 spec §4.7）；换成 `EncryptedSongFileType` 会拿到
 * `.mflac` 需要解密，属非目标。
 */
const QUALITY_MAP = {
  '128k': { prefix: 'M500', ext: '.mp3' },
  '320k': { prefix: 'M800', ext: '.mp3' },
  flac: { prefix: 'F000', ext: '.flac' },
  flac24bit: { prefix: 'AI00', ext: '.flac' },
}

/** 由低到高。降级时从请求档往低处找（顺序有语义，别随手改）。 */
const QUALITY_ORDER = ['128k', '320k', 'flac', 'flac24bit']

/** sip 缺失时的兜底 CDN（正常情况下响应里一定带 sip）。 */
const DEFAULT_SIP = 'https://isure.stream.qqmusic.qq.com/'

/**
 * 文件名规则（spec §4.6 / song.py:337-340）：
 * 有 `media_mid` 时 `{前缀}{media_mid}{后缀}`，否则 `{前缀}{mid}{mid}{后缀}`。
 * 本仓库的 `songInfo.strMediaMid` 就是 media_mid。
 */
const buildFilename = (songInfo, { prefix, ext }) => {
  const mediaMid = songInfo.strMediaMid
  return mediaMid
    ? `${prefix}${mediaMid}${ext}`
    : `${prefix}${songInfo.songmid}${songInfo.songmid}${ext}`
}

const requestQuality = (songInfo, type, credential) => {
  return txCgi({
    module: 'vkey.GetVkeyServer',
    method: 'CgiGetVkey',
    param: {
      filename: [buildFilename(songInfo, QUALITY_MAP[type])],
      // guid 仅用于标识请求方，探针用的是固定值（上游客户端为设备指纹，本项目不做伪造）
      guid: '10000',
      songmid: [songInfo.songmid],
      songtype: [0],
      // ⚠️ 字符串：数字型 uin 会让 vkey 模块返回 code 10006（M3 实测，见 utils/request.js）
      uin: String(credential.musicid ?? ''),
      loginflag: 1,
      platform: '20',
    },
  }, buildComm(credential))
}

/**
 * 取流。返回 `{ promise, cancelHttp }`（**不是裸 Promise**，见 §2.6 硬约束 1）。
 *
 * 降级策略：`purl` 为空 = 该档无权限（VIP/绿钻不足，result 常见 104003），
 * 依次往下试更低档；**resolve 的 `type` 必须是实际拿到的档位**——URL 缓存
 * key 是 `${id}_${type}`，谎报会把低档 URL 存进高档（§2.6 硬约束 2）。
 */
export const getMusicUrl = (songInfo, type) => {
  let current = null
  let cancelled = false

  const requestObj = {
    cancelHttp: () => {
      cancelled = true
      if (current?.cancelHttp) current.cancelHttp()
    },
    promise: null,
  }

  requestObj.promise = (async() => {
    const credential = await getQQCredential()
    if (credential == null) throw new Error('QQ 音乐未登录')

    const idx = QUALITY_ORDER.indexOf(type)
    // 请求档已知 → 从它往低找；未知档（理论上不会出现）→ 从最高档往低找
    const tryList = (idx >= 0 ? QUALITY_ORDER.slice(0, idx + 1) : QUALITY_ORDER).slice().reverse()

    let lastError = null
    for (const quality of tryList) {
      if (cancelled) throw new Error(requestMsg.cancelRequest)
      current = requestQuality(songInfo, quality, credential)
      try {
        const node = await current.promise
        const info = node?.data?.midurlinfo?.[0]
        const purl = info?.purl ?? ''
        if (purl !== '') {
          const sip = node?.data?.sip?.[0] ?? DEFAULT_SIP
          return {
            type: quality,
            url: /^https?:/.test(purl) ? purl : `${sip}${purl}`,
          }
        }
        // purl 为空：多半是权限不足，降级重试（而非直接失败）
        console.log(`[tx] ${quality} 无直链（result=${info?.result ?? '-'}），降级重试`)
      } catch (err) {
        if (err?.message === requestMsg.cancelRequest) throw err
        lastError = err
      }
    }

    throw lastError ?? new Error('获取播放链接失败')
  })()

  return requestObj
}

export default { getMusicUrl }
