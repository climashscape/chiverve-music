import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { PAGE_SIZE_OPTIONS } from '@common/settings/pageSize'
import BaseCheckbox from '@renderer/components/base/Checkbox.vue'
import BaseSelection from '@renderer/components/base/Selection.vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { appSetting } from '@renderer/store/setting'
import zhCn from '@root/lang/zh-cn.json'
import MyMusicListGroup from './my_music/MyMusicListGroup.vue'
import MyMusicSearchGroup from './my_music/MyMusicSearchGroup.vue'
import PlayLyricMain from './play/PlayLyricMain.vue'

/**
 * 设置项入口的渲染冒烟（设置页重构票 09 的 E/F/G 三处）。
 *
 * 为什么要有这层：元数据对账（`settingMetadata.test.ts`）只能证明「key 登记了」，
 * 证明不了「控件真的渲染出来、值真的绑对了」。这三处的控件都是手写的（不是元数据驱动渲染），
 * 断一条链（漏调 `updateSetting`、`base-selection` 少了 `item-key`/`item-name`、文案 key 写错）
 * 单测与 build 都不会红——只有真机或渲染测试能发现。这里用**真实的基础控件**挂载（不 stub
 * `base-checkbox` / `base-selection`），把「显示出来的值」也一起钉住。
 *
 * 文案断言取 `zh-cn.json` 里的值而不是写死中文字面量：措辞归票 11 管，改词不该让这里红。
 */
const t = (key: keyof typeof zhCn) => zhCn[key]

/** 挂载 + 等一帧：`base-checkbox` 的选中态是在 `mounted` 里算出来再写回 data 的。 */
const mountWithI18n = async(component: unknown) => {
  const wrapper = mount(component as never, {
    global: {
      plugins: [i18nPlugin],
      components: { 'base-checkbox': BaseCheckbox, 'base-selection': BaseSelection },
      // base-input 与 svg-icon 是全局注册的，这里只关心「挂上了没 / 值对不对」
      stubs: {
        'base-input': { props: ['modelValue', 'placeholder'], template: '<input class="stub-input" :value="modelValue">' },
        'svg-icon': true,
      },
    },
  })
  await nextTick()
  return wrapper
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
