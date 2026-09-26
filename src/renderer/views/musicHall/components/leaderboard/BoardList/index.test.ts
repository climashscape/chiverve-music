import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boards } from '@renderer/store/leaderboard/state'
import BoardList from './index.vue'

/**
 * 榜单左栏取数失败的可读文案（票 03b 同类的体验面）。
 *
 * `await getBoardsList(source)` 失败后左栏原来全空、没有任何提示——用户看不出是「加载失败」
 * 还是「本来就没有榜单」。这里钉住失败态会落 `list__load_failed`（复用既有 key，不自造），
 * 且失败被收口（不把 rejection 冒到顶层）。
 */

const { getBoardsList } = vi.hoisted(() => ({ getBoardsList: vi.fn() }))

vi.mock('@renderer/store/leaderboard/action', () => ({
  getBoardsList,
  setBoard: vi.fn(),
}))
// 右键菜单那套与本用例无关（它自己会碰 i18n 与播放/收藏动作）
vi.mock('./useMenu', () => ({
  default: () => ({ menus: [], menuLocation: { x: 0, y: 0 }, isShowMenu: false, showMenu: vi.fn(), menuClick: vi.fn() }),
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useRoute: () => ({ path: '/musicHall', query: {} }),
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

const settle = async() => { await new Promise(resolve => setTimeout(resolve, 0)) }

const mountBoardList = () => mount(BoardList, {
  props: { source: 'tx', boardId: undefined },
  global: {
    stubs: { 'svg-icon': true, 'base-menu': true },
    mocks: { $t: (key: string) => key },
  },
})

describe('leaderboard/BoardList 取榜单失败的可读文案', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (boards as Record<string, unknown>).tx
  })

  it('getBoardsList 失败 → 左栏显示 list__load_failed，且无未处理 rejection', async() => {
    getBoardsList.mockRejectedValue(new Error('榜单接口挂了'))
    const unhandled = trackUnhandledRejection()

    const wrapper = mountBoardList()
    await settle()
    unhandled.stop()

    // 用渲染文本断言（不是 html()——模板注释里也写着这个 key，会被误判成通过）
    expect(wrapper.find('ul').text()).toContain('list__load_failed')
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })

  it('正常返回不回归：渲染榜单条目、不显示失败文案', async() => {
    getBoardsList.mockResolvedValue({ source: 'tx', list: [{ id: 'tx__1', name: '巅峰榜', bangid: '1' }] })
    const unhandled = trackUnhandledRejection()

    const wrapper = mountBoardList()
    await settle()
    unhandled.stop()

    expect(wrapper.find('ul').text()).not.toContain('list__load_failed')
    expect(wrapper.find('ul').text()).toContain('巅峰榜')
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })
})
