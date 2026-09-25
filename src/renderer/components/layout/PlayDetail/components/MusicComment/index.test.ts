import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MusicComment from './index.vue'

/**
 * 评论弹窗标题上的计数（数据类票 03 的界面落点）。
 *
 * **钉住的行为**：
 *   1. 「最新评论」那次列表响应带回总数时，标题出现 `(N)`——计数搭列表响应一起回来，
 *      **不额外发请求**；
 *   2. 响应里没有这个数 / 请求失败 → 标题**不显示**计数（不留 0、`-` 之类的占位噪音）；
 *   3. 0 是有效总数，照常显示 `(0)`；热评的 `Total`（热评条数）不能顶替总数。
 *
 * 只测本组件：数据层用桩（`music.tx.comment.getComment` / `getHotComment`），`toOldMusicInfo`、
 * 凭证 IPC 与全局注册的组件（`base-input` / `base-btn` / `material-pagination`）都桩掉——
 * 本用例不关心它们。文案断言用 i18n key，措辞改了不会误伤。
 */
const mocks = vi.hoisted(() => ({
  getComment: vi.fn(),
  getHotComment: vi.fn(),
}))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    tx: {
      comment: {
        getComment: mocks.getComment,
        getHotComment: mocks.getHotComment,
      },
    },
  },
}))
vi.mock('@renderer/utils/ipc', () => ({
  getQQCredential: vi.fn().mockResolvedValue(null),
}))
vi.mock('@renderer/utils', () => ({
  toOldMusicInfo: (info: unknown) => info,
}))

const stubs = {
  'base-input': { template: '<input>' },
  'base-btn': { template: '<button><slot /></button>' },
  'material-pagination': { template: '<div />' },
}
// `$t` 的桩把参数并进结果里，方便断言「标题里带的是哪首歌」（顺带证明计数不在 key 里）
const i18nMocks = {
  $t: (key: string, params?: { name?: string }) => (params?.name ? `${key}|${params.name}` : key),
}

const MUSIC_INFO = { id: '1', source: 'tx', name: '晴天', singer: '周杰伦' }

/** 标题行文本（含歌名与计数）。 */
const titleText = (wrapper: ReturnType<typeof mount>) => wrapper.get('h3').text()

/** 给根元素一个父节点：`mounted` 的 setWidth 会读 `parentNode.clientWidth`（jsdom 值为 0）。 */
let host: HTMLDivElement

/**
 * ⚠️ 别改成 VTU 的 `attachTo`：VTU 2.5 的 attachTo 会调 `app.onUnmount`（Vue 3.5 才有的 API），
 * 本仓库的 Vue 是 3.3.13，会直接 `TypeError: app.onUnmount is not a function`。
 */
const mountComment = () => {
  const wrapper = mount(MusicComment, {
    props: { show: false, musicInfo: MUSIC_INFO },
    global: { stubs, mocks: i18nMocks },
  })
  host.appendChild(wrapper.element)
  return wrapper
}

/** 打开弹窗（`show` 由 false 变 true 触发一次取数）并等请求落地。 */
const openComment = async() => {
  const wrapper = mountComment()
  await wrapper.setProps({ show: true })
  await flushPromises()
  return wrapper
}

/**
 * 等 `setWidth` 的两级 `setTimeout` 跑完再卸载。
 *
 * 那两级定时器会碰 `$refs.dom_tabMain`（`handleToggleTab`）：卸载后 refs 已置空，定时器再
 * 触发就是一条「Cannot set properties of null (setting 'scrollLeft')」的未处理异常
 * （组件自身既有行为，本用例不修它，只负责别踩）。
 */
const closeComment = async(wrapper: ReturnType<typeof mountComment>) => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
  wrapper.unmount()
}

beforeAll(() => {
  // jsdom 没实现 Element.scrollTo，而列表刷新后组件会用它把滚动位置归零
  ;(Element.prototype as any).scrollTo = () => {}
})

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  mocks.getComment.mockReset()
  mocks.getHotComment.mockReset()
  document.body.innerHTML = ''
})

describe('评论弹窗标题的计数', () => {
  it('列表响应带 commenttotal 时标题显示 (N)，且不为此多发请求', async() => {
    mocks.getComment.mockResolvedValue({ comments: [], total: 230665, maxPage: 1, page: 1, limit: 20 })
    mocks.getHotComment.mockResolvedValue({ comments: [], total: 3964, maxPage: 1, page: 1, limit: 20 })

    const wrapper = await openComment()

    // DOM 文本里没有字面空格：歌名与计数之间的间距由 `.commentHeaderCount` 的 margin-left 给
    expect(titleText(wrapper)).toBe('comment__title|晴天(230665)')
    // 热评的 Total（3964）不是总评论数，不能顶替它
    expect(titleText(wrapper)).not.toContain('3964')
    // 计数搭列表响应一起回来：打开弹窗只发「热评 + 最新」两次请求，没有第三次
    expect(mocks.getComment).toHaveBeenCalledTimes(1)
    expect(mocks.getHotComment).toHaveBeenCalledTimes(1)

    await closeComment(wrapper)
  })

  it('总数真的是 0 时照显 (0)（0 是有效数据，不是「取不到」）', async() => {
    mocks.getComment.mockResolvedValue({ comments: [], total: 0, maxPage: 1, page: 1, limit: 20 })
    mocks.getHotComment.mockResolvedValue({ comments: [], total: 0, maxPage: 1, page: 1, limit: 20 })

    const wrapper = await openComment()

    expect(titleText(wrapper)).toBe('comment__title|晴天(0)')

    await closeComment(wrapper)
  })

  it('响应里没有这个数（null）→ 标题只有歌名，不留占位噪音', async() => {
    mocks.getComment.mockResolvedValue({ comments: [], total: null, maxPage: 1, page: 1, limit: 20 })
    mocks.getHotComment.mockResolvedValue({ comments: [], total: 3964, maxPage: 1, page: 1, limit: 20 })

    const wrapper = await openComment()

    expect(titleText(wrapper)).toBe('comment__title|晴天')

    await closeComment(wrapper)
  })

  it('最新评论加载失败 → 标题只有歌名，不显示 0 或其它占位', async() => {
    mocks.getComment.mockRejectedValue(new Error('获取评论失败'))
    mocks.getHotComment.mockResolvedValue({ comments: [], total: 3964, maxPage: 1, page: 1, limit: 20 })

    const wrapper = await openComment()

    // 失败会重试到 3 次（组件里的 retryNum > 2 判据），重试完标题仍不该出现计数
    expect(mocks.getComment.mock.calls.length).toBe(3)
    expect(titleText(wrapper)).toBe('comment__title|晴天')

    await closeComment(wrapper)
  })
})
