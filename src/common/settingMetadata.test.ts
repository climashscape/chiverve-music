import { describe, expect, it } from 'vitest'
import defaultSetting from './defaultSetting'
import {
  GROUPS_WITHOUT_ITEMS,
  INTERNAL_ONLY_KEYS,
  SETTING_NAV_GROUPS,
  SETTING_SECTIONS,
  itemId,
  type Item,
  type Section,
} from './settingMetadata'

/**
 * 元数据表与 `defaultSetting` 的对账（设置页重构票 01 的验收）。
 *
 * 钉住四件事：
 * 1. **每个设置 key 恰好登记一次**——在某个 key 项里，或在 `INTERNAL_ONLY_KEYS` 白名单里。
 *    「缺」（有 key 没登记）、「多」（登记了不存在的 key）、「重复」（同一个 key 登记两次）
 *    三种都算失败，所以新增设置 key 必须同时登记、删 key 必须同时删 item（票 10 删桌面歌词
 *    颜色组的三个 key 就是这么走的），不许默认放过。
 * 2. 元数据自身的结构：section / group 的 id 全局唯一（票 03 会拿它们当 `dt#` / `h3#` 的 DOM id）、
 *    每个 navGroup 至少一节、i18nKey 非空。
 * 3. **非 key 控件与空分组**（2026-09-25 收口票 05 的两条偏离）：非 key 项的 id 非空且全局唯一
 *    （搜索定位靠它）、除 `GROUPS_WITHOUT_ITEMS` 白名单外每组至少一项——防再出现「搜索只能命中
 *    组标题」的空分组。
 * 4. **坏数据真的会被抓住**：上面每组检查都用「注入坏数据」的用例跑一遍（负向验证），
 *    避免检查写成永远为真。检查函数与数据解耦（都收参数），就是为了这个。
 *
 * 文案的实义与四语一致性由 `lang.test.ts` 兜，这里只保证 key 不漏、不重、不为空，id 不重、不空。
 */

/** `defaultSetting` 里除 `version`（唯一非设置字段）之外的全部设置 key。 */
const SETTING_KEYS = Object.keys(defaultSetting).filter(key => key != 'version')

/** 元数据里的全部 item（坏数据用例与 id 检查都从它取件）。 */
const allItems = (sections: readonly Section[]) => sections.flatMap(section => section.groups.flatMap(group => group.items))

/**
 * key 项的 key 清单。用 `flatMap` 而不是 `filter`：`Item.key` 现在可选，
 * `filter(item => item.key != null)` 不会把类型收窄成 string，`flatMap` 会。
 */
const keyItemKeys = (sections: readonly Section[]): string[] =>
  allItems(sections).flatMap(item => (item.key == null ? [] : [item.key]))

/** 非 key 项的 id 清单（key 项的 `id` 恒为 undefined，不算）。 */
const nonKeyItemIds = (sections: readonly Section[]): string[] =>
  allItems(sections).flatMap(item => (item.id == null ? [] : [item.id]))

/** 登记表：所有 key 项的 key + 内部机制键白名单（同一个 key 出现两次即「重复登记」）。 */
const registeredKeys = (sections: readonly Section[]) => [
  ...keyItemKeys(sections),
  ...INTERNAL_ONLY_KEYS,
]

/** 缺：`defaultSetting` 里有、登记表里没有。 */
const findUnregisteredKeys = (sections: readonly Section[], keys: readonly string[]) => {
  const registered = new Set<string>(registeredKeys(sections))
  return keys.filter(key => !registered.has(key))
}

/** 多：登记表里有、`defaultSetting` 里没有（也抓「白名单里留着已删的 key」）。 */
const findUnknownKeys = (sections: readonly Section[], keys: readonly string[]) => {
  const known = new Set(keys)
  return registeredKeys(sections).filter(key => !known.has(key))
}

