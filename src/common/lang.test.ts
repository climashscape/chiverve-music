import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zhCn from '@root/lang/zh-cn.json'
import zhTw from '@root/lang/zh-tw.json'
import enUs from '@root/lang/en-us.json'
import koKr from '@root/lang/ko-kr.json'
import { SETTING_NAV_GROUPS, SETTING_SECTIONS } from './settingMetadata'

/**
 * 四份语言文件的一致性（设置页重构票 11 的验收；`src/lang/` 不在 vitest 的 include 白名单里，
 * 所以用例放在 `src/common/`，用相对路径 import 四份 json）。
 *
 * 钉住四件事：
 * 1. **key 集合完全一致**——以 `zh-cn.json` 为基准，多一条、少一条都失败，失败信息里直接打印差集；
 *    漏翻一份不会被发现（历史上 `ko-kr` 曾整批少 39 条新文案），所以这条要机器兜，不靠人眼。
 * 2. **没有重复 key**——`JSON.parse` 会让后一个同名 key 静默覆盖前一个（`list__unlove` 就是这么
 *    被盖掉的），所以重复检测读**原文**而不是 parse 结果。
 * 3. **值都是实义字符串**——空串 / 全空白 / 非字符串会让界面露出 key 名或空白。
 * 4. **元数据声明的文案 key 四份都有**——`settingMetadata.ts` 的节名 / 分组名 / 项名 / 帮助
 *    （`helpI18nKey`）就是设置页要渲染的全部文案，声明了却没补语言文件 = 界面露出 `setting__xxx`。
 *
 * 上面每条检查函数都与数据解耦（都收参数），末尾用「注入坏数据」的用例跑一遍（负向验证），
 * 避免检查写成永远为真。文案的**措辞**不在这里钉（人眼的事），这里只钉「不漏、不重、不空、不露 key」。
 */

type Dict = Record<string, string>

/** 四份语言；基准是 `zh-cn`（其余三份都与它比）。 */
const DICTS: ReadonlyArray<{ id: string, dict: Dict }> = [
  { id: 'zh-cn', dict: zhCn as Dict },
  { id: 'zh-tw', dict: zhTw as Dict },
  { id: 'en-us', dict: enUs as Dict },
  { id: 'ko-kr', dict: koKr as Dict },
]

/** 副本用 `<lang id>.json` 的路径（重复 key 检测要读原文）。 */
const langDir = path.resolve(process.cwd(), 'src/lang')

/** 排序后的 key 清单（比较时与顺序无关，但固定顺序能让失败信息可读）。 */
const keysOf = (dict: Dict) => Object.keys(dict).sort()

/** 以 `prefix` 开头的 key（`setting__*` 计数、`setting__play_quality_*` 这类同族检查用）。 */
const keysWithPrefix = (dict: Dict, prefix: string) => keysOf(dict).filter(key => key.startsWith(prefix))

/** 两份 key 集合的差集：`missing` = 基准有、对方没有；`extra` = 对方有、基准没有。 */
const diffKeys = (baseKeys: readonly string[], otherKeys: readonly string[]) => {
  const other = new Set(otherKeys)
  const base = new Set(baseKeys)
  return {
    missing: baseKeys.filter(key => !other.has(key)),
    extra: otherKeys.filter(key => !base.has(key)),
  }
}

/** 原文里出现两次以上的 key（`JSON.parse` 之后已经看不见了，必须扫原文）。 */
const findDuplicatedKeys = (raw: string) => {
  const count = new Map<string, number>()
  for (const match of raw.matchAll(/^\s*"([^"]+)":/gm)) {
    count.set(match[1], (count.get(match[1]) ?? 0) + 1)
  }
  return [...count].filter(([, num]) => num > 1).map(([key]) => key)
}

/** 值不是「有内容的字符串」的 key（空串 / 全空白 / 非字符串）。 */
const findBadValues = (dict: Dict) => Object.entries(dict)
  .filter(([, value]) => typeof value != 'string' || !value.trim())
  .map(([key]) => key)

/** 元数据声明的全部文案 key：一级分组名 + 节名 + 分组名 + 项名 + 帮助（`helpI18nKey`）。 */
const declaredI18nKeys = () => [
  ...SETTING_NAV_GROUPS.map(group => group.i18nKey),
  ...SETTING_SECTIONS.flatMap(section => [
    section.i18nKey,
    ...section.groups.flatMap(group => [
      group.i18nKey,
      ...group.items.flatMap(item => [
        item.i18nKey,
        ...(item.helpI18nKey ? [item.helpI18nKey] : []),
      ]),
    ]),
  ]),
]

