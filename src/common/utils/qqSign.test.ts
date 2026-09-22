import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hash33, zzcSign } from './qqSign'

/**
 * zzc 签名与 hash33 的行为钉子。
 *
 * 期望值的来源（都不是从实现里读出来的，避免「实现怎么写、测试就怎么断」）：
 * 1. 取位下标与「输入是 SHA-1 的十六进制串」这个前提来自协议本身；测试里用
 *    `node:crypto` 独立重算 SHA-1，再按下标取字符拼出应当出现的前后缀。
 * 2. `hash33` 的期望值用 BigInt 独立算一遍：实现靠 JS 位运算的 32 位截断，
 *    这里用任意精度算 `(h * 33 + code) mod 2^32` 再取低 31 位 —— 两条算术路径
 *    必须给出同一个数（这也是 qqSign.ts 注释里「与 Python 的 2147483647 & h 等价」
 *    这句断言的验证方式）。
 */

/** 与协议一致的两组取位下标（qqSign.ts 里同名常量；下标 40 越界是有意的坑） */
const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]

const sha1Hex = (text: string) => crypto.createHash('sha1').update(text).digest('hex')

const pick = (hash: string, indexes: number[]) =>
  indexes.filter(idx => idx < hash.length).map(idx => hash[idx]).join('')

/** 任意精度版本：h = (h * 33 + code) mod 2^32，最后取低 31 位 */
const hash33ByBigInt = (text: string, seed = 0): number => {
  const MOD = 1n << 32n
  let h = BigInt(seed)
  for (const char of text) {
    h = (h * 33n + BigInt(char.charCodeAt(0))) % MOD
  }
  return Number(h & 0x7fffffffn)
}

describe('zzcSign', () => {
  const text = '{"req_1":{"module":"vkey.GetVkeyServer","method":"CgiGetVkey"}}'

  it('确定性：同一输入重复调用结果一致', () => {
    expect(zzcSign(text)).toBe(zzcSign(text))
  })

  it('输出格式：zzc + 两段取位片段 + 非空 base64 片段', () => {
    const sign = zzcSign(text)
    const hash = sha1Hex(text)
    const part1 = pick(hash, PART_1_INDEXES)
    const part2 = pick(hash, PART_2_INDEXES)

    // SHA-1 十六进制串只有 40 个字符（下标 0-39），下标 40 取不到字符 → part1 只有 7 位。
    // 这条断言同时钉住「越界即空串」的行为（换成别的语言移植时最容易在这里崩）。
    expect(part1).toHaveLength(7)
    expect(sign.startsWith('zzc')).toBe(true)
    expect(sign.startsWith(`zzc${part1}`)).toBe(true)
    expect(sign.endsWith(part2)).toBe(true)

    const middle = sign.slice(3 + part1.length, sign.length - part2.length)
    expect(middle.length).toBeGreaterThan(0)
    // 实现会把 base64 里的 `\ / + =` 剔掉并整体转小写
    expect(middle).toMatch(/^[a-z0-9]+$/)
  })

  it('不同输入得到不同签名', () => {
    const inputs = [
      'a',
      'b',
      '{"req_1":{"module":"vkey.GetVkeyServer"}}',
      '{"req_1":{"module":"vkey.GetVkeyServer"}} ',
      '{}',
    ]
    const signs = new Set(inputs.map(input => zzcSign(input)))
    expect(signs.size).toBe(inputs.length)
  })
})

describe('hash33', () => {
  it('与任意精度参考实现等价（种子 0）', () => {
    for (const text of ['', 'a', 'abc', 'qrsig-value', 'abcdefghijklmnopqrstuvwxyz0123456789']) {
      expect(hash33(text)).toBe(hash33ByBigInt(text))
    }
  })

  it('与任意精度参考实现等价（种子 5381，即 g_tk 用法）', () => {
    for (const text of ['p_skey-value', 'skey', '']) {
      expect(hash33(text, 5381)).toBe(hash33ByBigInt(text, 5381))
    }
  })

  it('非空输入下种子不同则结果不同（ptqrtoken 与 g_tk 不能混用）', () => {
    const text = 'qrsig-or-p_skey'
    expect(hash33(text)).not.toBe(hash33(text, 5381))
  })

  it('结果落在 int32 正数区间（可以与 Python 的 2147483647 & h 互换）', () => {
    for (const text of ['a', 'qrsig-value', 'p_skey-value']) {
      const result = hash33(text)
      expect(Number.isInteger(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(2147483647)
    }
  })
})
