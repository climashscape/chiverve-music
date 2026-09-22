import { httpFetch } from '../../../request'
import { getQQCredential } from '@renderer/utils/ipc'
import { zzcSign } from './crypto'

/**
 * QQ 音乐 CGI 网关的取流请求层。
 *
 * 两个载体（都是 M0 实测可承载 vkey 模块的，做回退是为了不让载体选择成为单点）：
 *   1. `musicu.fcg`：明文 JSON，**M0 探针实测路径**（9 档音质对比就是用它跑的）——默认走这条
 *   2. `musics.fcg`：zzc 签名的 Android 形态（`sign` 走 query），与 `tx/utils/index.js`
 *      的 signRequest 同一形态；主通道没有返回目标模块时回退
 *
 * 返回 needle 的 `{ promise, cancelHttp }`（见 §2.5 契约：musicSdk 必须用渲染侧
 * 请求层，只有它支持 cancelHttp）。promise resolve 的是**模块节点**
 * （响应里的 `req_1`），调用方直接取 `.data`。
 *
 * ⚠️ 别去掉 `json: true`：needle 在 `body` 是对象且未标记 json 时会按 form-urlencoded
 * 发送（needle.js:354），而 QQ 网关这条路径要 JSON 体 —— 且签名 carrier 的 sign 是
 * 对 JSON 串算的，编码一变签名就对不上。
 */

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const MUSICS_URL = 'https://u.y.qq.com/cgi-bin/musics.fcg'
/** 与 Android 客户端一致的 UA（musics.fcg 的签名通道要求）。 */
const UA = 'QQMusic 14090508(android 12)'

/** 我们在响应约定里固定用 `req_1` 作为业务键（见下方 `txCgi`）。 */
const REQ_KEY = 'req_1'

/**
 * 取凭证并校验登录态 —— 账户类（我的音乐）与写操作类（歌单增删）接口的公共前置。
 *
 * `encryptUin` 是必需的：QQ 的账户级接口基本都用它（euin）而不是数字 uin，
 * 早期凭证或异常凭证里可能为空，这里直接拦掉并给出可操作的信息。
 */
export const requireCredential = async() => {
  const credential = await getQQCredential()
  if (credential == null) throw new Error('QQ 音乐未登录')
  if (!credential.encryptUin) throw new Error('凭证缺少 encryptUin，请重新登录')
  return credential
}

/**
 * 按 §4.2 构造 comm，并注入登录态。
 *
 * `profile` 默认 `'web'`；**个别端点必须用安卓形态**（主页 `GetHomepageHeader`、
 * 听歌基因 `GetProfileReport`——M0 实测 WEB 形态被拒 `code=10000`），那些调用点传
 * `'android'`。两种形态都**不需要 QIMEI 设备指纹**（M0 结论），所以这里没有设备字段。
 *
 * `authst`（= musickey）与 `qq`（= musicid）是取流鉴权的关键：M0 实测过
 * 「vkey 靠 comm 里的 authst 鉴权，与平台档案无关」，缺了它们只会拿到空 purl。
 *
 * ⚠️ uin 一律转字符串：M3 实测数字型 uin 会让 vkey 返回 code 10006。
 */
export const buildComm = (credential, profile = 'web') => ({
  ...(profile === 'android'
    ? { ct: 11, cv: 14090008, v: 14090008, chid: '10003505' }
    : { ct: 24, cv: 0 }),
  uin: String(credential.musicid ?? ''),
  authst: credential.musickey,
  qq: String(credential.musicid ?? ''),
  tmeAppID: 'qqmusic',
  tmeLoginType: credential.loginType ?? 2,
  format: 'json',
})

/**
 * 发一个 CGI 模块调用（`{ module, method, param }` + comm），resolve 模块节点。
 * @param {{ module: string, method: string, param: Record<string, unknown> }} target
 * @param {Record<string, unknown>} comm
 */
export const txCgi = (target, comm) => {
  const body = {
    [REQ_KEY]: target,
    // ⚠️ loginUin 必须是**字符串**：M3 实测，数字型会得到 `req_1.code = 10006`
    // （模块直接拒绝、连 data 都不返回）。数字型 comm.uin/qq 不影响（同一轮对照里通过）。
    loginUin: String(comm.uin ?? ''),
    comm,
  }
  let current = httpFetch(MUSICU_URL, {
    method: 'post',
    headers: { 'User-Agent': UA },
    json: true,
    body,
  })

  const pickNode = payload => {
    const node = payload?.[REQ_KEY]
    return node == null ? null : node
  }

  const requestObj = {
    cancelHttp: () => {
      if (current?.cancelHttp) current.cancelHttp()
    },
    promise: current.promise.then(async({ body: payload }) => {
      const node = pickNode(payload)
      if (node != null) return node

      // 回退：签名形态的 musics.fcg
      const sign = await zzcSign(JSON.stringify(body))
      current = httpFetch(`${MUSICS_URL}?sign=${sign}`, {
        method: 'post',
        headers: { 'User-Agent': UA },
        json: true,
        body,
      })
      const fallback = await current.promise
      const fallbackNode = pickNode(fallback.body)
      if (fallbackNode == null) throw new Error('QQ 接口无响应')
      return fallbackNode
    }),
  }

  return requestObj
}
