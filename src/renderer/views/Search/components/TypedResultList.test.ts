import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchText } from '@renderer/store/search/state'
import { listInfos } from '@renderer/store/search/typed/state'
import Component from './TypedResultList.vue'

/**
 * 歌手 / 专辑 / MV 三类搜索结果**失败**时的收口（票 03b）。
 *
 * 三类与歌曲共用同一个端点（`musicSearch.musicSearch`，只是换 `search_type`），所以
 * 「搜索打不通」这条路径上它们同样会把 rejection 冒到顶层——dev 下即 webpack-dev-server 的
 * 全屏浮层（`position:fixed; inset:0`），它会吞掉真实鼠标输入。
 *
 * 这里钉住失败后的两个行为：`listInfo.noItemLabel` 是可读提示（模板用 v-if 渲染它），
 * 且顶层收不到 unhandled rejection。取数链路全真跑，只桩掉最外层 SDK 与路由 / MV 播放弹窗。
 */

const { searchSinger } = vi.hoisted(() => ({ searchSinger: vi.fn() }))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    sources: [{ id: 'tx', name: 'QQ音乐' }],
    tx: { musicSearch: { searchSinger } },
  },
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRoute: () => ({ path: '/search', query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
// MV 播放弹窗是模块级单例（`store/mv`）：本用例只关心失败提示，桩掉它避免连带初始化
vi.mock('@renderer/store/mv', () => ({
  player: { show: false },
  openMv: vi.fn(),
  closePlayer: vi.fn(),
  retryUrl: vi.fn(),
}))

const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

/** 等两轮宏任务：组件 setup 里的 `setTimeout(runSearch)` → store 的 `.catch` → 视图的收口 */
const settle = async() => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

const mountPanel = () => mount(Component, {
  props: { type: 'singer', page: 1, sourceId: 'tx' },
  global: {
    stubs: { MvPlayerModal: true, 'material-pagination': true },
    // 模板里的 `$t`（歌手卡片的分隔文案等）由应用全局注入，单测里补一个最小实现
    mocks: { $t: (key: string, params?: Record<string, unknown>) => window.i18n.t(key as any, params as any) },
  },
})

/** 失败提示只认这个 i18n 键；取值跟着当前环境（dom setup 的桩或真 i18n）走，别写死文案 */
const loadFailedText = () => window.i18n.t('list__load_failed' as any)

describe('views/Search/components/TypedResultList 的搜索失败收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchText.value = '周杰伦'
    for (const type of ['singer', 'album', 'mv'] as const) {
      Object.assign(listInfos[type], { list: [], total: 0, page: 1, maxPage: 1, key: null, noItemLabel: '' })
    }
  })

  it('搜索失败 → 提示「加载失败」，且没有未处理的 rejection', async() => {
    searchSinger.mockRejectedValue(new Error('搜索失败'))
    const unhandled = trackUnhandledRejection()

    const wrapper = mountPanel()
    await settle()
    unhandled.stop()

    expect(listInfos.singer.noItemLabel).toBe(loadFailedText())
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })

  it('正常搜索不回归：条目写回 listInfo、提示清空、无多余 rejection', async() => {
    searchSinger.mockResolvedValue({ list: [{ id: 'mid1', name: '歌手a', img: '' }], total: 1, allPage: 1, limit: 30, source: 'tx' })
    const unhandled = trackUnhandledRejection()

    const wrapper = mountPanel()
    await settle()
    unhandled.stop()

    expect(listInfos.singer.list).toHaveLength(1)
    expect(listInfos.singer.noItemLabel).toBe('')
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })
})
