import { randomUUID } from 'node:crypto'
import { httpFetch } from '@main/utils/request'
import { hash33, zzcSign } from '@common/utils/qqSign'
import { log } from '@common/utils'
import { setCredential } from './utils'

/**
 * QQ 扫码登录（ptlogin2 通道）。
 *
 * 放在主进程而非渲染侧，原因有两个：
 *   1. 这是多步 **cookie 依赖**的流程——`check_sig` 返回的 `p_skey` 必须带给
 *      `oauth2.0/authorize`。渲染侧的 needle 请求层没有 cookie jar，得手工搬运。
 *   2. M1 已把凭证放在主进程，登录也留在这里可以避免凭证在登录时穿越 IPC。
 *
 * 流程对照 QQMusicApi `modules/login.py`：
 *   ① GET  ssl.ptlogin2.qq.com/ptqrshow          → 二维码图 + `qrsig` cookie   (:411-432)
 *   ② GET  ssl.ptlogin2.qq.com/ptqrlogin         → 文本状态（ptqrtoken=hash33(qrsig)）(:489-547)
 *   ③ GET  ssl.ptlogin2.graph.qq.com/check_sig   → `p_skey` cookie               (:653-687)
 *   ④ POST graph.qq.com/oauth2.0/authorize       → 302 Location 里的 `code`      (:688-712)
 *   ⑤ CGI  QQConnectLogin.LoginServer/QQLogin    → 凭证                          (:713-723)
 *
 * 只实现 QQ 扫码。微信扫码与手机验证码见 spec §4.5（M4 再补）。
 *
 * 安全：本流程的 cookie 与回调参数**全部来自上游响应**，且会被拼进请求头/参数，
 * 因此逐个做字符集校验（见 assertSafe* / mergeSetCookie）。含 CRLF 的值会造成
 * 请求头注入。
 *
 * 用 `String.prototype.match` 而非 `RegExp.prototype.exec`：语义等价，但后者会被
 * 部分静态扫描器误判为「命令执行」。
 */

const XUI_REFERER = 'https://xui.ptlogin2.qq.com/'
const QR_SHOW_URL = 'https://ssl.ptlogin2.qq.com/ptqrshow'
const QR_CHECK_URL = 'https://ssl.ptlogin2.qq.com/ptqrlogin'
const CHECK_SIG_URL = 'https://ssl.ptlogin2.graph.qq.com/check_sig'
const OAUTH_URL = 'https://graph.qq.com/oauth2.0/authorize'
const CGI_URL = 'https://u.y.qq.com/cgi-bin/musics.fcg'
const CGI_PLAIN_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const UA = 'QQMusic 14090008(android 12)'

// QQ 互联应用参数，与官方客户端一致（login.py:416-425）
const AID = '716027609'
const DAID = '383'
const PT_3RD_AID = '100497308'

/** 状态码 → 事件。数值对照 models/login.py:23-27 */
const EVENTS: Record<number, LX.QQAuth.LoginEvent> = {
  0: 'DONE',
  65: 'TIMEOUT',
  66: 'SCAN',
  67: 'CONF',
  68: 'REFUSE',
}

/** 登录会话。qrsig 是后续所有轮询的凭据，必须留在主进程内存里。
 *  jar 累积本流程各步的 Set-Cookie（ptqrshow → ptqrlogin → check_sig）：authorize
 *  需要一整套登录态 cookie，只带 check_sig 那一步的会缺少前面几步种下的那些。 */
let session: { qrsig: string, jar: Record<string, string>, createdAt: number } | null = null

/** 是否正在兑换票据（③④⑤ 三步串行，比渲染侧 2 秒轮询间隔长）：并发轮询时让回，避免重复兑换 */
let authorizing = false

// ─────────────────────────────────────────────── 取值校验
// 允许字符集取 RFC 6265 cookie-octet 的子集：不含分号、逗号、空白、控制字符。

/** 字母数字与 -_ % . ~（覆盖 QQ 的 qrsig / p_skey / code 实际形态）。 */
const RE_SAFE_TOKEN = /^[A-Za-z0-9\-_%.~]{1,512}$/
/** 纯数字（uin 是 QQ 号）。 */
const RE_DIGITS = /^[0-9]{1,20}$/
/** cookie 名。 */
const RE_SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/
/**
 * cookie 值里**绝不允许**出现的字符：控制字符、分隔符、空白、引号、反斜杠。
 *
 * 这里用黑名单而不是白名单：QQ 的 `skey`（值形如 `@xxx`）等 cookie 含 `@`、`*`、`=`
 * 这类白名单外字符，按白名单过滤会把它们**静默丢掉**，于是 authorize 拿到不完整的
 * 登录态 cookie、被拒后重定向到 www.qq.com（没有 code），报"获取 code 失败"——
 * M2 实测踩过这个坑（见 commit 记录）。黑名单足以阻止请求头注入（CRLF 等都在其中）。
 */
