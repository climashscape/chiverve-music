import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from '@common/utils/vueTools'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { listDetailInfo } from '@renderer/store/songList/state'
import Btn from '@renderer/components/base/Btn.vue'
import ToolbarActions from '@renderer/components/common/ToolbarActions.vue'
import Page from './index.vue'

/**
 * 歌单详情页「四个动作键搬到顶部工具栏」（工单 03 的机制 + 本票的搬迁）的渲染回归。
 *
 * 钉住三件事（都是行为，不是实现细节）：
 *   1. 四个键真的落在 `#toolbar-actions` 里、页头不留按键列（页头只剩「封面 + 信息」两个子项）；
 *   2. 禁用条件仍绑在 `listDetailInfo.noItemLabel` 上（搬位置不改行为）；
 *   3. 「播放」键的 title 带歌单名——这是它上移后唯一的语境（见 index.vue 里 playTip 的注释）。
 *
 * 真实场景里 `#toolbar-actions` 由 Toolbar 渲染且在页面之前挂载，这里用同 id 的宿主元素顶替
 * （与 components/common/ToolbarActions.test.ts 同一口径）。取数链路全部 mock，
 * 只留本页自己的模板与 setup 真跑。
 */

const mocks = vi.hoisted(() => ({
  getAndSetListDetail: vi.fn(),
  getListDetail: vi.fn(),
  getListDetailAll: vi.fn(),
  playSongListDetail: vi.fn(),
  addSongListDetail: vi.fn(),
  loadFavSonglistIds: vi.fn(),
  setPlaylistFav: vi.fn(),
  getQQCredential: vi.fn(),
  dialog: vi.fn(),
  // 路由只作桩：本测试不起真路由，页面里 useRouter 的用法只有回退跳转与返回
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn() },
}))

vi.mock('@common/utils/vueRouter', () => ({ useRouter: () => mocks.router }))

vi.mock('@renderer/store/songList/action', () => ({
  getAndSetListDetail: mocks.getAndSetListDetail,
  getListDetail: mocks.getListDetail,
  getListDetailAll: mocks.getListDetailAll,
}))
vi.mock('./action', () => ({
  playSongListDetail: mocks.playSongListDetail,
  addSongListDetail: mocks.addSongListDetail,
}))
vi.mock('@renderer/store/user/action', () => ({
  loadFavSonglistIds: mocks.loadFavSonglistIds,
  setPlaylistFav: mocks.setPlaylistFav,
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential: mocks.getQQCredential }))
vi.mock('@renderer/plugins/Dialog', () => ({ dialog: mocks.dialog }))

// 「加载更多」那一块与本票无关：一个空壳，且要带 scrollToTop（useList 取数后会调用它）
const OnlineListStub = { template: '<div class="online-list-stub" />', methods: { scrollToTop() {} } }

const mountPage = () => mount(Page, {
  global: {
    plugins: [i18nPlugin],
    // 这三个组件在应用里由 `components/index.js` 全局注册（`common-toolbar-actions` 就是
    // `components/common/ToolbarActions.vue` 的路径名），测试里显式注册，别让模板静默退回原生标签
    components: {
      BaseBtn: Btn,
      CommonToolbarActions: ToolbarActions,
      MaterialOnlineList: OnlineListStub,
    },
    // 模板上的 `:list-id` 读 $route.query.id；本测试不起真路由，只补这一个全局属性
    mocks: { $route: { query: { id: '7712' } } },
  },
})

const toolbarButtons = (target: HTMLElement) => [...target.querySelectorAll('button')]

describe('views/songList/Detail/index.vue 的动作键上移', () => {
  let target: HTMLElement

  beforeEach(() => {
    target = document.createElement('div')
    target.id = 'toolbar-actions'
    document.body.appendChild(target)
    // 取数链路全部是 Promise：桩必须给 resolve，否则页面里的 .then / .catch 会被 undefined 顶炸
    mocks.getAndSetListDetail.mockResolvedValue(undefined)
    mocks.getListDetail.mockResolvedValue({ list: [] })
    mocks.getListDetailAll.mockResolvedValue([])
    mocks.loadFavSonglistIds.mockResolvedValue(undefined)
    mocks.setPlaylistFav.mockResolvedValue(undefined)
    mocks.getQQCredential.mockResolvedValue(null)
    Object.assign(listDetailInfo, {
      id: '7712',
      source: 'tx',
      list: [],
      noItemLabel: '',
      info: { name: '每日推荐' },
    })
  })
  afterEach(() => {
    target.remove()
    vi.clearAllMocks()
  })

  it('四个键落在 #toolbar-actions 里，页头不再有按键列', () => {
    const wrapper = mountPage()

    const buttons = toolbarButtons(target)
    expect(buttons.map(b => b.textContent)).toEqual(['播放', '收藏到我的歌单', '收藏到 QQ', '返回'])
    // 页内不留一份：本页 DOM 子树里一个按钮都没有
    expect(wrapper.element.querySelector('button')).toBeNull()
    // 页头只剩「封面 + 信息」两个子项（原 .songListHeaderRight 已删，键不再占页头右半边）
    const header = wrapper.element.querySelector('[class*="songListHeader"]')
    expect(header?.children).toHaveLength(2)

    wrapper.unmount()
  })

  it('禁用条件仍跟着 noItemLabel，返回键始终可点', async() => {
    const wrapper = mountPage()

    expect(toolbarButtons(target).map(b => b.disabled)).toEqual([false, false, false, false])

    listDetailInfo.noItemLabel = '歌单不存在'
    await nextTick()
    expect(toolbarButtons(target).map(b => b.disabled)).toEqual([true, true, true, false])

    wrapper.unmount()
  })

  it('播放键的 title 带歌单名（名字还没取到时退回「播放」）', async() => {
    const wrapper = mountPage()

    expect(toolbarButtons(target)[0].title).toBe('播放 · 每日推荐')

    listDetailInfo.info.name = ''
    await nextTick()
    expect(toolbarButtons(target)[0].title).toBe('播放')

    wrapper.unmount()
  })

  it('点播放键仍然作用于当前歌单（id / source / 已加载的分页列表）', async() => {
    const list = [{ id: 'a1' }] as any
    listDetailInfo.list = list
    const wrapper = mountPage()

    toolbarButtons(target)[0].click()
    await nextTick()
    expect(mocks.playSongListDetail).toHaveBeenCalledWith('7712', 'tx', list)

    wrapper.unmount()
  })

  it('键随页面卸载一起撤走（切路由后动作区清空）', () => {
    const wrapper = mountPage()
    expect(toolbarButtons(target)).toHaveLength(4)

    wrapper.unmount()
    expect(toolbarButtons(target)).toHaveLength(0)
  })
})
