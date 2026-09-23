import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SettingNav from './SettingNav.vue'
import { SETTING_NAV_TREE } from '../settingNav'
import zhCn from '@root/lang/zh-cn.json'

/**
 * 左栏的渲染冒烟测试（票 02 的「两级左栏」验收）。
 *
 * 断言不写死文案字面量，而是取 `zh-cn` 里同一个 key 的值——票 11 会按附 A 改措辞，
 * 那时这里不该跟着红。`svg-icon` 是全局注册的（`renderer/components/index.js`），
 * 单测里用 stub 顶掉，与本组件的行为无关。
 */
const t = (key: keyof typeof zhCn) => zhCn[key]

const downloadGroups = [
  { id: 'download_switch_path', i18nKey: 'setting__download_switch_path_title' },
  { id: 'download_format', i18nKey: 'setting__download_format_title' },
]

const mountNav = (props: Record<string, unknown> = {}) => mount(SettingNav, {
  props: {
    navTree: SETTING_NAV_TREE,
    activeSectionId: 'download',
    groups: downloadGroups,
    activeGroupId: 'download_format',
    ...props,
  },
  global: {
    stubs: { 'svg-icon': true },
  },
})

describe('SettingNav：两级左栏', () => {
  it('一级分组的 6 个标题与 10 个节名都渲染出来（都来自元数据）', () => {
    const text = mountNav().text()
    for (const node of SETTING_NAV_TREE) expect(text, node.id).toContain(t(node.i18nKey as keyof typeof zhCn))
    for (const section of SETTING_NAV_TREE.flatMap(node => node.sections)) {
      expect(text, section.id).toContain(t(section.i18nKey as keyof typeof zhCn))
    }
  })

  it('只有当前节展开它的分组目录（别的节的分组标题不出现）', () => {
    const wrapper = mountNav()
    expect(wrapper.text()).toContain(t('setting__download_switch_path_title'))
    // 「主题」是外观节的分组，当前节是下载，不该出现
    expect(wrapper.text()).not.toContain(t('setting__basic_theme'))
  })

  it('当前节与当前分组各挂一个高亮状态（aria-current 跟着走）', () => {
    const wrapper = mountNav()
    const current = wrapper.findAll('[aria-current="true"]')
    expect(current).toHaveLength(2)
    const labelOf = (el: (typeof current)[number]) => el.text()
    expect(labelOf(current[0])).toContain(t('setting__download'))
    expect(labelOf(current[1])).toContain(t('setting__download_format_title'))
  })

  it('点节名 / 点分组各自抛出对应事件', async() => {
    const wrapper = mountNav()
    const sectionButton = wrapper.findAll('button').find(button => button.text().includes(t('setting__network')))
    expect(sectionButton, '找不到「网络」节').toBeTruthy()
    await sectionButton!.trigger('click')
    expect(wrapper.emitted('select-section')).toEqual([['network']])

    const groupButton = wrapper.findAll('button').find(button => button.text().includes(t('setting__download_format_title')))
    await groupButton!.trigger('click')
    expect(wrapper.emitted('select-group')).toEqual([['download_format']])
  })

  it('当前节没有锚点时（内容未归位）不渲染空目录', () => {
    const wrapper = mountNav({ groups: [] })
    // 节名照常渲染，只是一个分组按钮都没有
    expect(wrapper.findAll('button')).toHaveLength(SETTING_NAV_TREE.flatMap(node => node.sections).length)
  })
})
