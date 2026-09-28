import crypto from 'node:crypto'

/**
 * QQ 音乐 CGI 网关传输层——端点形状照搬 src/renderer/utils/musicSdk/tx/utils/（request.js /
 * index.js / crypto.js），那些是 M0/M3/M6 真机实测过的；那边改了这边要跟。
 *
 * 与渲染层的差异：CLI 在 node 里跑，用内置 fetch，不需要 cancelHttp 与 needle。
 * 两个实测约束别动：
 *   1. UA 必须是安卓客户端形态（musics.fcg 签名通道要求，M0 实测）；
 *   2. comm 的 uin/qq 与顶层 loginUin 必须是字符串（M3 实测数字型回 code 10006）。
 */

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const MUSICS_URL = 'https://u.y.qq.com/cgi-bin/musics.fcg'
const UA = 'QQMusic 14090508(android 12)'

/** musics.fcg 签名通道的 zzc 签名（照 tx/utils/crypto.js，算法逐字对应）。 */
export const zzcSign = text => {
  const hash = crypto.createHash('sha1').update(text).digest('hex')
  const part1 = [23, 14, 6, 36, 16, 40, 7, 19].map(i => hash[i]).join('')
  const part2 = [16, 1, 32, 12, 19, 27, 8, 5].map(i => hash[i]).join('')
  const scramble = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]
  const part3 = scramble.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))
  const b64 = Buffer.from(part3).toString('base64').replace(/[\\/+=]/g, '')
  return `zzc${part1}${b64}${part2}`.toLowerCase()
}

/**
 * 登录态 comm（照 tx/utils/request.js buildComm）。web 是默认档案；安卓档案只给实测要求的端点
 * （写「我喜欢」dirId=201，见 playlist.mjs 的分档注释）。两种档案都不需要 QIMEI 设备指纹（M0 结论）。
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

/** 游客搜索 comm（照 tx/musicSearch.js musicSearch 里的字面量；搜索不要求登录态）。 */
export const guestComm = () => ({
  _channelid: '0',
  _os_version: '6.2.9200-2',
  ct: '19',
  cv: '2151',
  guid: '1F70E520B2EAA7D25E11760783C53CA9',
  patch: '118',
  psrf_access_token_expiresAt: 0,
  psrf_qqaccess_token: '',
  psrf_qqopenid: '',
  psrf_qqunionid: '',
  tmeAppID: 'qqmusic',
  tmeLoginType: 0,
  uin: '0',
  wid: '7223299733393904640',
})

const postJson = async(url, text) => {
  const res = await fetch(url, {
    method: 'post',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: text,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.origin}`)
  return res.json()
}

/**
 * 响应里的列表键收口：缺（null/undefined）当空列表（合法空态）；**存在但非 Array 直接报错**——
 * 实测网关偶发回异常形态（2026-09-28 冒烟撞过一次），裸 map 的报错指不到字段，这里点名。
 */
export const asArray = (value, field) => {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`QQ 网关响应形态异常（${field} 非 Array，可能风控/限流，稍后重试）`)
  return value
}

/**
 * 登录态模块调用：`{ module, method, param }` → 响应里的 `req_1` 节点。
 * 主通道 musicu.fcg 明文 JSON（M0/M6 实测路径）；网关不给节点时回退 musics.fcg + zzc 签名
 * （双层结构照 tx/utils/request.js 的回退链）。sign 对**发出去的同一份 JSON 串**计算。
 */
export const txCgi = async(target, comm) => {
  const body = {
    req_1: target,
    loginUin: String(comm.uin ?? ''),
    comm,
  }
  const text = JSON.stringify(body)
  let payload = await postJson(MUSICU_URL, text)
  if (payload?.req_1 != null) return payload.req_1
  payload = await postJson(`${MUSICS_URL}?sign=${zzcSign(text)}`, text)
  if (payload?.req_1 != null) return payload.req_1
  throw new Error(`QQ 网关无 req_1 节点（模块级 code=${payload?.code}）`)
}

/** 游客签名通道（照 tx/utils/index.js signRequest）：body 顶层就是 `comm` + 模块键，无 req_1 包装。 */
export const signedPost = async body => {
  const text = JSON.stringify(body)
  return postJson(`${MUSICS_URL}?sign=${zzcSign(text)}`, text)
}
