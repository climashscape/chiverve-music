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

/**
 * `midurlinfo[].result` 的业务结果码（参考实现 `docs/tutorial/download.md`）：
 * `0` 成功、`104003` 无权限（未登录或等级不够）、`104004` VKey 获取失败、`104013` 播放设备受限。
 */
const RESULT_NO_PERMISSION = 104003

/**
 * 网关级限流码。探针 2026-09-25 实测：对 vkey 连刷约 150 次后，服务端按**本机 IP** 返回
 * `code=104009` + `msg='<ip>;invalidq;'`，`midurlinfo[].purl` 全空（静置 5 分钟未恢复），
 * 与具体是哪首歌无关。它必须与「这首歌没有直链」分开判——拿限流当失效判据会把一大批
 * 能播的歌标成失效，而且应用自己的取流也在同一 IP 上（见 `core/music/unavailable.ts`）。
 */
const GATEWAY_RATE_LIMITED = 104009

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
 *
 * 失败形态分档（**别把它们的错误文案合并**，工单 01 靠这个区分「失效曲」与「暂时播不了」）：
 * | 形态 | 抛什么 |
 * |---|---|
 * | 所有档位都问过、码 0 且响应形状正常、就是没有直链 | `requestMsg.noPlayableUrl` + `txNoPlayableUrl` 标记（= 无版权/已下架） |
 * | 服务端说无权限（`result=104003`，含会员/等级/数字专辑未购买） | `requestMsg.noPermission` |
 * | 网关限流（`code=104009`） | `requestMsg.tooManyRequests`（上层按延迟重试，见 `core/player/action.ts`） |
 * | 请求级失败（网络/超时）或网关码非 0 / 响应形状不对 | 原样抛（网络错误本身，或 `QQ 接口错误（码）`） |
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

    let lastError = null // 请求级失败：真实原因，优先原样抛出
    let gatewayError = null // 网关级失败：这一轮没拿到可信结论，不能当「没有直链」
    let noPermission = false // 出现过「无权限」业务码
    let rateLimited = false
    const purlEmptyResults = []

    for (const quality of tryList) {
      if (cancelled) throw new Error(requestMsg.cancelRequest)
      current = requestQuality(songInfo, quality, credential)
      try {
        const node = await current.promise
        // 数值串 "0" 也认（网关偶尔回字符串），故用宽松比较
        if (node?.code != null && node.code != 0) {
          // 限流对所有档位一视同仁，再往下试只是白刷接口（还会延长限流），立刻交给上层延迟重试
          if (node.code == GATEWAY_RATE_LIMITED) {
            rateLimited = true
            break
          }
          gatewayError ??= new Error(`QQ 接口错误（${node.code}）`)
          continue
        }
        const info = node?.data?.midurlinfo?.[0]
        // 没有 midurlinfo：响应形状与预期不符，**不能**当成「这首歌没有直链」的结论
        if (info == null) {
          gatewayError ??= new Error('QQ 接口响应异常')
          continue
        }
        const purl = info.purl ?? ''
        if (purl !== '') {
          const sip = node?.data?.sip?.[0] ?? DEFAULT_SIP
          return {
            type: quality,
            url: /^https?:/.test(purl) ? purl : `${sip}${purl}`,
          }
        }
        // purl 为空：多半是权限不足，降级重试（而非直接失败）
        if (info.result == RESULT_NO_PERMISSION) noPermission = true
        purlEmptyResults.push(info.result)
        console.log(`[tx] ${quality} 无直链（result=${info.result ?? '-'}），降级重试`)
      } catch (err) {
        if (err?.message === requestMsg.cancelRequest) throw err
        lastError = err
      }
    }

    // 判性质：**只有最后那一条**才是「这首歌不可播」（判据见 `core/music/unavailable.ts`）
    if (rateLimited) throw new Error(requestMsg.tooManyRequests)
    if (lastError != null) throw lastError
    if (gatewayError != null) throw gatewayError
    // 服务端说无权限：会员 / 等级 / 数字专辑未购买都能落到这里，按「需要会员」处理，不标失效
    if (noPermission) throw new Error(requestMsg.noPermission)
    throw Object.assign(new Error(requestMsg.noPlayableUrl), {
      txNoPlayableUrl: true,
      // 各档的 result 原样带出，真机排查「到底哪种码算失效」时不用再改代码打日志
      txResults: purlEmptyResults,
    })
  })()

  return requestObj
}

export default { getMusicUrl }
