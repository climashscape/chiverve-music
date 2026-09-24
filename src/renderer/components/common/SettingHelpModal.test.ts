import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import BaseBtn from '@renderer/components/base/Btn.vue'
import BaseCheckbox from '@renderer/components/base/Checkbox.vue'
import BaseSelection from '@renderer/components/base/Selection.vue'
import Modal from '@renderer/components/material/Modal.vue'
import MyMusicListGroup from '@renderer/views/Setting/components/sections/my_music/MyMusicListGroup.vue'
import zhCn from '@root/lang/zh-cn.json'
import SettingHelpIcon from './SettingHelpIcon.vue'
import SettingHelpModal from './SettingHelpModal.vue'
import { closeSettingHelp, openSettingHelp } from './useSettingHelp'

/**
 * 设置页 `?` 帮助：点击弹窗（2026-09-24 用户裁定「设置页的 `?` 帮助图标做成点击弹窗」）。
 *
 * 挂的是**真 SFC**：消费者用一个真实的设置节（`MyMusicListGroup`，它有两个 `?`），
 * 再加 `SettingHelpIcon` / `SettingHelpModal` 本体。只有两处替身，都有理由：
 * - `material-modal`（第 1–5 组）押着 `show` 渲染 slot —— 真件 teleport 到 `#view`，
 *   jsdom 里没有那个锚点（同 `ListAddModal.test.ts` 的口径）。弹窗**真件**另有一组用例（第 6 组）。
 * - `svg-icon` / `base-input`：本文件断言的是「键可点、点了弹哪句」，图标怎么画、输入框长什么样无关。
 *
 * 钉住的四件事：`?` 仍有原生 `title` + `aria-label`（AGENTS §2.5.1，不许因为换成按钮就丢）、
 * 点击后弹窗正文 = 该项 `helpI18nKey` 的文案、标题 = 设置项名（没有就退到「帮助」）、
 * 关得掉（底部键 / Esc）且**同一时刻只开一个**（第二个 `?` 不该叠在第一个上面）。
 *
 * 文案断 `zh-cn.json` 里的值而不是写死中文字面量：措辞归票 11 管，改词不该让这里红。
 */
const t = (key: keyof typeof zhCn) => zhCn[key]

/** `material-modal` 替身：照 `show` 渲染 slot，本文件断的正是「开了没 / 里面是什么」 */
const materialModalStub = {
  props: { show: { type: Boolean, default: false } },
  template: '<div v-if="show" class="modal"><slot /></div>',
}

/** 挂一个真实的设置节：`common-setting-help-icon` 是全局注册的（`components/index.js` 按目录名给
 *  `common-` 前缀，同 `common-list-add-modal`），测试里没有那层注册，手动补上 */
const mountSection = () => mount(MyMusicListGroup, {
  global: {
    plugins: [i18nPlugin],
    components: {
      'common-setting-help-icon': SettingHelpIcon,
      'base-checkbox': BaseCheckbox,
      'base-selection': BaseSelection,
    },
    stubs: {
      'base-input': true,
      'svg-icon': true,
    },
  },
})

// `stubs` 收窄成 @vue/test-utils 的 Stubs 类型：`src/renderer/**` 下的测试文件会被构建期
// ts-loader 一起做类型检查，`Record<string, unknown>` 会以 TS2322 让 `npm run build` 失败
// （同 pitfalls 坑 16）。这里只传组件桩或 true，断言与用例覆盖不受影响。
const mountModal = (stubs: Record<string, any> = { 'material-modal': materialModalStub }) => mount(SettingHelpModal, {
  global: {
    plugins: [i18nPlugin],
    components: { 'base-btn': BaseBtn, 'material-modal': Modal },
    stubs: stubs as any,
  },
})

/** 按无障碍名找某个 `?`：这一节里有好几个键，`find('button')` 只能拿到第一个 */
const helpIcon = (wrapper: ReturnType<typeof mountSection>, tipKey: keyof typeof zhCn) =>
  wrapper.findAll('button').find(btn => btn.attributes('aria-label') === t(tipKey))!

