import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { favSongIds, favSongIdsLoaded } from '@renderer/store/user/state'
import BaseBtn from '@renderer/components/base/Btn.vue'
import RadarCarousel from './RadarCarousel.vue'

/**
 * 雷达轮播底部那颗收藏键（ui-polish-3 工单 10 的漏网处，票 12 的实现记录里点过名）。
 *
 * 它是第五个「我喜欢」入口，位置特殊：在轮播底部的**等宽按钮排**里（与刷新/下载/去歌手/
 * 去专辑同排），所以尺寸口径跟那一排走（`.btnIcon` 统一的 14×14 盒），但**两态**必须与
 * 另外四处共用 `useFavSong` 的 `favIconOf`——此前这里写死 `#icon-love`，已喜欢只换个颜色，
 * 「喜欢和取消看着区别不大」（用户 2026-09-24 的原话）。
 *
 * 票 12 又补了**动作**这一半：这里原先自己按 `isLoved` 判方向（`isLoved` 在 id 集合没拉完时
 * 恒为 false），点「取消喜欢」会走成「加入」。现在走共用的 `useFavSong().toggleFav`
 * ——它先 await `loadFavSongIds()` 再定方向，所以本文件后一个 describe 钉的就是那个方向判定。
 *
 * 只桩三件事：会话菜单/两个弹窗（本用例不点它们）与 SDK 的收藏读 / 写（测试环境没人应答）。
 * `base-btn` 用**真的**——心形就在它的默认插槽里，换成桩就看不到这颗心了。
 */

const { getFavSongIds, likeSong, unlikeSong } = vi.hoisted(() => ({
  getFavSongIds: vi.fn(),
  likeSong: vi.fn(),
  unlikeSong: vi.fn(),
}))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { sources: [], tx: { user: { getFavSongIds }, songList: { likeSong, unlikeSong } } },
}))

// 本用例不碰路由（跳转在 `useMusicJump` 里），桩掉免得每次挂载刷一屏 router 注入告警
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/radar', query: {} }),
}))

const txSong = {
  id: 'tx_1',
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id: '1', songType: 0 },
} as any

/** `RadarBlock` 的最小夹具：一首歌就够（心形键作用于「中央这一首」） */
const block = {
  list: [txSong],
  noItemLabel: '',
  isLoading: false,
  moreError: '',
  hasMore: false,
} as any

const mountCarousel = () => mount(RadarCarousel, {
  props: { block, tab: 'radar' },
  global: {
    components: { BaseBtn },
    mocks: { $t: (key: string) => key },
    stubs: {
      'base-menu': true,
      'common-list-add-modal': true,
      'common-download-modal': true,
    },
  },
})

/** 收藏键：按可见文案找（两种状态的文案都认），不猜它在按钮排里的位置 */
const favBtn = (wrapper: ReturnType<typeof mountCarousel>) => {
  const btn = wrapper.findAll('button')
    .find(node => ['list__love', 'list__unlove'].includes((node.text() || '').trim()))
  if (!btn) throw new Error('没找到雷达页的收藏键，模板结构变了？')
  return btn
}

// `xlink:href` 落在 xlink 命名空间里，`attributes()` 取不到，只能断言序列化结果（同 SvgIcon 用例）
const favIconHtml = (wrapper: ReturnType<typeof mountCarousel>) => favBtn(wrapper).find('use').element.outerHTML

beforeEach(() => {
  vi.clearAllMocks()
  favSongIds.splice(0, favSongIds.length)
  favSongIdsLoaded.value = true
  // 写通道默认成功（旧契约的 `true`，`isWriteOk` 两种都认）；`getFavSongIds` 的桩在用例里各给各的，
  // 因为「点下去那一刻收藏态到没到」正是下面第二个 describe 的自变量
  likeSong.mockResolvedValue(true)
  unlikeSong.mockResolvedValue(true)
})

describe('views/Radar/RadarCarousel 底部收藏键的心形', () => {
  it('未在我喜欢里 → 空心 `#icon-love`', () => {
    const wrapper = mountCarousel()

    expect(favIconHtml(wrapper)).toContain('xlink:href="#icon-love"')
    expect(favIconHtml(wrapper)).not.toContain('love-solid')
  })

  it('已在我喜欢里 → 实心 `#icon-love-solid` + btnIconOn 类（主色）', async() => {
    const wrapper = mountCarousel()

    favSongIds.push('1')
    await wrapper.vm.$nextTick()

    expect(favIconHtml(wrapper)).toContain('xlink:href="#icon-love-solid"')
    // CSS Modules 的类名带哈希，只断言「带上了这个状态类」（同 ControlBtns.favIcon.test.ts 的口径）
    expect(favBtn(wrapper).find('svg').classes().some(name => name.includes('btnIconOn'))).toBe(true)
  })
})

describe('views/Radar/RadarCarousel 底部收藏键的动作（票 12：走共用入口，不自己判方向）', () => {
  it('收藏态还没拉完时点它：先等 id 集合回来再定方向 —— 歌已在「我喜欢」里就是取消，不是加入', async() => {
    favSongIdsLoaded.value = false
    // 挂载时那次「拉收藏态」与点击后 `toggleFav` 内部那次共用一个**挂起**的请求：
    // 释放之前雷达页手上的收藏态就是空的（旧实现正是在这一刻把取消判成加入的）
    let release: (ids: string[]) => void = () => {}
    getFavSongIds.mockReturnValue(new Promise(resolve => { release = resolve }))
    const wrapper = mountCarousel()

    await favBtn(wrapper).trigger('click')
    // 此刻 id 集合还没到：不许当场写（写下去就是写反方向）
    expect(likeSong).not.toHaveBeenCalled()
    expect(unlikeSong).not.toHaveBeenCalled()

    release(['1'])
    await flushPromises()

    expect(getFavSongIds).toHaveBeenCalled()
    // songId/songType 从 `meta` 取（同 ListMusicTable 的用例口径）
    expect(unlikeSong).toHaveBeenCalledWith([{ songId: 1, songType: 0 }])
    expect(likeSong).not.toHaveBeenCalled()
  })

  it('歌不在「我喜欢」里时点它是加入（另一个方向照旧）', async() => {
    favSongIdsLoaded.value = false
    getFavSongIds.mockResolvedValue([])
    const wrapper = mountCarousel()

    await favBtn(wrapper).trigger('click')
    await flushPromises()

    expect(likeSong).toHaveBeenCalledWith([{ songId: 1, songType: 0 }])
    expect(unlikeSong).not.toHaveBeenCalled()
  })
})
