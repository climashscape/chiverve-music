import crypto from 'node:crypto'

/**
 * QQ 音乐客户端的 zzc 请求签名。
 *
 * 移植自 `src/renderer/utils/musicSdk/tx/utils/crypto.js:21-28`（LX 原有实现），
 * 提到 `src/common/utils/` 供主进程与渲染进程共用一份。
 *
 * 两个必须照抄、不能"优化"的点：
 *
 * 1. **SHA-1 由协议规定**，不能换成更强的算法 —— 服务端按同一算法校验，
 *    换了签名直接失效。它不是安全控制（不用于加密或口令派生，输出只是请求指纹）。
 *
 * 2. **PART_1_INDEXES 含 40，而 SHA-1 十六进制串只有 40 字符（下标 0–39）**。
 *    参考实现在 JS 里靠 `hash[40] → undefined` + `Array.join('')` 把它变成空串
 *    才成立。这里显式写成过滤，语义等价但不再依赖越界行为 —— 若将来有非 JS
 *    语言移植，这一点会直接导致下标越界崩溃（M0 实测踩到过）。
 *
 * 另一处 JS 行为依赖：`base64Encode` 去掉了 `\ / + =` 四类字符。注意正则里的
 * `\\` 是转义后的反斜杠，与 `/` 一样属于要去掉的字符。
 */
const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const SCRAMBLE_VALUES = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

/**
 * QQ 的 hash33 滚动哈希。移植自 `qqmusic_api/utils/common.py:45-57`。
 *
 * 有两处不同的用法，**种子不同、不要混**：
 *   - `hash33(qrsig)`              种子 0    → 扫码轮询的 `ptqrtoken`
 *   - `hash33(p_skey, 5381)`       种子 5381 → `g_tk`
 *
 * 非密码学用途（输出是请求参数）；JS 的位运算天然是 32 位截断，
 * 故与 Python 的 `2147483647 & h` 等价，无需 BigInt。
 */
export const hash33 = (text: string, seed = 0): number => {
  let h = seed
  for (let i = 0; i < text.length; i++) {
    h = (h << 5) + h + text.charCodeAt(i)
  }
  return 2147483647 & h
}

export const zzcSign = (text: string): string => {
  const hash = crypto.createHash('sha1').update(text).digest('hex')

  const pick = (indexes: number[]) => indexes
    .filter(idx => idx < hash.length)
    .map(idx => hash[idx])
    .join('')

  const part1 = pick(PART_1_INDEXES)
  const part2 = pick(PART_2_INDEXES)
  const bytes = SCRAMBLE_VALUES.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))

  const b64 = Buffer.from(bytes)
    .toString('base64')
    .replace(/[\\/+=]/g, '')

  return `zzc${part1}${b64}${part2}`.toLowerCase()
}