describe('设置页 `?` → 帮助弹窗', () => {
  // 状态是模块级的（这就是「只开一个」的实现），用例之间必须清干净
  beforeEach(() => {
    closeSettingHelp()
  })

  it('`?` 变成按钮，`title` 与 `aria-label` 都还在（AGENTS §2.5.1）', () => {
    const section = mountSection()
    const btn = helpIcon(section, 'setting__list_page_size_tip')

    expect(btn, '没渲染出「列表每页条数」的 `?`').toBeTruthy()
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.attributes('title')).toBe(t('setting__list_page_size_tip'))
    expect(btn.attributes('aria-label')).toBe(t('setting__list_page_size_tip'))
    // 图标本体还在（只是成了按钮里的装饰图标，无障碍名由按钮提供）
    expect(btn.find('svg-icon-stub').exists()).toBe(true)
  })

  it('点 `?` → 弹窗正文 = 该项帮助文案、标题 = 设置项名；点「关闭」收起', async() => {
    const section = mountSection()
    const modal = mountModal()
    expect(modal.text(), '弹窗没点开就渲染出内容了').not.toContain(t('setting__list_page_size_tip'))

    await helpIcon(section, 'setting__list_page_size_tip').trigger('click')
    await nextTick()

    expect(modal.text()).toContain(t('setting__list_page_size_tip'))
    // 标题取该项的设置项名（不是「帮助」这个兜底）
    expect(modal.text()).toContain(t('setting__list_page_size'))
    expect(modal.text()).not.toContain(t('setting__help_title'))

    const closeBtn = modal.findAll('button').find(btn => btn.text() === t('btn_close'))!
    expect(closeBtn, '弹窗底部没有「关闭」键').toBeTruthy()
    await closeBtn.trigger('click')
    await nextTick()

    expect(modal.text()).not.toContain(t('setting__list_page_size_tip'))
  })

  it('同一时刻只开一个：点第二个 `?` 换的是内容，不是叠一层', async() => {
    const section = mountSection()
    const modal = mountModal()

    await helpIcon(section, 'setting__list_page_size_tip').trigger('click')
    await nextTick()
    expect(modal.text()).toContain(t('setting__list_page_size_tip'))

    await helpIcon(section, 'setting__list_source_tip').trigger('click')
    await nextTick()

    expect(modal.text()).toContain(t('setting__list_source_tip'))
    // 弹窗只有一份：第一条文案必须已经不在里面了
    expect(modal.text()).not.toContain(t('setting__list_page_size_tip'))
    expect(modal.findAll('.modal').length).toBe(1)
  })

  it('`Esc` 关得掉（`material-modal` 自己没有键盘能力，这一条由弹窗自己实现）', async() => {
    const section = mountSection()
    const modal = mountModal()

    await helpIcon(section, 'setting__list_page_size_tip').trigger('click')
    await nextTick()
    expect(modal.text()).toContain(t('setting__list_page_size_tip'))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(modal.text()).not.toContain(t('setting__list_page_size_tip'))
  })

  it('调用点没给设置项名时，标题退到「帮助」', async() => {
    const modal = mountModal()
    openSettingHelp('只有正文，没有标题')
    await nextTick()

    expect(modal.text()).toContain('只有正文，没有标题')
    expect(modal.text()).toContain(t('setting__help_title'))
  })
})

describe('帮助弹窗走真 `material-modal`（teleport 到 `#view`）', () => {
  beforeEach(() => {
    closeSettingHelp()
    document.getElementById('view')?.remove()
  })

  it('真件把内容渲染进 `#view`（只有替身能断内容时，测不出 teleport 目标写没写对）', async() => {
    // teleport 目标在**挂载时**解析，锚点必须先存在（jsdom 里没有真实的应用骨架）
    const view = document.createElement('div')
    view.id = 'view'
    document.body.appendChild(view)

    const section = mountSection()
    const modal = mountModal({})
    await helpIcon(section, 'setting__list_page_size_tip').trigger('click')
    await nextTick()
    await nextTick()

    expect(view.textContent).toContain(t('setting__list_page_size_tip'))

    modal.unmount()
    view.remove()
  })
})
