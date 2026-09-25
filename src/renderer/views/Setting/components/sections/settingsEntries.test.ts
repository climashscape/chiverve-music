import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_SIZE_OPTIONS } from '@common/settings/pageSize'
import { SETTING_SECTIONS, hotKeyItemId, itemId, type Section } from '@common/settingMetadata'
import BaseCheckbox from '@renderer/components/base/Checkbox.vue'
import BaseSelection from '@renderer/components/base/Selection.vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { appSetting } from '@renderer/store/setting'
import { allHotKeys } from '@renderer/utils/ipc'
import zhCn from '@root/lang/zh-cn.json'
import MyMusicListGroup from './my_music/MyMusicListGroup.vue'
import MyMusicSearchGroup from './my_music/MyMusicSearchGroup.vue'
import MyMusicSourceGroup from './my_music/MyMusicSourceGroup.vue'
import PlayLyricMain from './play/PlayLyricMain.vue'
import SettingSectionData from './data/index.vue'
import SettingSectionHotKey from './hot_key/index.vue'
import SettingHelpIcon from '@renderer/components/common/SettingHelpIcon.vue'

/**
 * 设置项入口的渲染冒烟（设置页重构票 09 的 E/F/G 三处 + 票 05 收口的非 key 控件项）。
 *
 * 为什么要有这层：元数据对账（`settingMetadata.test.ts`）只能证明「key 登记了」，
 * 证明不了「控件真的渲染出来、值真的绑对了」。这三处的控件都是手写的（不是元数据驱动渲染），
 * 断一条链（漏调 `updateSetting`、`base-selection` 少了 `item-key`/`item-name`、文案 key 写错）
 * 单测与 build 都不会红——只有真机或渲染测试能发现。这里用**真实的基础控件**挂载（不 stub
 * `base-checkbox` / `base-selection`），把「显示出来的值」也一起钉住。
 *
 * 票 05 收口（2026-09-25）后多一类断言：**非 key 控件项要真的渲染出 `data-setting-id`**——
 * 搜索命中靠它定位控件，元数据登记了而 DOM 上没挂（或 id 写歪）同样只有渲染测试能发现。
 *
 * 文案断言取 `zh-cn.json` 里的值而不是写死中文字面量：措辞归票 11 管，改词不该让这里红。
 */
const t = (key: keyof typeof zhCn) => zhCn[key]

/** 挂载 + 等一帧：`base-checkbox` 的选中态是在 `mounted` 里算出来再写回 data 的。 */
const mountWithI18n = async(component: unknown) => {
  const wrapper = mount(component as never, {
    global: {
      plugins: [i18nPlugin],
      components: {
        'base-checkbox': BaseCheckbox,
        'base-selection': BaseSelection,
        // `?` 帮助键（设置页票 13 起是可点的按钮）：挂**真件**——这几条断言断的就是
        // 「帮助文案挂在这一项上」，替身会把这条链断掉（真件把文案写在按钮的 title 上）
        'common-setting-help-icon': SettingHelpIcon,
      },
      // base-input / base-btn / svg-icon 是全局注册的，这里只关心「挂上了没 / 值对不对」；
      // material-modal 也是全局注册的（数据节的「不喜欢规则」弹窗关着时不渲染内容），替身掉省一条警告
      stubs: {
        'base-input': { props: ['modelValue', 'placeholder'], template: '<input class="stub-input" :value="modelValue">' },
        'base-btn': { template: '<button class="stub-btn"><slot /></button>' },
        'svg-icon': true,
        'material-modal': true,
      },
    },
  })
  await nextTick()
  return wrapper
}

/** 某节的全部项 id（元数据顺序）：key 项 = key，非 key 项 = 显式 id。 */
const sectionItemIds = (section: Section) => section.groups.flatMap(group => group.items).map(item => itemId(item))

/** 某节里的非 key 项 id。 */
const sectionNonKeyItemIds = (section: Section) =>
  section.groups.flatMap(group => group.items).flatMap(item => (item.id == null ? [] : [item.id]))

/** 按 id 取元数据里的节（真数据，不另抄一份）。 */
const sectionOf = (sectionId: string) => {
  const section = SETTING_SECTIONS.find(section => section.id === sectionId)
  if (!section) throw new Error(`节不存在：${sectionId}`)
  return section
}

/**
 * `components/` 下全部 .vue 的源码文本（跨文件契约检查用，抄 `settingNav.test.ts` 的做法）。
 * 扫整棵子树而不是只扫 `sections/<节 id>/`：部分非 key 控件在共用子组件里
 * （如 `advanced` 的两个按钮在 `SettingSync/SyncServer.vue`）。
 */
const readAllComponentSources = (): string => {
  const componentsDir = path.resolve(process.cwd(), 'src/renderer/views/Setting/components')
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.vue') ? [fs.readFileSync(full, 'utf8')] : []
  })
  return walk(componentsDir).join('\n')
}

