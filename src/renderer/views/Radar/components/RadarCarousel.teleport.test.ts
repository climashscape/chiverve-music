import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { favSongIds, favSongIdsLoaded } from '@renderer/store/user/state'
import BaseBtn from '@renderer/components/base/Btn.vue'
import RadarCarousel from './RadarCarousel.vue'

/**
 * 雷达轮播里两个弹窗的 teleport 落点（2026-09-26 复核的缺陷 11）。
 *
 * `common-download-modal` 是**视图内**弹窗（雷达在路由内容区里），按 §2.5.1 第 2 条必须显式
 * `teleport="#view"`：默认的 `#root` 会把整窗压暗、视觉上像换了一页（旁边的 `common-list-add-modal`
 * 本来就是带 `teleport="#view"` 的，只有这一个漏了）。
 *
 * 断的是传给弹窗的 `teleport` 属性（这条链的契约），不是渲染后的 DOM 落点——那由 `material-modal` 决定。
 */
const { getFavSongIds } = vi.hoisted(() => ({ getFavSongIds: vi.fn() }))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { sources: [], tx: { user: { getFavSongIds }, songList: { likeSong: vi.fn(), unlikeSong: vi.fn() } } },
}))
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/radar', query: {} }),
}))

/** 记录 teleport 的 `common-download-modal` 替身 */
const DownloadModalStub = defineComponent({
  name: 'common-download-modal',
  props: {
    show: { type: Boolean, default: false },
    teleport: { type: String, default: '#root' },
    // 真件是 `[Object, null]`（可为空），TS 的 PropType 不收元组里的 `null`，这里只声明默认值
    musicInfo: { default: null },
  },
  template: '<div class="download-modal-stub" :data-teleport="teleport" />',
})

const txSong = {
  id: 'tx_1',
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id: '1', songType: 0 },
} as any

const block = {
  list: [txSong],
  noItemLabel: '',
  isLoading: false,
  moreError: '',
  hasMore: false,
} as any

beforeEach(() => {
  vi.clearAllMocks()
  getFavSongIds.mockResolvedValue([])
  favSongIds.splice(0, favSongIds.length)
  favSongIdsLoaded.value = true
})

describe('views/Radar/RadarCarousel：弹窗的 teleport', () => {
  it('下载弹窗 teleport 到 #view（不是默认的 #root）', () => {
    const wrapper = mount(RadarCarousel, {
      props: { block, tab: 'radar' },
      global: {
        components: { BaseBtn },
        mocks: { $t: (key: string) => key },
        stubs: {
          'base-menu': true,
          'common-list-add-modal': true,
          'common-download-modal': DownloadModalStub,
        },
      },
    })

    expect(wrapper.get('.download-modal-stub').attributes('data-teleport')).toBe('#view')
    wrapper.unmount()
  })
})
