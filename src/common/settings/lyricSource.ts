/**
 * 本地歌的歌词来源优先级（`lyric.sourcePriority`，设置页重构票 09）。
 *
 * 只影响**本地歌曲**（`source == 'local'`）取歌词的顺序，消费点 `core/music/local.ts` 的
 * `getLyricInfo`；在线歌曲没有本地歌词可查（`core/music/online.ts`），不看这个值。
 *
 * 🔴 **一侧拿不到 / 请求失败一律回落到另一侧**——「在线优先」不等于「永远不用本地 `.lrc`」：
 * 断网或未登录时，同目录的 `.lrc` 仍要能出词（历史行为，别为了「优先级」把它砍掉）。
 */

/** 两个取值就是设置项的类型本身（`types/app_setting.d.ts` 的声明是唯一来源，这里不另抄一份字面量）。 */
export const LYRIC_SOURCE_PRIORITIES: ReadonlyArray<LX.AppSetting['lyric.sourcePriority']> = ['localFirst', 'onlineFirst']

/** 默认 = 改造前的行为：先「歌词缓存 + 同目录 .lrc」，都没有才请求在线歌词。 */
export const DEFAULT_LYRIC_SOURCE_PRIORITY: LX.AppSetting['lyric.sourcePriority'] = 'localFirst'

/** 规整优先级：不认识的值（手改配置文件 / 旧版本残留）落到默认值。 */
export const normalizeLyricSourcePriority = (value: unknown): LX.AppSetting['lyric.sourcePriority'] =>
  LYRIC_SOURCE_PRIORITIES.includes(value as LX.AppSetting['lyric.sourcePriority'])
    ? value as LX.AppSetting['lyric.sourcePriority']
    : DEFAULT_LYRIC_SOURCE_PRIORITY

/** 从设置里取当前优先级（消费点唯一入口，传 `appSetting` 即可）。 */
export const getLyricSourcePriority = (setting: Pick<LX.AppSetting, 'lyric.sourcePriority'>): LX.AppSetting['lyric.sourcePriority'] =>
  normalizeLyricSourcePriority(setting['lyric.sourcePriority'])
