import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tags } from '@renderer/store/songList/state'
import TagList from './TagList.vue'

/**
 * 歌单广场标签下拉取数失败的可读文案（票 03b 同类的体验面）。
 *
 * `getTags(source)` 失败后下拉原来永远空白——用户看不出是「加载失败」还是「本来就没标签」。
 * 这里钉住失败态会落 `list__load_failed`（复用既有 key，不自造），且失败被收口。
 */

const { getTags } = vi.hoisted(() => ({ getTags: vi.fn() }))

vi.mock('@renderer/store/songList/action', () => ({
  getTags,
  setTags: vi.fn(),
}))
vi.mock('@renderer/plugins/i18n', () => ({ useI18n: () => (key: string) => key }))
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

const mountTagList = () => mount(TagList, {
  props: { source: 'tx', tagId: '' },
  global: { mocks: { $t: (key: string) => key } },
})

describe('songlist/TagList 取标签失败的可读文案', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (tags as Record<string, unknown>).tx
  })

  it('getTags 失败 → 下拉显示 list__load_failed，且无未处理 rejection', async() => {
    getTags.mockRejectedValue(new Error('标签接口挂了'))
    const unhandled = trackUnhandledRejection()

    const wrapper = mountTagList()
    await settle()
    unhandled.stop()

    expect(wrapper.text()).toContain('list__load_failed')
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })

  it('正常返回不回归：渲染标签分组、不显示失败文案', async() => {
    getTags.mockResolvedValue({
      source: 'tx',
      hotTag: [],
      tags: [{ name: '流派', list: [{ id: '1', name: '流行', parent_id: '', parent_name: '流派', source: 'tx' }] }],
    })
    const unhandled = trackUnhandledRejection()

    const wrapper = mountTagList()
    await settle()
    unhandled.stop()

    expect(wrapper.text()).toContain('流行')
    expect(wrapper.text()).not.toContain('list__load_failed')
    expect(unhandled.reasons).toEqual([])
    wrapper.unmount()
  })
})