/** 某一份语言里缺失或为空的文案 key（声明了却没补 = 界面会露出 key 名）。 */
const findUndefinedI18nKeys = (dict: Dict, keys: readonly string[]) =>
  keys.filter(key => !(typeof dict[key] == 'string' && dict[key].trim()))

const readLangRaw = (id: string) => fs.readFileSync(path.join(langDir, `${id}.json`), 'utf8')

const BASE = DICTS[0]
const OTHERS = DICTS.slice(1)

describe('四份语言的 key 集合完全一致', () => {
  it('基准 `zh-cn` 有内容（防止四份都取空导致下面全部空转）', () => {
    expect(keysOf(BASE.dict).length).toBeGreaterThan(1000)
  })

  for (const { id, dict } of OTHERS) {
    it(`${id} 与 ${BASE.id} 逐 key 对齐（多、少都失败）`, () => {
      expect(diffKeys(keysOf(BASE.dict), keysOf(dict))).toEqual({ missing: [], extra: [] })
    })
  }

  it('四份的 key 条数相同（票 11 的验收：各语言条数一致）', () => {
    const baseCount = keysOf(BASE.dict).length
    for (const { id, dict } of OTHERS) expect([id, keysOf(dict).length]).toEqual([id, baseCount])
  })

  it('四份的 `setting__*` 条数相同（票 11 的验收逐字要求）', () => {
    const baseCount = keysWithPrefix(BASE.dict, 'setting__').length
    expect(baseCount).toBeGreaterThan(300)
    for (const { id, dict } of OTHERS) expect([id, keysWithPrefix(dict, 'setting__').length]).toEqual([id, baseCount])
  })
})

describe('四份语言的内容合法', () => {
  for (const { id, dict } of DICTS) {
    it(`${id} 没有重复 key（后一个会静默盖掉前一个，见历史上被盖掉的 list__unlove）`, () => {
      expect(findDuplicatedKeys(readLangRaw(id))).toEqual([])
    })

    it(`${id} 没有空值 / 非字符串值`, () => {
      expect(findBadValues(dict)).toEqual([])
    })
  }

  it('原文的 key 条数与 parse 结果一致（重复 key 的另一种说法，四份都查）', () => {
    for (const { id, dict } of DICTS) {
      const rawCount = [...readLangRaw(id).matchAll(/^\s*"([^"]+)":/gm)].length
      expect([id, rawCount]).toEqual([id, keysOf(dict).length])
    }
  })
})

describe('元数据声明的文案 key 四份都有实义值', () => {
  it('声明的 key 覆盖了设置页全部节 / 分组 / 项 / 帮助', () => {
    expect(declaredI18nKeys().length).toBeGreaterThan(200)
  })

  for (const { id, dict } of DICTS) {
    it(`${id} 不缺任何声明过的文案 key`, () => {
      expect(findUndefinedI18nKeys(dict, declaredI18nKeys())).toEqual([])
    })
  }
})

describe('坏数据必须被检查抓住（负向验证）', () => {
  const baseKeys = keysOf(BASE.dict)

  it('某份少一个 key → 差集报出它', () => {
    const dropped = baseKeys[0]
    expect(diffKeys(baseKeys, baseKeys.slice(1))).toEqual({ missing: [dropped], extra: [] })
  })

  it('某份多一个 key → 差集报出它', () => {
    expect(diffKeys(baseKeys, [...baseKeys, 'setting__ghost'])).toEqual({ missing: [], extra: ['setting__ghost'] })
  })

  it('同一个 key 定义两次 → 重复检测报出它', () => {
    expect(findDuplicatedKeys('{\n  "list__unlove": "a",\n  "list__unlove": "b"\n}')).toEqual(['list__unlove'])
  })

  it('值为空串 / 全空白 / 非字符串 → 都会被报出', () => {
    const broken: Dict = { setting__a: '', setting__b: '   ', setting__c: 1 as unknown as string }
    expect(findBadValues(broken)).toEqual(['setting__a', 'setting__b', 'setting__c'])
  })

  it('元数据声明了某 key 但语言文件里没有 / 为空 → 会被报出', () => {
    const dict: Dict = { setting__exists: '有', setting__empty: '  ' }
    expect(findUndefinedI18nKeys(dict, ['setting__exists', 'setting__notyet', 'setting__empty'])).toEqual(['setting__notyet', 'setting__empty'])
  })
})