describe('E 歌词来源优先级（播放 → 歌词显示（主窗））', () => {
  it('渲染出两个单选项：默认选中 localFirst，文案四语由 setting__lyric_source_priority_<值> 给', async() => {
    const wrapper = await mountWithI18n(PlayLyricMain)
    const block = wrapper.find('[data-setting-key="lyric.sourcePriority"]')
    expect(block.exists(), '整组没渲染出来').toBe(true)
    expect(block.text()).toContain(t('setting__lyric_source_priority'))

    const inputs = block.findAll('input')
    expect(inputs.map(input => (input.element as HTMLInputElement).value)).toEqual(['localFirst', 'onlineFirst'])
    // 默认值 = 改造前行为（先本地），所以第一个应该是选中态
    expect((inputs[0].element as HTMLInputElement).checked).toBe(true)
    expect((inputs[1].element as HTMLInputElement).checked).toBe(false)
    // 两个选项标签都真的解析出了文案（不是露出 key 名）
    expect(block.text()).toContain(t('setting__lyric_source_priority_localFirst'))
    expect(block.text()).toContain(t('setting__lyric_source_priority_onlineFirst'))
  })

  it('`?` 帮助挂在同一组上（帮助文案存在且非空）', async() => {
    const wrapper = await mountWithI18n(PlayLyricMain)
    const block = wrapper.find('[data-setting-key="lyric.sourcePriority"]')
    expect(block.html()).toContain(t('setting__lyric_source_priority_tip'))
  })

  it('当前值是 onlineFirst 时选中态跟着走（值绑在 appSetting 上）', async() => {
    const original = appSetting['lyric.sourcePriority']
    appSetting['lyric.sourcePriority'] = 'onlineFirst'
    try {
      const wrapper = await mountWithI18n(PlayLyricMain)
      const inputs = wrapper.findAll('[data-setting-key="lyric.sourcePriority"] input')
      expect((inputs[0].element as HTMLInputElement).checked).toBe(false)
      expect((inputs[1].element as HTMLInputElement).checked).toBe(true)
    } finally {
      appSetting['lyric.sourcePriority'] = original
    }
  })
})

describe('F 搜索历史保留条数（我的音乐 → 搜索行为）', () => {
  it('渲染出数字输入框，值是设置里的当前值；位置紧跟在「记录并显示搜索历史」之后', async() => {
    const wrapper = await mountWithI18n(MyMusicSearchGroup)
    const block = wrapper.find('[data-setting-key="search.historyMaxNum"]')
    expect(block.exists(), '整项没渲染出来').toBe(true)
    expect(block.text()).toContain(t('setting__search_history_max_num'))
    expect((block.find('input.stub-input').element as HTMLInputElement).value).toBe(String(appSetting['search.historyMaxNum']))

    // 顺序 = 元数据顺序：总闸（isShowHistorySearch）在前、条数闸在后
    const html = wrapper.html()
    expect(html.indexOf('data-setting-key="search.isShowHistorySearch"')).toBeGreaterThan(-1)
    expect(html.indexOf('data-setting-key="search.isShowHistorySearch"')).toBeLessThan(html.indexOf('data-setting-key="search.historyMaxNum"'))
  })

  it('`?` 帮助挂在同一项上', async() => {
    const wrapper = await mountWithI18n(MyMusicSearchGroup)
    expect(wrapper.find('[data-setting-key="search.historyMaxNum"]').html()).toContain(t('setting__search_history_max_num_tip'))
  })
})

describe('G 列表每页条数（我的音乐 → 列表与收藏行为）', () => {
  it('下拉显示出当前值（纯数字档位也要有标签——base-selection 靠 item-key/item-name 取显示值）', async() => {
    const wrapper = await mountWithI18n(MyMusicListGroup)
    const block = wrapper.find('[data-setting-key="list.pageSize"]')
    expect(block.exists(), '整项没渲染出来').toBe(true)
    expect(block.text()).toContain(t('setting__list_page_size'))
    // 当前值 30 必须**显示出来**（少了 item-name 时这里是空的）
    expect(block.text()).toContain(String(appSetting['list.pageSize']))

    // 五档来自单来源模块，且按 base-selection 的契约传了 item-key/item-name（否则显示值为空）。
    // `base-selection` 的 props 是运行时声明（SFC 类型里推不出键名），取 props 只为断言「传了没」，
    // 故只在取值处放宽类型——断言与覆盖不变
    const selection = wrapper.findComponent(BaseSelection)
    const selectionProps = selection.props() as unknown as {
      itemKey: string
      itemName: string
      list: Array<{ id: number }>
    }
    expect(selectionProps.itemKey).toBe('id')
    expect(selectionProps.itemName).toBe('id')
    expect(selectionProps.list.map(item => item.id)).toEqual([...PAGE_SIZE_OPTIONS])
  })

  it('是本节第一项（元数据顺序：先决定怎么翻页，再决定列表里显示什么）', async() => {
    const wrapper = await mountWithI18n(MyMusicListGroup)
    const html = wrapper.html()
    expect(html.indexOf('data-setting-key="list.pageSize"')).toBeLessThan(html.indexOf('data-setting-key="list.actionButtonsVisible"'))
  })

  it('`?` 帮助挂在同一项上（帮助里点名了推荐歌单 9 条的例外）', async() => {
    const wrapper = await mountWithI18n(MyMusicListGroup)
    const html = wrapper.find('[data-setting-key="list.pageSize"]').html()
    expect(html).toContain(t('setting__list_page_size_tip'))
    expect(t('setting__list_page_size_tip')).toContain('9')
  })
})

