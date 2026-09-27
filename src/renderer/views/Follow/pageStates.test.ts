import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Page from './index.vue'
import { followFeedState } from '@renderer/store/followFeed/state'
import { loadFollowFeed } from '@renderer/store/followFeed/action'
import type * as FollowFeedAction from '@renderer/store/followFeed/action'

/**
 * 「关注动态」页的**状态、顶部状态行、刷新与「页面开着时新条目到达」**（工单 03，dom project）。
 *
 * 用例挂在真的 store 动作上（只把 IPC 换掉）：`openFollowFeed()` 是「进页面」那一半的实现，
 * 页面的三种状态都建立在它读回来的东西上——只桩 `useFollowFeed` 就测不到「进页即置已读」
 * 和「freshIds 在置已读之前记下」这两条顺序约束。
 *
 * 钉：
 *   1. **未登录** → 登录引导（既有两条 key：`user_center__need_login` + `qq_auth__login`），
 *      不是空列表也不是报错；点按钮开的是全局登录弹窗；
 *   2. **已登录但无条目** → 「已开始监控 N 位歌手…」，N 来自 store 的 monitoredCount；
 *   3. **有条目** → 单页时间线，新歌行（歌名 + 歌手 + 发布时间）与 新专行（专辑名 + 歌手 +
 *      曲目数 + 发布日期）各自渲染；`freshIds`（进页时还是未读的那几条）带标记，其余不带；
 *   4. 顶部状态行：从未检查 / 上次检查时间 / 失败原因 / 检查中的 loading 态；
 *   5. 手动刷新 → `refreshFollowFeed()`（检测逻辑不在页面里）；
 *   6. **页面开着时一轮检查插进新条目** → 立刻标已读、并把它们算进 freshIds。
 *
 * `$t` 是桩（键名即文案，形如 `key({"count":3})`）：文案措辞不在这里钉（那是 `lang.test.ts`
 * 的对账与人的事），这里只钉「用了哪个 key、参数有没有传对」。
 * ⚠️ 例外：`dateFormat2` 走的是**真 i18n**（时间线会 import `@renderer/plugins/i18n`，它把
 * `window.i18n` 换成真件），所以那一条断言取 `window.i18n.t(...)`。
 */
const $t = (key: string, params?: Record<string, unknown>) =>
  params == null ? key : `${key}(${JSON.stringify(params)})`

const mocks = vi.hoisted(() => ({
  getQQCredential: vi.fn(),
  getFollowFeedItems: vi.fn(),
  getFollowFeedUnreadCount: vi.fn(),
  getFollowFeedSummary: vi.fn(),
  markFollowFeedAllRead: vi.fn(),
  openLoginModal: vi.fn(),
  refreshFollowFeed: vi.fn(),
}))

vi.mock('@renderer/utils/ipc', () => ({
  getQQCredential: mocks.getQQCredential,
  getFollowFeedItems: mocks.getFollowFeedItems,
  getFollowFeedUnreadCount: mocks.getFollowFeedUnreadCount,
  getFollowFeedSummary: mocks.getFollowFeedSummary,
  markFollowFeedAllRead: mocks.markFollowFeedAllRead,
}))
// 只换掉 `refreshFollowFeed`（真实现会跑一整轮检测：打接口 + 写库）；其余store 动作要真的跑
vi.mock('@renderer/store/followFeed/action', async(importOriginal) => ({
  ...await importOriginal<typeof FollowFeedAction>(),
  refreshFollowFeed: mocks.refreshFollowFeed,
}))
// 时间线一挂载就会 `useRouter()`（行上的跳转），本文件不管跳转——桩掉，
// 免得每个用例刷一屏 `injection "Symbol(router)" not found`（同 OnlineList 的用例）
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useRoute: () => ({ path: '/follow', query: {} }),
}))

// 挂在共享 store 上的 watcher 不会随用例结束自己消失：不卸载就会让后一个用例里的
// 「未读数变化 → markSeen」被前几个用例留下的组件各触发一次（实测：断言 1 次、收到 5 次）
enableAutoUnmount(afterEach)
// 登录引导只借这个动作开弹窗：真实现会拉二维码 / 起轮询，不是本票要测的东西
vi.mock('@renderer/store/qqAuth/action', () => ({
  openLoginModal: mocks.openLoginModal,
}))

/** 一条条目；两种行只差几个字段（形状见 `common/types/follow_feed.d.ts`） */
const item = (over: Partial<LX.FollowFeed.Item>): LX.FollowFeed.Item => ({
  id: 1,
  kind: 'song',
  singerMid: 'mid-a',
  singerName: '歌手甲',
  itemId: 'tx_song_1',
  name: '新歌一',
  albumMid: null,
  albumName: null,
  trackCount: null,
  publishTime: '2026-09-20',
  foundAt: 1758300000000,
  read: 1,
  music: null,
  ...over,
})

