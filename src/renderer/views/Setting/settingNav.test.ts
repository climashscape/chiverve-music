import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SECTION_ID,
  LEGACY_SECTION_MAP,
  SECTION_CONTENT,
  SETTING_NAV_TREE,
  resolveSectionName,
} from './settingNav'
import { SETTING_NAV_GROUPS, SETTING_SECTIONS } from '@common/settingMetadata'
import zhCn from '@root/lang/zh-cn.json'
import zhTw from '@root/lang/zh-tw.json'
import enUs from '@root/lang/en-us.json'
import koKr from '@root/lang/ko-kr.json'

/**
 * 设置页骨架的表（票 02）：旧深链映射、节 → 旧组件桥、左栏树、以及锚点 id 的落地情况。
 *
 * 三条纪律：
 * 1. 表里的节 / 分组的**内容**不在这里钉（那是 `settingMetadata.test.ts` 的事），这里只钉
 *    「骨架有没有把元数据一个不少地接出来」。
 * 2. 旧组件一个都不许在中途丢掉（`SECTION_CONTENT` 的并集必须等于旧节全集）——票 03 归位前，
 *    丢了就是入口消失。
 * 3. 锚点 id 是**跨文件契约**（元数据的 `group.id` ↔ 组件里的 `h3#<group.id>`）：这里直接读
 *    组件文件核对，改名漏改会被抓住。还没落位的分组列在 `PENDING_ANCHOR_GROUPS` 里，
 *    票 03/05-09 落一个删一个。
 */

const componentsDir = path.resolve(process.cwd(), 'src/renderer/views/Setting/components')

/** 递归取 components/ 下所有 .vue 的文本（锚点检查用）。 */
const readComponentSources = (): string[] => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.vue') ? [fs.readFileSync(full, 'utf8')] : []
  })
  return walk(componentsDir)
}

/** 取某个节的组件目录（`components/sections/<节 id>/`）下所有 .vue 的文本。 */
const readSectionSources = (sectionId: string): string[] => {
  const dir = path.join(componentsDir, 'sections', sectionId)
  const walk = (current: string): string[] => fs.readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.vue') ? [fs.readFileSync(full, 'utf8')] : []
  })
  return fs.existsSync(dir) ? walk(dir) : []
}

/**
 * 内容区里**还没有锚点**的分组：它们的项要么只在浮层里（音量 / 倍速 / 音效），要么是票 06/08/09
 * 才补的新设置。
 * 目录只列有锚点的分组（见 useSettingToc.ts），所以这份名单就是「目录里暂时少的那些」。
 */
const PENDING_ANCHOR_GROUPS = [
  'play_defaults',
  'play_stability',
]

const ALL_SECTION_IDS = SETTING_SECTIONS.map(section => section.id)
const ALL_GROUP_IDS = SETTING_SECTIONS.flatMap(section => section.groups.map(group => group.id))

/** 与顺序无关的集合比较（节 / 组件名这类不关心顺序的地方用它）。 */
const sorted = (list: readonly string[]) => [...list].sort((a, b) => a.localeCompare(b))

describe('旧深链 ?name= 的兼容映射', () => {
  it('17 个旧节名都能落到新节，且都标了 legacy（要改地址）', () => {
    expect(Object.keys(LEGACY_SECTION_MAP)).toHaveLength(17)
    for (const [legacyName, sectionId] of Object.entries(LEGACY_SECTION_MAP)) {
      expect(resolveSectionName(legacyName), legacyName).toEqual({ sectionId, legacy: true })
      expect(ALL_SECTION_IDS, legacyName).toContain(sectionId)
    }
  })

  it('新节 id 直接可用，不标 legacy', () => {
    for (const sectionId of ALL_SECTION_IDS) {
      expect(resolveSectionName(sectionId), sectionId).toEqual({ sectionId, legacy: false })
    }
  })

  it('spec §8 点名的几条映射关系对得上（多条旧节收进同一新节）', () => {
    expect(resolveSectionName('SettingDownload')?.sectionId).toBe('download')
    expect(resolveSectionName('SettingHotKey')?.sectionId).toBe('hot_key')
    expect(resolveSectionName('SettingBasic')?.sectionId).toBe('appearance')
    // 四个旧节合进 my_music、两个合进 data、两个合进 advanced
    for (const name of ['SettingQQAuth', 'SettingSearch', 'SettingList', 'SettingOdc']) {
      expect(resolveSectionName(name)?.sectionId, name).toBe('my_music')
    }
    expect(resolveSectionName('SettingBackup')?.sectionId).toBe('data')
    expect(resolveSectionName('SettingOther')?.sectionId).toBe('data')
    for (const name of ['SettingOpenAPI', 'SettingSync']) {
      expect(resolveSectionName(name)?.sectionId, name).toBe('advanced')
    }
  })

  it('不认识的名字 / 非字符串 / 空串都返回 null（调用方用默认节兜底）', () => {
    expect(resolveSectionName('SettingNotExist')).toBeNull()
    expect(resolveSectionName('')).toBeNull()
    expect(resolveSectionName(undefined)).toBeNull()
    expect(resolveSectionName(['appearance'])).toBeNull()
    expect(DEFAULT_SECTION_ID).toBe(SETTING_SECTIONS[0].id)
  })
})

