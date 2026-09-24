/**
 * 设置页骨架的静态结构（设置页重构票 02）。
 *
 * 这里只放「左栏/内容区怎么拼」的三张表，一次定义、三处共用（index.vue 渲染、搜索跳转、深链改写），
 * 免得左栏、搜索、路由各抄一份。**节的划分、顺序、文案 key 全部来自 `@common/settingMetadata`**，
 * 本文件不重排、不新增节。
 *
 * 纯数据 + 纯函数（不碰 DOM / Vue），单测见同目录 `settingNav.test.ts`。
 */
import {
  SETTING_NAV_GROUPS,
  SETTING_SECTIONS,
  type Section,
  type SettingNavGroupId,
} from '@common/settingMetadata'

/**
 * 旧深链 `?name=<旧节组件名>` → 新节 id（spec §8 风险条要的那张兼容映射）。
 *
 * 旧的 17 个节一个不少：一个旧节可能被收进同一新节（`my_music` 收了 QQ 账号 / 列表 / 搜索 / 强迫症四个），
 * 也可能一个旧节拆到两处（`SettingOther` 的托盘图标归 `appearance`、清理与备份归 `data`）——
 * 拆分时取**主要内容所在的那一节**，另一节的分组用节内锚点直达（票 03 归位前锚点见下 `SECTION_CONTENT`）。
 */
export const LEGACY_SECTION_MAP: Readonly<Record<string, string>> = {
  SettingBasic: 'appearance',
  SettingQQAuth: 'my_music',
  SettingSearch: 'my_music',
  SettingList: 'my_music',
  SettingOdc: 'my_music',
  SettingPlay: 'play',
  SettingPlayDetail: 'play',
  SettingDesktopLyric: 'desktop_lyric',
  SettingDownload: 'download',
  SettingHotKey: 'hot_key',
  SettingBackup: 'data',
  SettingOther: 'data',
  SettingNetwork: 'network',
  SettingUpdate: 'about',
  SettingAbout: 'about',
  SettingOpenAPI: 'advanced',
  SettingSync: 'advanced',
}

/** 深链缺省落地：第一节（外观）。 */
export const DEFAULT_SECTION_ID: string = SETTING_SECTIONS[0].id

export interface ResolvedSectionName {
  sectionId: string
  /** 命中的是旧组件名——调用方应把地址改写成 `sectionId`（保留其它 query），让分享出去的链接落在新 id 上。 */
  legacy: boolean
}

/**
 * 解析 `?name=`：先认新节 id，再查旧名映射，都不认返回 `null`（调用方用 `DEFAULT_SECTION_ID` 兜底）。
 * 传 `unknown` 是因为 `route.query.name` 的类型是 `string | string[] | null`。
 */
export const resolveSectionName = (name: unknown): ResolvedSectionName | null => {
  if (typeof name != 'string' || !name) return null
  if (SETTING_SECTIONS.some(section => section.id === name)) return { sectionId: name, legacy: false }
  const mapped = LEGACY_SECTION_MAP[name]
  return mapped ? { sectionId: mapped, legacy: true } : null
}

export interface NavTreeNode {
  id: SettingNavGroupId
  i18nKey: string
  sections: readonly Section[]
}

/**
 * 左栏两级：一级分组（不可点的分组标题）× 其下的节（可点）。
 * 顺序完全来自 `SETTING_NAV_GROUPS` 与 `SETTING_SECTIONS` 的数组顺序（元数据表里钉着「一级分组连续」）。
 */
export const SETTING_NAV_TREE: readonly NavTreeNode[] = SETTING_NAV_GROUPS.map(group => ({
  id: group.id,
  i18nKey: group.i18nKey,
  // 每组至少一节（元数据用例钉着），所以不需要过滤空分组
  sections: SETTING_SECTIONS.filter(section => section.navGroup === group.id),
}))

/**
 * 每节的内容由哪个组件渲染（值就是 `index.vue` 的 `components:` 里注册的组件名，一个节一个组件）。
 *
 * 票 03 已完成逐节归位：内容在 `components/sections/<节 id>/index.vue`，按元数据的分组顺序摆好，
 * 分组锚点 id = `group.id`、每个设置项带 `data-setting-key`。旧的 17 个节组件**已从内容区退场**
 * （文件仍在 `components/` 下，票 04 收尾时删），所以这张表不再背「旧组件不许丢」的约束——
 * 单测改为钉「每个节都有组件文件、且旧组件不再挂在任何节上」。
 */
export const SECTION_CONTENT: Readonly<Record<string, readonly string[]>> = {
  appearance: ['SettingSectionAppearance'],
  play: ['SettingSectionPlay'],
  desktop_lyric: ['SettingSectionDesktopLyric'],
  download: ['SettingSectionDownload'],
  my_music: ['SettingSectionMyMusic'],
  hot_key: ['SettingSectionHotKey'],
  data: ['SettingSectionData'],
  network: ['SettingSectionNetwork'],
  about: ['SettingSectionAbout'],
  advanced: ['SettingSectionAdvanced'],
}