/** 重复：同一个 key 被登记两次（item 之间，或 item 与内部机制键撞车）。 */
const findDuplicatedKeys = (sections: readonly Section[]) => {
  const count = new Map<string, number>()
  for (const key of registeredKeys(sections)) count.set(key, (count.get(key) ?? 0) + 1)
  return [...count].filter(([, num]) => num > 1).map(([key]) => key)
}

/**
 * 项 id 重复：key 项的 id = 它的 key，非 key 项 = 显式 `id`，两者共用同一命名空间——
 * 撞车会让搜索命中歧义（`[data-setting-key]` / `[data-setting-id]` 各闪一个控件）。
 */
const findDuplicatedItemIds = (sections: readonly Section[]) => {
  const count = new Map<string, number>()
  for (const id of [...keyItemKeys(sections), ...nonKeyItemIds(sections)]) count.set(id, (count.get(id) ?? 0) + 1)
  return [...count].filter(([, num]) => num > 1).map(([id]) => id)
}

/** 空分组：`items` 为空且不在白名单里（白名单 = 只有只读展示 / 占位的组）。 */
const findEmptyGroups = (sections: readonly Section[], allowed: readonly string[]) =>
  sections
    .flatMap(section => section.groups)
    .filter(group => !group.items.length && !allowed.includes(group.id))
    .map(group => group.id)

/** 白名单里的坏条目：id 不存在，或该组已经不是空的（补了项就该从名单里删掉）。 */
const findStaleEmptyGroupIds = (sections: readonly Section[], allowed: readonly string[]) => {
  const byId = new Map(sections.flatMap(section => section.groups).map(group => [group.id, group]))
  return allowed.filter(id => {
    const group = byId.get(id)
    return group == null || group.items.length > 0
  })
}

/** section / group 的 id 共用同一个 DOM id 命名空间，必须全局唯一。 */
const findDuplicatedIds = (sections: readonly Section[]) => {
  const count = new Map<string, number>()
  for (const id of sections.flatMap(section => [section.id, ...section.groups.map(group => group.id)])) {
    count.set(id, (count.get(id) ?? 0) + 1)
  }
  return [...count].filter(([, num]) => num > 1).map(([id]) => id)
}

/** 元数据里用到的 navGroup 集合（用来算「哪个一级分组一节都没有」）。 */
const usedNavGroups = (sections: readonly Section[]) => new Set(sections.map(section => section.navGroup))

/** 空的 i18nKey（item 报它的项 id，section / group 报它的 id）。 */
const findEmptyI18nKeys = (sections: readonly Section[]) => {
  const empty: string[] = []
  for (const section of sections) {
    if (!section.i18nKey) empty.push(section.id)
    for (const group of section.groups) {
      if (!group.i18nKey) empty.push(group.id)
      for (const item of group.items) {
        if (!item.i18nKey) empty.push(itemId(item))
      }
    }
  }
  return empty
}

/** 项 id 是空串的项（`itemId()` 的取值，报出来即可）。 */
const findEmptyItemIds = (sections: readonly Section[]) =>
  allItems(sections).filter(item => !itemId(item)).map(item => item.i18nKey)

describe('对账：defaultSetting 的每个 key 恰好登记一次', () => {
  it('没有「缺」：每个设置 key 都在 item 或内部机制键白名单里', () => {
    expect(findUnregisteredKeys(SETTING_SECTIONS, SETTING_KEYS)).toEqual([])
  })

  it('没有「多」：登记表里没有 defaultSetting 不存在的 key', () => {
    expect(findUnknownKeys(SETTING_SECTIONS, SETTING_KEYS)).toEqual([])
  })

  it('没有「重复」：每个 key 只被登记一次', () => {
    expect(findDuplicatedKeys(SETTING_SECTIONS)).toEqual([])
  })

  it('对账覆盖了全部 130+ 个设置 key（防止 SETTING_KEYS 取空导致上面三条空转）', () => {
    expect(SETTING_KEYS.length).toBeGreaterThan(120)
    expect(keyItemKeys(SETTING_SECTIONS).length).toBe(SETTING_KEYS.length - INTERNAL_ONLY_KEYS.length)
  })

  it('白名单逐个列出、不含通配，且都真实存在于 defaultSetting', () => {
    // 白名单里出现 `*` 之类的通配会让「逐 key 命中」失效
    for (const key of INTERNAL_ONLY_KEYS) expect(key).not.toContain('*')
    // 白名单里留着已删的 key 也会被「多」抓住（这里再显式盯一次）
    for (const key of INTERNAL_ONLY_KEYS) expect(SETTING_KEYS).toContain(key)
  })
})