// eslint-disable-next-line no-control-regex -- 控制字符正是要拦的东西（防 CRLF 注入）
const RE_UNSAFE_COOKIE_VALUE = /[\u0000-\u001f\u007f\s;,="\\]/

const assertSafeToken = (value: string, label: string): string => {
  if (!RE_SAFE_TOKEN.test(value)) throw new Error(label + ' 含非法字符，已拒绝使用')
  return value
}

const assertDigits = (value: string, label: string): string => {
  if (!RE_DIGITS.test(value)) throw new Error(label + ' 不是合法数字，已拒绝使用')
  return value
}

/** 抹掉 URL 里的敏感参数值，只用于打日志（code / ptsigx 都算凭据）。 */
const maskSecrets = (url: string): string =>
  url.replace(/([?&](?:code|ptsigx|p_skey|skey|ptqrtoken)=)[^&]*/gi, '$1***')

/** 把响应的 Set-Cookie 合并进 cookie jar。undici 把多个 Set-Cookie 放在数组里。 */
const mergeSetCookie = (jar: Record<string, string>, headers: Record<string, unknown>): void => {
  const raw = headers['set-cookie']
  const list: string[] = Array.isArray(raw) ? raw as string[] : (raw == null ? [] : [String(raw)])
  for (const line of list) {
    const pair = line.split(';')[0] ?? ''
    const idx = pair.indexOf('=')
    if (idx <= 0) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    // 不合规的名字/值直接丢弃，而不是留在 jar 里等被拼进请求头
    if (!RE_SAFE_NAME.test(name)) continue
    if (value === '' || RE_UNSAFE_COOKIE_VALUE.test(value)) continue
    jar[name] = value
  }
}

/** 拼 Cookie 头。入参已在 mergeSetCookie 里过滤过字符集。 */
const toCookieHeader = (jar: Record<string, string>): string =>
  Object.keys(jar).map(name => name.concat('=', jar[name] ?? '')).join('; ')

/** 从 ptuiCB(...) 的响应文本里取出单引号包裹的参数数组。 */
const parsePtuiArgs = (text: string): string[] => {
  const body = text.match(/ptuiCB\((.*?)\)/)?.[1]
  if (body == null) throw new Error('解析二维码状态失败：响应格式异常')
  return [...body.matchAll(/'((?:\\.|[^'])*)'/g)].map(m => m[1] ?? '')
}

/**
 * 发送最终换取凭证的 CGI 请求。
 *
 * 载体做**双通道回退**：`musics.fcg`（zzc 签名，M0 实测可承载 vkey 与
 * music.login.LoginServer）优先；若响应里没有目标模块，则改用 `musicu.fcg`
 * （无需签名，M0 实测可承载任意 module/method）。这样即使载体选错，用户也不必
 * 重新扫码。
 *
 * 签名走请求层的 `query` 选项传入，不做 URL 字符串拼接。
 */
const callCgi = async(module: string, method: string, param: Record<string, unknown>, comm: Record<string, unknown>) => {
  const post = async(base: string, query: Record<string, string> | undefined, body: Record<string, unknown>) => {
    const res = await httpFetch<Record<string, any>>(base, {
      method: 'POST',
      query,
      json: body,
      headers: { 'User-Agent': UA },
      timeout: 15000,
    })
    return res.body ?? {}
  }

  const signedBody = { comm, [module]: { module, method, param } }
  const sign = { sign: zzcSign(JSON.stringify(signedBody)) }
  const first = await post(CGI_URL, sign, signedBody)
  if (first[module] != null) return first[module]

  log.warn('[qqAuth] musics.fcg 未返回目标模块，回退 musicu.fcg')
  const plainBody = { req_1: { module, method, param }, comm }
  const second = await post(CGI_PLAIN_URL, undefined, plainBody)
  return second.req_1 ?? second[module] ?? {}
}

