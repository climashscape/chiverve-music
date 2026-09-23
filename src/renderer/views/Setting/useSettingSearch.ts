/**
 * 设置搜索（设置页重构票 02）：索引与匹配全部由 `@common/settingMetadata` 驱动。
 *
 * 两条改动前要读的约束：
 * 1. **命中项靠元数据的 `key` 认，别按文案反查控件**。文案四语不同、票 11 还要按附 A 改，
 *    按文案找 DOM 在换语言后必错。跳转时用 `[data-setting-key]` 定位控件（票 03/05 落这个属性的
 *    契约，见 `useSettingToc.ts` 的 `flashItem`），找不到才退到分组锚点。
 * 2. 匹配口径：**当前语言下** section / group / item 的文案 + item 的 `key`，不区分大小写**子串**。
 *    `key` 也参与匹配，是因为菜单里搜不到的技术名（`quality` / `proxy` 之类）用户会直接敲。
 *
 * 三级都给命中：节级 → 跳该节顶部；分组级 → 跳该分组锚点（`hot_key` / `data` 两节 items 为空，
 * 只可能命中组标题）；项级 → 跳分组锚点并高亮控件。**同一分支只留最深的一条**（有项命中就不再列
 * 它的分组与节），否则搜一次「音量」会刷出「播放 › 播放 › 音量」三条。
 *
 * 纯函数（翻译函数按参数传进来），单测见同目录 `useSettingSearch.test.ts`。
 */
import { SETTING_SECTIONS, type Section } from '@common/settingMetadata'

/** 文案取值函数（`useI18n()` 的返回值）。单独传进来是为了让本模块能被单测直接跑。 */
export type Translate = (key: string) => string

/** 一条命中：`groupId` 为 null = 节级命中，`itemKey` 为 null = 分组级命中。 */
export interface SearchHit {
  sectionId: string
  sectionI18nKey: string
  groupId: string | null
  groupI18nKey: string | null
  itemKey: string | null
  itemI18nKey: string | null
}

export interface SearchIndexEntry {
  hit: SearchHit
  /** 预先小写化的可搜文本（文案 + 技术名），避免每次按键重复拼串。 */
  haystack: string
}

/** 结果上限：设置项总共一百多条，超过这个数说明关键词太泛，多列无益。 */
export const SEARCH_RESULT_LIMIT = 50

const toHaystack = (...parts: string[]) => parts.filter(Boolean).join(' ').toLowerCase()

/**
 * 建索引：按节 → 分组 → 项的顺序，**节/组/项各一条**（顺序即页面顺序，结果列表直接照这个序显示）。
 * 索引随语言变化重建（文案参与匹配），由调用方用 `computed` 包住。
 */
export const buildSearchIndex = (
  t: Translate,
  sections: readonly Section[] = SETTING_SECTIONS,
): SearchIndexEntry[] => {
  const index: SearchIndexEntry[] = []
  for (const section of sections) {
    index.push({
      hit: {
        sectionId: section.id,
        sectionI18nKey: section.i18nKey,
        groupId: null,
        groupI18nKey: null,
        itemKey: null,
        itemI18nKey: null,
      },
      haystack: toHaystack(t(section.i18nKey)),
    })
    for (const group of section.groups) {
      index.push({
        hit: {
          sectionId: section.id,
          sectionI18nKey: section.i18nKey,
          groupId: group.id,
          groupI18nKey: group.i18nKey,
          itemKey: null,
          itemI18nKey: null,
        },
        haystack: toHaystack(t(group.i18nKey)),
      })
      for (const item of group.items) {
        index.push({
          hit: {
            sectionId: section.id,
            sectionI18nKey: section.i18nKey,
            groupId: group.id,
            groupI18nKey: group.i18nKey,
            itemKey: item.key,
            itemI18nKey: item.i18nKey,
          },
          // key 也进可搜文本：`player.playQuality` 里的 quality、`network.proxy.host` 里的 proxy
          haystack: toHaystack(t(item.i18nKey), item.key),
        })
      }
    }
  }
  return index
}

/** 命中的分支键（同一分组内的项命中，用来压掉该分组的组级命中）。 */
const groupBranchKey = (hit: SearchHit) => `${hit.sectionId}\u0000${hit.groupId}`

/**
 * 按关键词取命中：空串返回空列表（不是全量），同分支只留最深的一条，最多 `limit` 条。
 */
export const matchSettingHits = (
  keyword: string,
  index: readonly SearchIndexEntry[],
  limit: number = SEARCH_RESULT_LIMIT,
): SearchHit[] => {
  const query = keyword.trim().toLowerCase()
  if (!query) return []
  const matched = index.filter(entry => entry.haystack.includes(query))
  // 「更深的命中」集合：项级命中的分组、以及任意组/项级命中过的节
  const itemHitGroups = new Set(matched.filter(entry => entry.hit.itemKey != null).map(entry => groupBranchKey(entry.hit)))
  const deeperSections = new Set(matched.filter(entry => entry.hit.groupId != null).map(entry => entry.hit.sectionId))
  return matched
    .filter(({ hit }) => {
      if (hit.groupId == null) return !deeperSections.has(hit.sectionId)
      if (hit.itemKey == null) return !itemHitGroups.has(groupBranchKey(hit))
      return true
    })
    .map(entry => entry.hit)
    .slice(0, limit)
}
