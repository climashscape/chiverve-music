import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Page from './index.vue'

/**
 * 歌手页的**关注态标记**（只读，票 02/03 的读侧那一半）—— dom project。
 *
 * 数据层那头的判据与缓存边界已经由 `tx/singer.test.ts` 钉住（node），这里只钉**界面上看到什么**：
 *
 *   1. `true`  → 显示「已关注」（拿 i18n key 断言，`$t` 桩原样返回 key）
 *   2. `false` → 显示「未关注」
 *   3. `null`  → **标记整块不渲染**，尤其**不许渲染成「未关注」**：把「取不到」（未登录 /
 *      请求失败）画成「未关注」是在撒谎。这一条是本票最容易回归的地方。
 *   4. 本票只做只读标记：它是 `span`，不是按钮（两态键属写侧票 03）。
 *
 * `useSinger` 整个换成状态注入桩：真实现会打接口（页头信息 + 关注列表），本用例只关心渲染映射；
 * `followLabel` 的映射本身在 `index.vue` 里（被测对象），不会被这层桩替掉。
 */
const mocks = vi.hoisted(() => {
  const route: { path: string, query: Record<string, unknown> } = { path: '/singer', query: { mid: 'm1', tab: 'songs' } }
  return { route, followState: { value: null as boolean | null } }
})

vi.mock('@common/utils/vueRouter', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('./useSinger', async() => {
  const { reactive, ref } = await import('vue')
  mocks.followState = ref<boolean | null>(null)
  return {
    default: () => ({
      detail: reactive({
        id: 'm1',
        mid: 'm1',
        name: '测试歌手',
        avatar: '',
        desc: '',
        musicCount: 128,
        albumCount: 9,
      }),
      headerLabel: ref(''),
      isInfoLoading: ref(false),
      followState: mocks.followState,
      mvPlayer: reactive({ show: false }),
      initSingerInfo: vi.fn(),
      closeMv: vi.fn(),
      retryMvUrl: vi.fn(),
    }),
  }
})

// 四个面板与 MV 弹窗各自会取数 / 引重组件，这里只验页头，全部换成文字探针
vi.mock('./components/SongsPanel.vue', () => ({ default: { template: '<div>panel-songs</div>' } }))
vi.mock('./components/AlbumsPanel.vue', () => ({ default: { template: '<div>panel-albums</div>' } }))
vi.mock('./components/MvsPanel.vue', () => ({ default: { template: '<div>panel-mv</div>' } }))
vi.mock('./components/SimilarPanel.vue', () => ({ default: { template: '<div>panel-similar</div>' } }))
vi.mock('@renderer/components/common/MvPlayerModal.vue', () => ({ default: { template: '<div>mv-modal</div>' } }))

const mountPage = (followState: boolean | null) => {
  mocks.followState.value = followState
  return mount(Page, {
    global: {
      stubs: { 'base-tab': true, 'base-btn': { template: '<button><slot /></button>' }, 'common-toolbar-actions': true },
      mocks: { $t: (key: string) => key },
    },
  })
}

describe('歌手页的关注态标记（只读）', () => {
  it('已关注：显示「已关注」，且不是「未关注」', () => {
    const text = mountPage(true).text()

    expect(text).toContain('singer__followed')
    expect(text).not.toContain('singer__not_followed')
  })

  it('未关注：显示「未关注」', () => {
    const text = mountPage(false).text()

    expect(text).toContain('singer__not_followed')
    expect(text).not.toContain('singer__followed')
  })

  it('取不到（null）：标记整块不渲染，**不许画成「未关注」**（页头其它信息照常）', () => {
    const wrapper = mountPage(null)
    const text = wrapper.text()

    expect(text).not.toContain('singer__not_followed')
    expect(text).not.toContain('singer__followed')
    // 标记缺席不等于页头坏了：歌曲数 / 专辑数还在
    expect(text).toContain('singer__songs')
    expect(text).toContain('singer__albums')
    expect(wrapper.findAll('span').some(node => node.text().includes('singer__follow'))).toBe(false)
  })

  it('只读：标记是 span，不是按钮（两态键属写侧票 03）', () => {
    const wrapper = mountPage(true)
    const labels = wrapper.findAll('button').map(node => node.text())

    expect(labels).not.toContain('singer__followed')
  })
})
