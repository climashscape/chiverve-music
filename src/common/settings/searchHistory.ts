/**
 * 搜索历史保留条数（`search.historyMaxNum`）与裁剪规则（设置页重构票 09）。
 *
 * 裁剪语义照改造前的写法逐条对齐（`store/search/action.ts` 的 `splice(14, …)` + `unshift`）：
 * 新词置顶、重复词只留一份、总数不超过 `maxNum`。默认 15 = 改造前的固定条数，所以不动这个设置时
 * 历史列表与改前逐条一致。
 */

import { normalizeSettingNumber } from './settingNumber'

/** 默认条数 = 改造前写死的 15。 */
export const DEFAULT_SEARCH_HISTORY_MAX_NUM = 15

/** 设置页输入框的量程：`0` = 不记历史（不是「清空历史」，已有的历史不动）。 */
export const SEARCH_HISTORY_MAX_NUM_MIN = 0
export const SEARCH_HISTORY_MAX_NUM_MAX = 100

/**
 * 规整条数上限：非法（非数字 / NaN）与负数落到默认值 15，过大夹到量程上限。
 *
 * 只在手改配置文件时会拿到量程外的值（设置页的输入框用 MIN/MAX 夹取）；`null` / 空串当缺失
 * 处理（`Number(null)` 是 0，而 0 在这里是合法值「不记历史」，直接转会把它静默读成 0）。
 * 数值层面的共用规则见 `settingNumber.ts` 的 `normalizeSettingNumber`。
 */
export const normalizeSearchHistoryMaxNum = (value: unknown): number =>
  normalizeSettingNumber(value, SEARCH_HISTORY_MAX_NUM_MIN, SEARCH_HISTORY_MAX_NUM_MAX, DEFAULT_SEARCH_HISTORY_MAX_NUM)

/** 从设置里取当前条数上限（消费点唯一入口，传 `appSetting` 即可）。 */
export const getSearchHistoryMaxNum = (setting: Pick<LX.AppSetting, 'search.historyMaxNum'>): number =>
  normalizeSearchHistoryMaxNum(setting['search.historyMaxNum'])

/**
 * 「把 `word` 放进历史」后的新列表（置顶 + 去重 + 截断，纯函数，规则单测覆盖）。
 *
 * - 截断是**先留 `maxNum - 1` 条旧记录再置顶**，与改造前 `splice(14, …)` 的语义一致（1 + 14 = 15）；
 * - 重复词整条删掉再置顶（原来只删第一处；词表里本来不该有重复项）；
 * - `maxNum` 为 0 时返回空表——调用方会在此之前就返回、不落盘（`0` = 不记历史）。
 */
export const nextHistoryList = (list: readonly string[], word: string, maxNum: number): string[] => {
  return [word, ...list.filter(item => item != word)].slice(0, maxNum)
}