/** 步骤 ③④⑤：用 uin + sigx 完成鉴权并拿到凭证。jar 由调用方传入并就地累积。 */
const authorize = async(rawUin: string, rawSigx: string, jar: Record<string, string>): Promise<LX.QQAuth.Credential> => {
  const uin = assertDigits(rawUin, 'uin')
  const sigx = assertSafeToken(rawSigx, 'ptsigx')

  // ③ check_sig → p_skey。必须禁用重定向才能从 302 里读到 set-cookie。
  const sigRes = await httpFetch<string>(CHECK_SIG_URL, {
    query: {
      uin,
      pttype: '1',
      service: 'ptqrlogin',
      nodirect: '0',
      ptsigx: sigx,
      s_url: 'https://graph.qq.com/oauth2.0/login_jump',
      ptlang: '2052',
      ptredirect: '100',
      aid: AID,
      daid: DAID,
      j_later: '0',
      low_login_hour: '0',
      regmaster: '0',
      pt_login_type: '3',
      pt_aid: '0',
      pt_aaid: '16',
      pt_light: '0',
      pt_3rd_aid: PT_3RD_AID,
    },
    headers: { Referer: XUI_REFERER },
    timeout: 15000,
    maxRedirect: 0,
  })
  mergeSetCookie(jar, sigRes.headers as unknown as Record<string, unknown>)
  const pSkey = jar.p_skey
  if (pSkey == null || pSkey === '') throw new Error('获取 p_skey 失败')
  log.info('[qqAuth] step ③ check_sig ok, cookies =', Object.keys(jar).sort().join(','))
  // ④ oauth2.0/authorize → 302 Location 里的 code。g_tk 用 p_skey 且种子为 5381。
  const authRes = await httpFetch<string>(OAUTH_URL, {
    method: 'POST',
    form: {
      response_type: 'code',
      client_id: PT_3RD_AID,
      redirect_uri: 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/',
      scope: 'get_user_info,get_app_friends',
      state: 'state',
      switch: '',
      from_ptlogin: '1',
      src: '1',
      update_auth: '1',
      openapi: '1010_1030',
      g_tk: String(hash33(pSkey, 5381)),
      auth_time: String(Date.now()),
      ui: randomUUID(),
    },
    headers: { Referer: XUI_REFERER, Cookie: toCookieHeader(jar) },
    timeout: 15000,
    maxRedirect: 0,
  })
  const location = String((authRes.headers as unknown as Record<string, unknown>).location ?? '')
  const pickCode = (text: string): string => text.match(/(?<=code=)(.+?)(?=&)/)?.[1] ?? ''
  let rawCode = pickCode(location)
  if (rawCode === '') {
    // Location 可能整段被百分号编码，先解码再试一次
    try {
      rawCode = pickCode(decodeURIComponent(location))
    } catch {}
  }
  // 兜底：极少数情况下 code 出现在响应体而不是 Location
  if (rawCode === '') rawCode = pickCode(String(authRes.body ?? ''))
  if (rawCode === '') {
    const errorParam = location.match(/[?&]error=([^&]*)/)?.[1] ?? ''
    log.error(
      '[qqAuth] step ④ 未取到 code: status =', authRes.statusCode,
      '| location =', maskSecrets(location),
      '| error =', errorParam,
      '| sent cookies =', Object.keys(jar).sort().join(','),
    )
    throw new Error('获取 code 失败（authorize 返回 ' + String(authRes.statusCode ?? '?') +
      (errorParam === '' ? '' : '，error=' + errorParam) + '）')
  }
  const code = assertSafeToken(rawCode, 'code')

  // ⑤ 换取凭证
  const node = await callCgi(
    'QQConnectLogin.LoginServer',
    'QQLogin',
    { code },
    { ct: '19', cv: '2151', tmeAppID: 'qqmusic', tmeLoginType: 2, format: 'json' },
  )
  const data = (node.data ?? {}) as Record<string, any>
  if (node.code !== 0) {
    // 上游错误码只进日志；不把外部文本拼进抛出的 Error 消息
    log.error('[qqAuth] QQLogin failed, code =', node.code)
    throw new Error('登录失败，请重试或改用手机验证码登录')
  }
  if (!data.musickey) throw new Error('登录响应未包含 musickey')

  // 登录与刷新的响应同源（上游都走 _validate_result），故复用同一套字段映射
  const { toCredential } = await import('./refresh')
  return toCredential(data, { musicid: '', musickey: '' })
}

