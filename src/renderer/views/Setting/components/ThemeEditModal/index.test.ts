import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { i18nPlugin } from '@renderer/plugins/i18n'
import zhCn from '@root/lang/zh-cn.json'
import ThemeEditModal from './index.vue'

/**
 * 主题编辑弹窗里「移除背景图片」那颗图标键的无障碍名（2026-09-26 复核的缺陷 12）。
 *
 * 它只有图形没有文字，原来既无 `aria-label` 也无 `title`：读屏器只报「按钮」，
 * 而这一颗是删除动作（叠在背景图缩略图右上角），不说明就是误触风险。
 * 文案复用既有的 `theme_edit_modal__bg_image_remove`（不改新词），这里断言
 * `aria-label` 与 `title` 同值非空——两处漂了或只补一个都会红。
 *
 * 重件都替身掉：取色器（Pickr）、主题读写、主题数据路径——本用例只关心那颗按钮的标记。
 */
vi.mock('@renderer/utils/pickrTools', () => ({
  pickrTools: { create: vi.fn(() => ({ destroy: vi.fn() })) },
}))
vi.mock('@renderer/store/utils', () => ({
  getThemes: (cb: (data: { themes: unknown[], userThemes: unknown[] }) => void) => { cb({ themes: [], userThemes: [] }) },
  applyTheme: vi.fn(),
  buildThemeColors: vi.fn(),
  copyTheme: (theme: unknown) => theme,
}))
vi.mock('@renderer/store', () => ({
  themeInfo: { dataPath: '/tmp/chiverve-themes' },
}))
vi.mock('@renderer/utils/ipc', () => ({
  removeTheme: vi.fn(),
  saveTheme: vi.fn(),
  showSelectDialog: vi.fn(),
}))
vi.mock('@renderer/plugins/Dialog', () => ({
  dialog: Object.assign(vi.fn(), { confirm: vi.fn().mockResolvedValue(false) }),
}))

/** `material-modal` 替身：真件 teleport 到 `#view`，jsdom 里没有那个锚点；这里无条件渲染 slot */
const MaterialModalStub = {
  props: { show: { type: Boolean, default: false } },
  template: '<div><slot /></div>',
}

describe('ThemeEditModal：移除背景图那颗图标键', () => {
  it('aria-label 与 title 同值非空（读屏器与悬停都有说明）', async() => {
    const wrapper = mount(ThemeEditModal, {
      props: { modelValue: false, themeId: '' },
      global: {
        plugins: [i18nPlugin],
        stubs: {
          'material-modal': MaterialModalStub,
          'base-input': true,
          'base-checkbox': true,
          'base-btn': true,
          'svg-icon': true,
        },
      },
    })
    await flushPromises()

    const removeBtn = wrapper.get('button[class*="removeBtn"]')
    expect(removeBtn.attributes('aria-label')).toBe(zhCn.theme_edit_modal__bg_image_remove)
    expect(removeBtn.attributes('title')).toBe(zhCn.theme_edit_modal__bg_image_remove)
    wrapper.unmount()
  })
})
