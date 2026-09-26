import { mount } from '@vue/test-utils'
import { nextTick } from '@common/utils/vueTools'
import { describe, expect, it, vi } from 'vitest'
import Page from './index.vue'

/**
 * `/friends` 页壳：Tab 与 `route.query.tab` 的双向同步（dom project）。
 *
 * 三个面板都换成文字探针（它们各自会发请求，本用例只关心「哪一块被挂载」）：
 * 断言 `wrapper.text()` 里出现的探针文字，就等于断言了 `v-if` 的分支。
 *
 * 钉住的是产品口径：**默认 tab 是 follow**（`?tab=follow|fans|friend`，缺省/非法值都落 follow），
 * 切 tab 写回 query，从别处带 query 进来能直接落在对应那一块。
 */
const mocks = vi.hoisted(() => {
  const route: { path: string, query: Record<string, unknown> } = { path: '/friends', query: {} }
  return { replace: vi.fn(), route }
})

vi.mock('@common/utils/vueRouter', async() => {
  // 裸对象改属性不触发 watch（没走代理的 set 陷阱），所以换成响应式代理再交出去
  const { reactive } = await import('vue')
  mocks.route = reactive(mocks.route)
  return {
    useRoute: () => mocks.route,
    useRouter: () => ({ push: vi.fn(), replace: mocks.replace, back: vi.fn() }),
  }
})

vi.mock('./components/FollowPanel.vue', () => ({ default: { template: '<div>panel-follow</div>' } }))
vi.mock('./components/FansPanel.vue', () => ({ default: { template: '<div>panel-fans</div>' } }))
vi.mock('./components/FriendPanel.vue', () => ({ default: { template: '<div>panel-friend</div>' } }))

const mountPage = (tab?: string) => {
  mocks.route.query = tab == null ? {} : { tab }
  return mount(Page, {
    global: {
      stubs: { 'base-tab': true },
      mocks: { $t: (key: string) => key },
    },
  })
}

describe('friends 的页壳：Tab 与 query', () => {
  it('没有 query 时默认 follow（我关注的人）', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('panel-follow')
    expect(wrapper.text()).not.toContain('panel-fans')
    expect(wrapper.text()).not.toContain('panel-friend')
  })

  it('query 指定哪个就挂哪块（三个 tab 都认）', () => {
    expect(mountPage('fans').text()).toContain('panel-fans')
    expect(mountPage('friend').text()).toContain('panel-friend')
  })

  it('非法 / 空 tab 落回 follow（不做空白页）', () => {
    expect(mountPage('nope').text()).toContain('panel-follow')
    expect(mountPage('').text()).toContain('panel-follow')
  })

  it('切 tab 只写 query.tab（其余参数不带）', () => {
    const wrapper = mountPage()

    wrapper.vm.handleTabChange('fans')

    expect(mocks.replace).toHaveBeenCalledWith({ path: '/friends', query: { tab: 'fans' } })
  })

  it('外部改 query（深链 / 返回）时跟着切，不必重建页面', async() => {
    const wrapper = mountPage('follow')

    mocks.route.query.tab = 'friend'
    await nextTick()

    expect(wrapper.text()).toContain('panel-friend')
    expect(wrapper.text()).not.toContain('panel-follow')
  })
})