describe('非 key 控件项与空分组（票 05 的两条偏离已收口）', () => {
  it('非 key 项已进表（不是空名单——否则下面几条会空转）', () => {
    expect(nonKeyItemIds(SETTING_SECTIONS).length).toBeGreaterThan(30)
  })

  it('非 key 项的 id 非空、全局唯一，且不与任何 key 撞车', () => {
    expect(findEmptyItemIds(SETTING_SECTIONS)).toEqual([])
    expect(findDuplicatedItemIds(SETTING_SECTIONS)).toEqual([])
  })

  it('除白名单外，每组至少一项（搜索不该只能命中组标题）', () => {
    expect(findEmptyGroups(SETTING_SECTIONS, GROUPS_WITHOUT_ITEMS)).toEqual([])
  })

  it('白名单里都是真实存在且确实为空的组（补了项就要从名单里删掉）', () => {
    expect(findStaleEmptyGroupIds(SETTING_SECTIONS, GROUPS_WITHOUT_ITEMS)).toEqual([])
  })

  it('`itemId()` 对两种项都给得出稳定 id（key 项 = key，非 key 项 = 显式 id）', () => {
    const keyItem: Item = { key: 'player.volume', i18nKey: 'setting__fake', control: 'slider' }
    const nonKeyItem: Item = { id: 'hot_key_local_enable', i18nKey: 'setting__fake', control: 'checkbox' }
    expect(itemId(keyItem)).toBe('player.volume')
    expect(itemId(nonKeyItem)).toBe('hot_key_local_enable')
  })
})

describe('元数据自身的结构', () => {
  it('section / group 的 id 全局唯一', () => {
    expect(findDuplicatedIds(SETTING_SECTIONS)).toEqual([])
  })

  it('节 id 就是 spec §2 定下的 10 个', () => {
    expect([...SETTING_SECTIONS.map(section => section.id)].sort()).toEqual([
      'about',
      'advanced',
      'appearance',
      'data',
      'desktop_lyric',
      'download',
      'hot_key',
      'my_music',
      'network',
      'play',
    ])
  })

  it('每个 navGroup 至少一节', () => {
    const used = usedNavGroups(SETTING_SECTIONS)
    expect(SETTING_NAV_GROUPS.filter(group => !used.has(group.id))).toEqual([])
  })

  it('一级分组按 SETTING_NAV_GROUPS 的顺序**连续**出现（左栏两级的前提）', () => {
    // 分组标题是左栏里的「标题行」，同名的两段标题中间夹着别的分组就是坏导航
    const runs = SETTING_SECTIONS.map(section => section.navGroup).filter((navGroup, index, list) => navGroup != list[index - 1])
    expect(runs).toEqual(SETTING_NAV_GROUPS.map(group => group.id))
  })

  it('每节至少一个分组，每组标题的 id 带节前缀（便于当锚点 id 用）', () => {
    for (const section of SETTING_SECTIONS) {
      expect(section.groups.length).toBeGreaterThan(0)
      for (const group of section.groups) expect(group.id.startsWith(`${section.id}_`) || group.id.startsWith(section.id)).toBe(true)
    }
  })

  it('item 的 i18nKey 非空（item / group / section 都查）', () => {
    expect(findEmptyI18nKeys(SETTING_SECTIONS)).toEqual([])
  })
})