describe('节 → 内容组件（票 03 归位后：一节 = 一个组件）', () => {
  it('每个节都有且只有一个内容组件，键就是元数据的节 id', () => {
    expect(sorted(Object.keys(SECTION_CONTENT))).toEqual(sorted(ALL_SECTION_IDS))
    for (const [sectionId, components] of Object.entries(SECTION_CONTENT)) {
      expect(components.length, sectionId).toBe(1)
    }
  })

  it('组件文件真的存在，且 `name:` 与表里登记的一致', () => {
    const names = Object.values(SECTION_CONTENT).flat()
    expect(new Set(names).size, '同一个组件挂了两次').toBe(names.length)
    for (const [sectionId, components] of Object.entries(SECTION_CONTENT)) {
      const sources = readSectionSources(sectionId)
      expect(sources.length, `${sectionId} 没有组件文件`).toBeGreaterThan(0)
      for (const name of components) {
        expect(sources.some(source => source.includes(`name: '${name}'`)), `${sectionId} 里没有 name: '${name}'`).toBe(true)
      }
    }
  })

  it('17 个旧节组件不再挂在任何节上（内容已归位，入口不再靠它们）', () => {
    const bridged = new Set(Object.values(SECTION_CONTENT).flat())
    for (const legacyName of Object.keys(LEGACY_SECTION_MAP)) {
      expect(bridged.has(legacyName), `${legacyName} 还挂在内容区`).toBe(false)
    }
  })
})

describe('左栏两级树', () => {
  it('一级分组顺序与文案 key 照抄元数据，且每组非空', () => {
    expect(SETTING_NAV_TREE.map(node => node.id)).toEqual(SETTING_NAV_GROUPS.map(group => group.id))
    expect(SETTING_NAV_TREE.map(node => node.i18nKey)).toEqual(SETTING_NAV_GROUPS.map(group => group.i18nKey))
    for (const node of SETTING_NAV_TREE) expect(node.sections.length, node.id).toBeGreaterThan(0)
  })

  it('节一个不少、不重复（树是按 navGroup 过滤出来的，漏一个就是左栏少一项）', () => {
    const sectionIds = SETTING_NAV_TREE.flatMap(node => node.sections.map(section => section.id))
    expect(sectionIds).toHaveLength(ALL_SECTION_IDS.length)
    expect(sorted(sectionIds)).toEqual(sorted(ALL_SECTION_IDS))
  })
})

describe('锚点 id 是跨文件契约（元数据 group.id ↔ 组件里的 DOM id）', () => {
  const sources = readComponentSources()

  it('已落位的分组都能在节组件里找到同名的 DOM id', () => {
    const missing = ALL_GROUP_IDS
      .filter(id => !PENDING_ANCHOR_GROUPS.includes(id))
      .filter(id => !sources.some(source => source.includes(`#${id}`) || source.includes(`id="${id}"`)))
    expect(missing, '这些分组的锚点在组件里找不到了（改名漏改？）').toEqual([])
  })

  it('待落位名单里的分组确实还没有锚点（票 03/05-09 落位后要把它们从名单里删掉）', () => {
    const alreadyAnchored = PENDING_ANCHOR_GROUPS.filter(id =>
      sources.some(source => source.includes(`#${id}`) || source.includes(`id="${id}"`)))
    expect(alreadyAnchored, '已经有锚点了，请从 PENDING_ANCHOR_GROUPS 删掉').toEqual([])
  })

  it('名单里的 id 都是真实的分组 id（防止写错名字后两边都「通过」）', () => {
    for (const id of PENDING_ANCHOR_GROUPS) expect(ALL_GROUP_IDS, id).toContain(id)
  })
})

describe('左栏 / 目录 / 搜索的文案四语齐备', () => {
  const messages: Record<string, Record<string, string>> = {
    'zh-cn': zhCn,
    'zh-tw': zhTw,
    'en-us': enUs,
    'ko-kr': koKr,
  }
  const missingIn = (messages: Record<string, string>, keys: readonly string[]) =>
    keys.filter(key => !messages[key]?.trim())

  // 骨架真正渲染出来的 key：一级分组 + 节名 + 分组名（+ 搜索框三键，写死在 SettingSearchBox.vue 里）
  const skeletonKeys = [
    ...SETTING_NAV_GROUPS.map(group => group.i18nKey),
    ...SETTING_SECTIONS.map(section => section.i18nKey),
    ...SETTING_SECTIONS.flatMap(section => section.groups.map(group => group.i18nKey)),
    'setting__search_placeholder',
    'setting__search_no_result',
    'setting__search_clear',
  ]

  it('四份语言里没有缺 key / 空值', () => {
    for (const [locale, message] of Object.entries(messages)) {
      expect(missingIn(message, skeletonKeys), `${locale} 缺文案`).toEqual([])
    }
  })

  it('缺 key 真的会被抓住（负向验证，防止上面那条空转）', () => {
    expect(missingIn(zhCn, ['setting__not_exist_key'])).toEqual(['setting__not_exist_key'])
    const emptied = { ...zhCn, [skeletonKeys[0]]: '   ' }
    expect(missingIn(emptied, [skeletonKeys[0]])).toEqual([skeletonKeys[0]])
  })
})