const mountPage = () => mount(Page, {
  global: {
    stubs: {
      // `base-btn` 在真应用里由 require.context 全局注册，测试里给个能点的替身
      'base-btn': { template: '<button><slot /></button>' },
      // 弹窗与行菜单：本文件的用例不开它们（行交互在 `timeline.test.ts` 里测）
      'base-menu': true,
      'common-list-add-modal': true,
      'common-download-modal': true,
    },
    mocks: { $t },
  },
})

/** 一起把库那份现状摆好（`openFollowFeed` 会并发读这三个通道） */
const setDb = (opts: {
  items?: LX.FollowFeed.Item[]
  unread?: number
  monitored?: number
  lastSuccessAt?: number | null
}) => {
  mocks.getFollowFeedItems.mockResolvedValue(opts.items ?? [])
  mocks.getFollowFeedUnreadCount.mockResolvedValue(opts.unread ?? 0)
  mocks.getFollowFeedSummary.mockResolvedValue({
    monitoredCount: opts.monitored ?? 0,
    lastSuccessAt: opts.lastSuccessAt ?? null,
  })
}

const buttonByText = (wrapper: ReturnType<typeof mountPage>, text: string) =>
  wrapper.findAll('button').find(button => button.text() === text)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getQQCredential.mockResolvedValue({ encryptUin: 'euin-1' })
  mocks.markFollowFeedAllRead.mockResolvedValue(undefined)
  mocks.refreshFollowFeed.mockResolvedValue(undefined)
  setDb({})
  Object.assign(followFeedState, {
    items: [],
    unreadCount: 0,
    monitoredCount: 0,
    lastSuccessAt: null,
    lastError: null,
    isChecking: false,
    freshIds: [],
  })
})