describe('坏数据必须被检查抓住（负向验证）', () => {
  const firstSection = SETTING_SECTIONS[0]
  const firstGroup = firstSection.groups[0]

  it('从元数据删掉一个 item → 「缺」会报出这个 key', () => {
    const dropped = firstGroup.items[0]
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, items: firstGroup.items.slice(1) }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findUnregisteredKeys(sections, SETTING_KEYS)).toEqual([dropped.key])
  })

  it('item 的 key 不在 defaultSetting → 「多」会报出来', () => {
    const ghost: Item = {
      key: 'common.notARealKey' as unknown as keyof LX.AppSetting,
      i18nKey: 'setting__fake',
      control: 'checkbox',
    }
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, items: [...firstGroup.items, ghost] }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findUnknownKeys(sections, SETTING_KEYS)).toEqual(['common.notARealKey'])
  })

  it('同一个 item key 登记两次 → 「重复」会报出来', () => {
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, items: [...firstGroup.items, firstGroup.items[0]] }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findDuplicatedKeys(sections)).toEqual([firstGroup.items[0].key])
  })

  it('item 与内部机制键撞车 → 也算「重复」', () => {
    const internalKey = INTERNAL_ONLY_KEYS[0]
    const clashing: Item = { key: internalKey, i18nKey: 'setting__clash', control: 'checkbox' }
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, items: [...firstGroup.items, clashing] }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findDuplicatedKeys(sections)).toEqual([internalKey])
  })

  it('section id 重复 → 会被抓住', () => {
    const sections: Section[] = [...SETTING_SECTIONS, { ...firstSection, groups: [] }]
    expect(findDuplicatedIds(sections)).toEqual([firstSection.id])
  })

  it('group id 重复 → 会被抓住', () => {
    const sections: Section[] = [
      { ...firstSection, groups: [...firstSection.groups, { ...firstGroup, items: [] }] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findDuplicatedIds(sections)).toEqual([firstGroup.id])
  })

  it('navGroup 没有任何节 → 会被抓住', () => {
    // 砍掉全部「高级」节，`advanced` 这个一级分组就空了
    const sections = SETTING_SECTIONS.filter(section => section.navGroup != 'advanced')
    const used = usedNavGroups(sections)
    expect(SETTING_NAV_GROUPS.filter(group => !used.has(group.id)).map(group => group.id)).toEqual(['advanced'])
  })

  it('i18nKey 写成空串 → 会被抓住（item 与 group 都查）', () => {
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, i18nKey: '', items: [{ ...firstGroup.items[0], i18nKey: '' }, ...firstGroup.items.slice(1)] }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findEmptyI18nKeys(sections)).toEqual([firstGroup.id, firstGroup.items[0].key])
  })

  it('非 key 项的 id 撞上某个 key → 「重复 id」会报出来', () => {
    const clashing: Item = { id: 'player.volume', i18nKey: 'setting__clash', control: 'button' }
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, items: [...firstGroup.items, clashing] }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findDuplicatedItemIds(sections)).toEqual(['player.volume'])
  })

  it('忘写 id（`itemId()` 取不到值）→ 会被抓住', () => {
    // 类型上 `NonKeyItem.id` 是必填的，这里绕过类型模拟「有人用 as/JS 写漏了」
    const broken = { i18nKey: 'setting__fake', control: 'button' } as unknown as Item
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, items: [...firstGroup.items, broken] }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findEmptyItemIds(sections)).toEqual(['setting__fake'])
  })

  it('把某组的 items 清空 → 「空分组」会报出来（白名单之外）', () => {
    const sections: Section[] = [
      { ...firstSection, groups: [{ ...firstGroup, items: [] }, ...firstSection.groups.slice(1)] },
      ...SETTING_SECTIONS.slice(1),
    ]
    expect(findEmptyGroups(sections, GROUPS_WITHOUT_ITEMS)).toEqual([firstGroup.id])
  })

  it('白名单里留着一个已经有项的组 / 不存在的组 → 会被抓住', () => {
    expect(findStaleEmptyGroupIds(SETTING_SECTIONS, ['appearance_theme'])).toEqual(['appearance_theme'])
    expect(findStaleEmptyGroupIds(SETTING_SECTIONS, ['not_a_real_group'])).toEqual(['not_a_real_group'])
  })
})
