/**
 * 列表分页条数（`list.pageSize`）的**唯一取值口**（设置页重构票 09）。
 *
 * 为什么单开一个模块：每页条数原来在十几处各写各的（20 / 30 / 50 / 12 / 18…），改一处漏一处就是
 * 「设置里改了，某个列表不跟着变」。现在 renderer 侧一律 `getPageSize(appSetting)` 现取，
 * 别在消费点再写数字。**取值时点**一律是「取数那一刻」——改完设置不强制刷新已加载的列表，
 * 下次进页 / 翻页 / 加载更多时生效（这也是帮助文案里对用户的说法）。
 *
 * 两类不是「用户可见分页大小」的常量**不在这里**：
 * - 发现页「推荐歌单」固定 9 条：卡片每行 3 张，9 条与面板的固定高度配平（见
 *   `views/Discover/useRecommendTab.ts` 的文件头），不跟这个设置走；
 * - `musicSdk/tx/**` 里的 `PAGE_SIZE`（与 `leaderboard.js` 的 `limit: 300`）是**向服务端一次要多少**，
 *   服务端自己的口径，不是分页大小。
 */

import { normalizeSettingNumber } from './settingNumber'

/** 设置页给的档位：顺序即下拉里的顺序（`base-selection` 直接用）。 */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const

/**
 * 默认 30 = 改造前大多数列表的每页条数。
 *
 * ⚠️ 其余列表的默认值因此会变（改前 MV 20、新碟 12、专辑/我喜欢 50、歌单搜索 18），这是票 09
 * 「写死值参数化」的既定结果：老配置里没有这个 key 时按 30 走。
 */
export const DEFAULT_PAGE_SIZE = 30

/** 非法值的兜底上限：页长再大既拖慢首屏，也容易被服务端按自己的上限截断（截断会让翻页跳歌）。 */
export const MAX_PAGE_SIZE = 200

/**
 * 规整分页条数：非法（非数字 / NaN / 小于 1）落到默认值，过大夹到 `MAX_PAGE_SIZE`。
 *
 * 只在**手改配置文件**时才会遇到档位之外的值（设置页只能选 `PAGE_SIZE_OPTIONS`）；不夹的话
 * `0` 会让分页器算出 Infinity 页、`-1` 会让请求参数变负数。
 *
 * 数值层面的规则（`null` / 空串当缺失、小数截断、夹取）与搜索历史条数共用一份，见
 * `settingNumber.ts` 的 `normalizeSettingNumber`。
 */
export const normalizePageSize = (value: unknown): number =>
  normalizeSettingNumber(value, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE)

/** 从设置里取当前每页条数（消费点唯一入口，传 `appSetting` 即可）。 */
export const getPageSize = (setting: Pick<LX.AppSetting, 'list.pageSize'>): number => normalizePageSize(setting['list.pageSize'])
