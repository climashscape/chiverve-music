/**
 * `common/settings/*` 各取值口共用的**整数值规整**（分页条数 / 搜索历史条数…）。
 *
 * 只放两个模块必须完全一致的那部分规则，量程与默认值仍留在各自模块（那是各 key 自己的语义）：
 *
 * - **只认数字与数字字符串**（配置文件是 JSON，手改时可能写成 `"30"`）；
 *   `null` / `''` / 布尔 / 对象一律当**缺失**处理——`Number(null)` 与 `Number('')` 都是 0，
 *   而 0 在「搜索历史条数」里是合法值（= 不记历史）、在「分页条数」里是非法值。直接 `Number()`
 *   会把「手改成 null」静默变成「不记历史」，与「非法值落默认」的语义正好相反；
 * - 小数截断（`Math.trunc`）；
 * - 缺失 / 非有限数 / 小于下限 → 落 `fallback`；大于 `max` → 夹到 `max`。
 */

/** 转成有限整数；不是「数字或数字字符串」时返回 `null`（= 当缺失处理）。 */
const toFiniteInt = (value: unknown): number | null => {
  if (typeof value == 'number') return Number.isFinite(value) ? Math.trunc(value) : null
  if (typeof value == 'string' && value.trim() !== '') {
    const num = Number(value)
    return Number.isFinite(num) ? Math.trunc(num) : null
  }
  return null
}

/**
 * 把设置里的一个「条数」规整到 `[min, max]`。
 *
 * `min` 是**合法下限**（不是夹取下限）：小于它就说明这个值不可用，落 `fallback`。
 * 这样调用方可以表达「0 是合法值」（min = 0，如搜索历史条数）与「0 不算数」（min = 1，如分页条数）。
 */
export const normalizeSettingNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = toFiniteInt(value)
  if (num == null || num < min) return fallback
  return Math.min(num, max)
}