describe('H 来源显示拆成独立分组（票 05 收口）', () => {
  it('两项都渲染出来，且带 data-setting-key（搜索能精确定位）', async() => {
    const wrapper = await mountWithI18n(MyMusicSourceGroup)
    const show = wrapper.find('[data-setting-key="list.isShowSource"]')
    const nameType = wrapper.find('[data-setting-key="common.sourceNameType"]')
    expect(show.exists(), '「显示歌曲来源标签」没渲染出来').toBe(true)
    expect(nameType.exists(), '「来源名的显示方式」没渲染出来').toBe(true)
    expect(show.text()).toContain(t('setting__list_source'))
    expect(nameType.text()).toContain(t('setting__list_source_name_type'))
    // 顺序 = 元数据顺序：先开关，再样式
    expect(wrapper.html().indexOf('data-setting-key="list.isShowSource"')).toBeLessThan(wrapper.html().indexOf('data-setting-key="common.sourceNameType"'))
  })

  it('两项显示的是设置里的当前值（绑定没断）', async() => {
    const wrapper = await mountWithI18n(MyMusicSourceGroup)
    const showInput = wrapper.find('[data-setting-key="list.isShowSource"] input').element as HTMLInputElement
    expect(showInput.checked).toBe(appSetting['list.isShowSource'])
    const checked = wrapper.findAll('[data-setting-key="common.sourceNameType"] input')
      .map(input => input.element as HTMLInputElement)
      .filter(input => input.checked)
      .map(input => input.value)
    expect(checked).toEqual([appSetting['common.sourceNameType']])
  })

  it('已从「列表与收藏行为」组里搬走（同一 id 不再出现两次）', async() => {
    const listWrapper = await mountWithI18n(MyMusicListGroup)
    expect(listWrapper.find('[data-setting-key="list.isShowSource"]').exists()).toBe(false)
    expect(listWrapper.find('[data-setting-key="common.sourceNameType"]').exists()).toBe(false)
  })
})

describe('I 非 key 控件项真的挂上了 data-setting-id（票 05 收口）', () => {
  it('快捷键节 28 项全部渲染出 data-setting-id', async() => {
    const ids = sectionNonKeyItemIds(sectionOf('hot_key'))
    expect(ids, '非 key 项的条数变了就得同步改这条断言').toHaveLength(28)
    const wrapper = await mountWithI18n(SettingSectionHotKey)
    for (const id of ids) expect(wrapper.find(`[data-setting-id="${id}"]`).exists(), id).toBe(true)
  })

  it('数据节 15 项全部渲染出 data-setting-id（只读展示的歌词偏移组没有项）', async() => {
    const ids = sectionNonKeyItemIds(sectionOf('data'))
    expect(ids).toHaveLength(15)
    const wrapper = await mountWithI18n(SettingSectionData)
    for (const id of ids) expect(wrapper.find(`[data-setting-id="${id}"]`).exists(), id).toBe(true)
  })

  it('元数据的快捷键项与 allHotKeys 一一对应（顺序也一致，id 由 hotKeyItemId 拼）', () => {
    const groupItemIds = (groupId: string) => {
      const group = sectionOf('hot_key').groups.find(group => group.id === groupId)
      if (!group) throw new Error(`分组不存在：${groupId}`)
      return group.items.map(item => itemId(item))
    }
    expect(groupItemIds('hot_key_local')).toEqual([
      hotKeyItemId('local', 'enable'),
      ...allHotKeys.local.map(item => hotKeyItemId('local', item.name)),
    ])
    expect(groupItemIds('hot_key_global')).toEqual([
      hotKeyItemId('global', 'enable'),
      ...allHotKeys.global.map(item => hotKeyItemId('global', item.name)),
    ])
  })

  it('每个非 key 项的 id 都能在组件源码里找到（跨文件契约，防改名漏改）', () => {
    // 快捷键那 26 个录入框的 id 是 `hotKeyItemId()` 现拼的，源码里只有函数名（上面那条用例盖了）；
    // 其余非 key 项的 id 都在组件源码里出现：模板里静态写（`data-setting-id="x"`）或写在脚本的
    // 数据结构里再绑上去（`settingId: 'x'`，见 CacheClearTable.vue 的四行）。两种都算，但必须出现。
    expect(sectionItemIds(sectionOf('hot_key'))).toHaveLength(28)
    const sources = readAllComponentSources()
    for (const section of SETTING_SECTIONS) {
      for (const id of sectionNonKeyItemIds(section).filter(id => !id.startsWith('hot_key_'))) {
        const found = sources.includes(`data-setting-id="${id}"`) || sources.includes(`'${id}'`) || sources.includes(`"${id}"`)
        expect(found, `${section.id} 的组件源码里没有项 id ${id}`).toBe(true)
      }
    }
  })
})