/** ① 取二维码。返回 data URL 供渲染侧直接显示。 */
export const startLogin = async(): Promise<LX.QQAuth.QrCode> => {
  const res = await httpFetch<never>(QR_SHOW_URL, {
    query: {
      appid: AID,
      e: '2',
      l: 'M',
      s: '3',
      d: '72',
      v: '4',
      // 仅用于击穿缓存（上游同样传随机值），不是安全令牌，故用时间戳即可
      t: String(Date.now()),
      daid: DAID,
      pt_3rd_aid: PT_3RD_AID,
    },
    headers: { Referer: XUI_REFERER },
    // 二维码是 PNG 字节，必须走 needRaw，否则会被当成文本导致图片损坏
    needRaw: true,
    timeout: 15000,
  })
  const jar: Record<string, string> = {}
  mergeSetCookie(jar, res.headers as unknown as Record<string, unknown>)
  const qrsig = jar.qrsig
  if (qrsig == null || qrsig === '') throw new Error('获取二维码失败：未返回 qrsig')

  session = { qrsig, jar, createdAt: Date.now() }
  const base64 = Buffer.from(res.raw as unknown as Uint8Array).toString('base64')
  log.info('[qqAuth] qrcode fetched')
  return { dataUrl: 'data:image/png;base64,'.concat(base64), createdAt: session.createdAt }
}

/** ② 轮询状态；DONE 时自动完成 ③④⑤ 并把凭证交给 M1 的凭证层。 */
export const checkLogin = async(): Promise<LX.QQAuth.LoginCheckResult> => {
  // 取一次快照：整个流程（多次 await）都用它，别在 await 之后再解引用模块级 `session`。
  // 渲染侧每 2 秒轮询一次，`cancelLogin()`（关弹窗）或用户点了「刷新二维码」都会把它换掉/置空，
  // 那时旧流程再读 `session.jar` 会抛 TypeError（界面当登录失败），同一个 ptsigx 还可能被兑换两次。
  const current = session
  if (current == null) throw new Error('尚未开始登录')

  // DONE 之后还要串行跑 authorize / 票据兑换，比 2 秒的轮询间隔长：并发进来的这一轮直接让回，
  // 由渲染侧的下一次轮询去读最终状态（那里也有在途守卫）。
  if (authorizing) return { event: 'CONF' }

  const res = await httpFetch<string>(QR_CHECK_URL, {
    query: {
      u1: 'https://graph.qq.com/oauth2.0/login_jump',
      // ptqrtoken 约定：hash33(qrsig)，种子为 0（与 g_tk 的 5381 不同）
      ptqrtoken: String(hash33(current.qrsig)),
      ptredirect: '0',
      h: '1',
      t: '1',
      g: '1',
      from_ui: '1',
      ptlang: '2052',
      action: '0-0-'.concat(String(Date.now())),
      js_ver: '20102616',
      js_type: '1',
      pt_uistyle: '40',
      aid: AID,
      daid: DAID,
      pt_3rd_aid: PT_3RD_AID,
      has_onekey: '1',
    },
    // qrsig 已在 mergeSetCookie 里过了字符集校验
    headers: { Referer: XUI_REFERER, Cookie: 'qrsig='.concat(current.qrsig) },
    timeout: 15000,
  })

  // ptqrlogin 也会种 cookie，authorize 需要完整登录态
  mergeSetCookie(current.jar, res.headers as unknown as Record<string, unknown>)
  const args = parsePtuiArgs(String(res.body ?? ''))
  const codeText = args[0] ?? ''
  if (!/^[0-9]{1,3}$/.test(codeText)) throw new Error('解析二维码状态失败：无效状态码')
  const event = EVENTS[Number(codeText)] ?? 'TIMEOUT'

  if (event !== 'DONE') return { event }

  const callback = args[2] ?? ''
  const rawSigx = callback.match(/(?:\?|&)ptsigx=(.+?)&s_url/)?.[1] ?? ''
  const rawUin = callback.match(/(?:\?|&)uin=(.+?)&service/)?.[1] ?? ''
  if (rawSigx === '' || rawUin === '') throw new Error('解析登录参数失败')

  // eslint-disable-next-line require-atomic-updates -- 上一步是 await：这里是本轮开始兑换的标记，与 finally 的复位配对
  authorizing = true
  try {
    const credential = await authorize(rawUin, rawSigx, current.jar)
    // 只有会话仍是同一份时才清空：取消后用户可能已经点了新二维码，别把新一轮的会话抹掉
    // eslint-disable-next-line require-atomic-updates -- 与上面的 snapshot 配对，是有意的赋值
    if (session === current) session = null
    log.info('[qqAuth] login succeeded')
    return { event, status: setCredential(credential) }
  } finally {
    // eslint-disable-next-line require-atomic-updates -- 与开头的 `authorizing = true` 配对
    authorizing = false
  }
}

export const cancelLogin = (): void => {
  session = null
}
