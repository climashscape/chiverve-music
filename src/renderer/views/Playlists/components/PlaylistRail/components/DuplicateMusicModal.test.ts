import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import DuplicateMusicModal from './DuplicateMusicModal.vue'

/**
 * 重复歌曲弹窗里两个**图标键**的无障碍名（2026-09-26 复核的缺陷 12）。
 *
 * 试听 / 移除两颗只有图形没有文字，原来既无 `aria-label` 也无 `title`——读屏器只报「按钮」。
 * 按 §2.5.1 规则 11 补上（取既有文案 `player__play` / `list__remove`），这里逐键断言
 * 「两个属性都非空且相等」：只补一个、或两处文案漂了都会红。
 */
const mocks = vi.hoisted(() => ({ filterDuplicateMusic: vi.fn() }))

// `handleFilterList` 先向列表 store 要整份歌单（真件走 IPC，测试环境没人应答）；
// 只换这两个读/写接口，其余导出保持真的（这条导入链上的模块会静态引用它们）
vi.mock('@renderer/store/list/action', async(importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  getListMusics: vi.fn().mockResolvedValue([]),
  removeListMusics: vi.fn().mockResolvedValue(undefined),
}))

const txSong = {
  id: 'tx_1',
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id: '1', albumName: '', songType: 0 },
} as any

/** `material-modal` 替身：真件 teleport 到 `#view`，jsdom 里没有那个锚点；这里只关心 slot 里的按钮 */
const MaterialModalStub = defineComponent({
  props: { show: { type: Boolean, default: false } },
  template: '<div><slot /></div>',
})

/** `base-virtualized-list` 替身：照插槽契约逐行渲染（真件的虚拟滚动与几何无关本用例） */
const VirtualizedListStub = defineComponent({
  props: {
    list: { type: Array, default: () => [] },
    itemHeight: { type: Number, default: 40 },
    keyName: { type: String, default: 'id' },
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'v-list' }, (props.list as any[]).map((item: any, index: number) =>
      h('div', { key: index }, slots.default?.({ item, index }))))
  },
})

afterEach(() => {
  mocks.filterDuplicateMusic.mockReset()
})

describe('DuplicateMusicModal：行内图标键的 aria-label', () => {
  it('试听 / 移除两颗键都有同一份文案的 aria-label 与 title', async() => {
    window.lx.worker.main = {
      filterDuplicateMusic: mocks.filterDuplicateMusic.mockResolvedValue([{ index: 0, musicInfo: txSong }]),
    } as any

    const wrapper = mount(DuplicateMusicModal, {
      props: { visible: false, listInfo: { id: 'user_1', name: '测试列表' } },
      global: {
        plugins: [i18nPlugin],
        stubs: {
          'material-modal': MaterialModalStub,
          'base-virtualized-list': VirtualizedListStub,
        },
      },
    })
    // 弹窗常挂、靠 `visible` 开关：`watch` 没有 immediate，必须走一次 false → true
    await wrapper.setProps({ visible: true })
    await flushPromises()

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    const bad = buttons
      .map((node, index) => ({
        index,
        ariaLabel: node.attributes('aria-label') ?? '',
        title: node.attributes('title') ?? '',
      }))
      .filter(item => !item.ariaLabel.trim() || item.ariaLabel !== item.title)

    expect(bad).toEqual([])
    wrapper.unmount()
  })
})
