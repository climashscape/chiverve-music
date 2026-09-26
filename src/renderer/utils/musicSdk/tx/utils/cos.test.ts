import { describe, expect, it } from 'vitest'
import { buildCosAuthorization, buildSignTime, hmacSha1Hex, sha1Hex } from './cos'

/**
 * COS 直传签名的钉子。
 *
 * **黄金向量不是自己反推的**：`signature` / `q-header-list` 由**官方 SDK**（`cos-python-sdk-v5`
 * 的 `cos_auth.CosS3Auth`）对同一组输入签出来的——2026-09-26 用 `/tmp/cap-upload/.venv` 里的
 * SDK 跑 `crosscheck_sdk_sign.py` 生成（该 SDK 正是探针里真把 1×1 PNG 传进 COS 桶的那份，
 * 所以它是"能过 COS 校验"的参照实现）。本文件只把输入照抄过来，**不含任何真实凭证**
 * （secret/key/token 都是明文示例串）。
 *
 * 为什么值得单独钉：这个串错一个字符，COS 就回 403 SignatureDoesNotMatch，而**单测看不出来**
 * （没有网络），真机上只表现为"上传失败"。所以把它冻在测试里，任何"顺手优化"（换 hex/字节、
 * 少一个换行、把头名小写化顺序搞错、token 不转义）都会立刻红。
 *
 * 易错点三处（对应实现里的注释）：`signKey` 用 hex 串当 HMAC key、`httpString` 第四段结尾有换行、
 * 头的 key/value 都要按 `A-Za-z0-9-_.~` 编码（token 里带 `+/=~` 时最能暴露问题）。
 */

/** 与 Python 侧 `crosscheck_sdk_sign.py` 逐字段一致的输入。 */
const VECTOR = {
  secretId: 'AKIDEXAMPLEFORCROSSCHECK',
  secretKey: 'SECRETKEYEXAMPLEFORCROSSCHECK',
  method: 'PUT',
  path: '/songlist/u/EXAMPLETOKEN/2320b/0123456789abcdef0123456789abcdef01234567_46.png',
  signTime: '1790397613;1790401273',
  headers: {
    // 故意用 SDK 看到的那套大小写：实现必须自己把 key 小写化
    Host: 'music-file-1258344705.cos.ap-guangzhou.myqcloud.com',
    'Content-Type': 'image/png',
    // requests 给 prepared request 补的 Content-Length: 0（SDK 的白名单头），一起签
    'Content-Length': '0',
    'x-cos-security-token': 'TOKENwith+/=and-dash_underscore~tilde',
  },
}
const SDK_SIGNATURE = '6c72c95dbc7b87384d0cb80ba86cb21470beea9c'
const SDK_HEADER_LIST = 'content-length;content-type;host;x-cos-security-token'

const authOf = (overrides: Partial<typeof VECTOR> = {}) => {
  const input = { ...VECTOR, ...overrides }
  const auth = buildCosAuthorization(input)
  return Object.fromEntries(auth.split('&').map(kv => kv.split('=', 2)))
}

describe('COS 直传签名（buildCosAuthorization）', () => {
  it('与官方 SDK 同输入同签名（黄金向量）', () => {
    const parsed = authOf()
    expect(parsed['q-signature']).toBe(SDK_SIGNATURE)
    expect(parsed['q-header-list']).toBe(SDK_HEADER_LIST)
  })

  it('模板字段齐全且形状正确（algorithm/ak/sign-time/key-time/param-list）', () => {
    const auth = buildCosAuthorization(VECTOR)
    expect(auth.startsWith('q-sign-algorithm=sha1')).toBe(true)
    expect(auth).toContain(`&q-ak=${VECTOR.secretId}`)
    // 本次签名是"一次 PUT 用一次"：sign-time 与 key-time 同值
    expect(auth).toContain(`&q-sign-time=${VECTOR.signTime}&q-key-time=${VECTOR.signTime}`)
    // PUT 没有 query 参数，这一项必须是空串（不是缺项）
    expect(auth).toContain('&q-url-param-list=&q-signature=')
  })

  it('头的 key 大小写不影响签名（Host/Content-Type 与全小写等价）', () => {
    const lower = Object.fromEntries(Object.entries(VECTOR.headers).map(([k, v]) => [k.toLowerCase(), v]))
    expect(buildCosAuthorization({ ...VECTOR, headers: lower })).toBe(buildCosAuthorization(VECTOR))
  })

  it('签名随方法/路径/密钥变化（不是常量，也不是只吃头部）', () => {
    const base = authOf()['q-signature']
    expect(authOf({ method: 'GET' })['q-signature']).not.toBe(base)
    expect(authOf({ path: '/other.png' })['q-signature']).not.toBe(base)
    expect(authOf({ secretKey: 'another-secret' })['q-signature']).not.toBe(base)
    expect(authOf({ signTime: '1790397613;1790401274' })['q-signature']).not.toBe(base)
  })

  it('token 里的 + / = ~ 会被转义（不转义就成了另一个签名）', () => {
    const escaped = authOf({ headers: { ...VECTOR.headers, 'x-cos-security-token': 'TOKENwith%2B%2F%3Dand-dash_underscore~tilde' } })['q-signature']
    // 直接把"已转义串"当值传进去，等于换了输入 → 不是同一个签名
    expect(escaped).not.toBe(SDK_SIGNATURE)
  })
})

describe('sha1 / hmac-sha1 / 签名有效期', () => {
  it('sha1Hex 与 hmacSha1Hex 是标准实现（RFC 3174 / RFC 2202 测试向量）', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    // RFC 2202：key = 0x0b × 20，data = "Hi There"
    expect(hmacSha1Hex('\x0b'.repeat(20), 'Hi There')).toBe('b617318655057264e28bc0b6fb378c8ef146be00')
  })

  it('签名有效期往前留 60 秒（本机时钟快也认），窗口长度等于 expire', () => {
    expect(buildSignTime(1790397613, 3600)).toBe('1790397553;1790401213')
  })
})
