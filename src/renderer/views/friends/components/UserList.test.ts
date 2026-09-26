import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UserList from './UserList.vue'
import type { UserListState } from '../useUserList'

/**
 * 用户列表的四种状态渲染（dom project）。
 *
 * `useUserList` 的状态落点已经单测过（`../useUserList.test.ts`），这里只钉**界面上看到什么**：
 * 未登录给引导与登录按钮、空态不显示成「加载中」、关注态三种文案、有更多时才有按钮。
 *
 * 全局组件（`base-btn`）在测试里没有注册（`components/index.js` 的 require.context 不跑），
 * 所以用**真渲染 slot 的轻量替身**（`stubs: true` 的桩默认不渲染插槽，文案会取不到）；
 * `$t` 用 key 原样返回的桩（同 `test/setup/dom.ts` 的口径）。
 */
const state = (patch: Partial<UserListState> = {}): UserListState => ({
  list: [],
  total: null,
  page: 1,
  hasMore: false,
  noItemLabel: '',
  isLoading: false,
  needLogin: false,
  ...patch,
})

const user = (patch = {}) => ({
  id: 'u1',
  name: '昵称',
  img: 'https://pic6.y.qq.com/a.jpg',
  desc: '',
  fans: 0,
  isFollow: false,
  isFollowed: false,
  source: 'tx' as LX.OnlineSource,
  ...patch,
})

const mountList = (props: { state: UserListState, totalText?: string }) => mount(UserList, {
  props,
  global: {
    components: { 'base-btn': { name: 'BaseBtn', template: '<button><slot /></button>' } },
    mocks: { $t: (key: string) => key },
  },
})

describe('friends 的 UserList：四种状态', () => {
  it('未登录：显示「请先登录」+ 登录按钮（不是「加载失败」），点按钮发 login', async() => {
    const wrapper = mountList({ state: state({ needLogin: true, noItemLabel: 'list__load_failed' }) })

    expect(wrapper.text()).toContain('user_center__need_login')
    expect(wrapper.text()).not.toContain('list__load_failed')
    const btn = wrapper.find('button')
    expect(btn.text()).toBe('qq_auth__login')

    await btn.trigger('click')
    expect(wrapper.emitted('login')).toBeTruthy()
  })

  it('空列表且没有文案：落 `no_item`（不是空白，也不是「加载中」）', () => {
    expect(mountList({ state: state() }).text()).toContain('no_item')
  })

  it('加载中：显示 loading 文案而不是空态', () => {
    const wrapper = mountList({ state: state({ noItemLabel: 'list__loading' }) })

    expect(wrapper.text()).toContain('list__loading')
    expect(wrapper.text()).not.toContain('no_item')
  })

  it('有数据：渲染每一行，并按关注态出「互相关注 / 已关注 / 关注了你」', () => {
    const wrapper = mountList({
      state: state({
        list: [
          user({ id: 'a', isFollow: true, isFollowed: true }),
          user({ id: 'b', isFollow: true }),
          user({ id: 'c', isFollowed: true }),
          user({ id: 'd' }),
        ],
      }),
    })

    expect(wrapper.findAll('li')).toHaveLength(4)
    expect(wrapper.text()).toContain('friends__mutual')
    expect(wrapper.text()).toContain('friends__followed')
    expect(wrapper.text()).toContain('friends__follows_you')
  })

  it('总数行：给 totalText 才渲染（好友那口是空串）', () => {
    expect(mountList({ state: state({ list: [user()] }), totalText: 'friends__total' }).text())
      .toContain('friends__total')
    expect(mountList({ state: state({ list: [user()] }) }).text()).not.toContain('friends__total')
  })

  it('加载更多：只有 hasMore 才出按钮，点了发 loadMore', async() => {
    expect(mountList({ state: state({ list: [user()] }) }).find('button').exists()).toBe(false)

    const more = mountList({ state: state({ list: [user()], hasMore: true }) })
    const btn = more.find('button')
    expect(btn.text()).toBe('user_center__load_more')

    await btn.trigger('click')
    expect(more.emitted('loadMore')).toBeTruthy()
  })
})