describe('关注动态：三种页面状态', () => {
  it('未登录：画登录引导（不是空列表、也不是报错），按钮开全局登录弹窗', async() => {
    mocks.getQQCredential.mockResolvedValue(null)
    setDb({ monitored: 12 })

    const wrapper = mountPage()
    await flushPromises()
    const text = wrapper.text()

    expect(text).toContain('user_center__need_login')
    expect(text).toContain('qq_auth__login')
    // 未登录不是「已开始监控」：那句会说谎（没有凭证根本取不到关注列表）
    expect(text).not.toContain('follow__empty')

    await buttonByText(wrapper, 'qq_auth__login')!.trigger('click')
    expect(mocks.openLoginModal).toHaveBeenCalledTimes(1)
  })

  it('已登录但还没有条目：空态报出监控中的歌手数', async() => {
    setDb({ items: [], unread: 0, monitored: 12 })

    const wrapper = mountPage()
    await flushPromises()
    const text = wrapper.text()

    expect(text).toContain('follow__empty({"count":12})')
    expect(text).not.toContain('user_center__need_login')
    // 没有未读就不该写库（省一次 IPC 与一次全表 UPDATE）
    expect(mocks.markFollowFeedAllRead).not.toHaveBeenCalled()
  })

  it('有条目：单页时间线同时画新歌行与新专行，字段各就各位', async() => {
    setDb({
      items: [
        item({ id: 1, kind: 'song', name: '新歌一', singerName: '歌手甲', publishTime: '2026-09-20', read: 0 }),
        item({
          id: 2,
          kind: 'album',
          itemId: 'album-mid-1',
          name: '专辑二',
          singerName: '歌手乙',
          albumMid: 'album-mid-1',
          trackCount: 12,
          publishTime: '2026-09-18',
        }),
      ],
      unread: 1,
      monitored: 3,
    })

    const wrapper = mountPage()
    await flushPromises()
    const rows = wrapper.findAll('li')
    const text = wrapper.text()

    expect(rows).toHaveLength(2)
    // 新歌行：新歌标签 + 歌名 + 歌手 + 发布时间
    expect(rows[0].text()).toContain('follow__kind_song')
    expect(rows[0].text()).toContain('新歌一')
    expect(rows[0].text()).toContain('歌手甲')
    expect(rows[0].text()).toContain('2026-09-20')
    expect(rows[0].text()).not.toContain('follow__kind_album')
    expect(rows[0].text()).not.toContain('follow__album_tracks')
    // 新专行：新专辑标签 + 专辑名 + 歌手 + 曲目数 + 发布日期
    expect(rows[1].text()).toContain('follow__kind_album')
    expect(rows[1].text()).toContain('专辑二')
    expect(rows[1].text()).toContain('歌手乙')
    expect(rows[1].text()).toContain('follow__album_tracks({"count":12})')
    expect(rows[1].text()).toContain('2026-09-18')
    // 状态行常显：监控中的歌手数也在
    expect(text).toContain('follow__monitored({"count":3})')
  })

  it('进页面只给「当时还是未读」的那几条打 fresh 标记，并随即全部置已读', async() => {
    setDb({
      items: [
        item({ id: 1, name: '新歌一', read: 0 }),
        item({ id: 2, kind: 'album', itemId: 'album-mid-1', name: '专辑二', trackCount: 8, read: 1 }),
      ],
      unread: 1,
      monitored: 3,
    })

    const wrapper = mountPage()
    await flushPromises()
    const rows = wrapper.findAll('li')

    // fresh 的表达收在时间轴节点上（2026-09-27 视觉重做）：亮主色节点 + title，不再渲染「本次新增」文字
    expect(rows[0].find('span').classes().some(name => name.includes('dotFresh'))).toBe(true)
    expect(rows[0].find('span').attributes('title')).toBe('follow__fresh')
    expect(rows[1].find('span').classes().some(name => name.includes('dotFresh'))).toBe(false)
    expect(rows[1].find('span').attributes('title')).toBe('')

    // 角标清零：库里置已读 + 内存里的未读归零（顺序上 freshIds 必须先记下，见 store 的注释）
    // 只写一次：首次读库那一下由 `openFollowFeed` 负责，未读数 watch 不许再插一脚
    expect(mocks.markFollowFeedAllRead).toHaveBeenCalledTimes(1)
    expect(followFeedState.freshIds).toEqual([1])
    expect(followFeedState.unreadCount).toBe(0)
  })

  it('页面开着时一轮检查插进新条目：立刻标已读，并并进「本次新增」', async() => {
    // 进页面时还是空库
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('follow__empty')
    expect(mocks.markFollowFeedAllRead).not.toHaveBeenCalled()

    // 模拟一轮检查收尾：新条目落库（`performFollowFeedCheck` 成功那条路的最后一步就是 loadFollowFeed）
    setDb({ items: [item({ id: 7, name: '刚落库的新歌', read: 0 })], unread: 1, monitored: 3 })
    await loadFollowFeed()
    await flushPromises()

    // 用户就在这一页上：角标不该继续挂着数字，而且这条要算进「本次新增」（节点亮点）
    expect(mocks.markFollowFeedAllRead).toHaveBeenCalledTimes(1)
    expect(followFeedState.unreadCount).toBe(0)
    expect(followFeedState.freshIds).toEqual([7])
    expect(wrapper.text()).toContain('刚落库的新歌')
    expect(wrapper.findAll('li').some(row => row.find('span').classes().some(name => name.includes('dotFresh')))).toBe(true)
  })
})

describe('关注动态：顶部状态行', () => {
  it('从未成功过：显示「从未检查」，不画假时间', async() => {
    setDb({ monitored: 0, lastSuccessAt: null })

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('follow__never_checked')
  })

  it('成功过：显示格式化后的时间（`dateFormat2`），不再是「从未检查」', async() => {
    setDb({ monitored: 2, lastSuccessAt: Date.now() - 3600 * 1000 })

    const wrapper = mountPage()
    await flushPromises()
    const text = wrapper.text()

    expect(text).not.toContain('follow__never_checked')
    // `dateFormat2` 读的是 `window.i18n`——**真件**（时间线 import 的 `@renderer/plugins/i18n`
    // 会把 dom setup 的桩换掉），所以断言取同一个函数算出来的文案
    expect(text).toContain(window.i18n.t('date_format_hour' as any, { num: 1 }))
  })

  it('失败过：把原因画在状态行上（不弹窗、不打断）', async() => {
    setDb({ monitored: 2, lastSuccessAt: Date.now() - 3600 * 1000 })
    followFeedState.lastError = { at: Date.now(), reason: '网络错误' }

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('follow__check_failed({"reason":"网络错误"})')
  })

  it('检查中：刷新键换成「正在检查…」并禁用', async() => {
    followFeedState.isChecking = true

    const wrapper = mountPage()
    await flushPromises()

    const checking = buttonByText(wrapper, 'follow__checking')
    expect(checking).toBeDefined()
    expect(checking!.attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, 'follow__refresh')).toBeUndefined()
  })

  it('点「立即检查」走 store 的 refreshFollowFeed（页面里不写检测逻辑）', async() => {
    const wrapper = mountPage()
    await flushPromises()

    await buttonByText(wrapper, 'follow__refresh')!.trigger('click')

    expect(mocks.refreshFollowFeed).toHaveBeenCalledTimes(1)
  })
})
