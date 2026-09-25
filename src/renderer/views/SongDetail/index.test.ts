import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playMusicInfo } from '@renderer/store/player/state'
import Page from './index.vue'

/**
 * 歌曲详情页「打开播放详情页」入口的显隐（ui-polish-followups 工单 05）。
 *
 * 钉住三种状态下的**行为**（不是实现细节）：没在播 / 在播本页这首 / 在播另一首。
 * 第四种（在播的是本地文件）也补一条：本地歌曲的 `meta.songId` 是文件路径，不能被当成同一首。
 *
 * 取数链路全部 mock：真实的 `music.tx.songDetail` 要打 QQ 接口，本测试只关心「详情回来后入口显不显示」。
 * `setShowPlayerDetail` 也 mock —— 真身从 `store/player/action` → `core/player`，本测试不需要播放器。
 * 子组件用桩：工具栏 / 在线列表 / MV 弹窗 / 歌手选择菜单都与本票无关，别让它们把不在范围内的失败带进来。
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  setShowPlayerDetail: vi.fn(),
  getDetail: vi.fn(),
  dialog: vi.fn(),
}))

vi.mock('@common/utils/vueRouter', () => ({
  useRoute: () => ({ query: { mid: 'abc', source: 'tx' } }),
  useRouter: () => ({ push: mocks.push, back: mocks.back, replace: mocks.replace }),
}))
vi.mock('@renderer/store/player/action', () => ({ setShowPlayerDetail: mocks.setShowPlayerDetail }))
vi.mock('@renderer/components/material/OnlineList/usePlay', () => ({ default: () => ({ handlePlayMusic: vi.fn() }) }))
vi.mock('@renderer/plugins/Dialog', () => ({ dialog: mocks.dialog }))
// 文案断言用 i18n 的 key（`$t` 桩直通 key）：钉的是「哪一条文案」，措辞改了不会误伤
vi.mock('@renderer/plugins/i18n', () => ({ i18nPlugin: { install() {} }, useI18n: () => (key: string) => key }))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    tx: {
      songDetail: {
        getDetail: mocks.getDetail,
        getSimilarSongs: vi.fn(async() => []),
        getOtherVersions: vi.fn(async() => []),
        getRelatedPlaylists: vi.fn(async() => []),
        getRelatedMv: vi.fn(async() => []),
      },
      getAlbumDetailPageUrl: () => '',
    },
  },
}))

const ENTRY_TEXT = 'song_detail__open_play_detail'

const stubs = {
  'common-toolbar-actions': { template: '<div><slot /></div>' },
  'base-btn': { template: '<button><slot /></button>' },
  'material-online-list': { template: '<div />' },
  'mv-player-modal': { template: '<div />' },
  'base-menu': { template: '<div />' },
}

const txMusic = (songId: string): LX.Music.MusicInfoOnline => ({
  id: `tx_${songId}`,
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { songId, albumName: '专辑', qualitys: [], _qualitys: {}, strMediaMid: '' },
})

const localMusic = (filePath: string): LX.Music.MusicInfoLocal => ({
  id: `local_${filePath}`,
  name: '本地歌',
  singer: '歌手',
  source: 'local',
  interval: '03:00',
  meta: { songId: filePath, albumName: '', filePath, ext: 'mp3' },
})

const mountPage = () => mount(Page, {
  global: { stubs, mocks: { $t: (key: string) => key } },
})
/** 详情是异步取回来的，入口的显隐要看它落地之后的渲染结果 */
const mountDetailPage = async() => {
  const wrapper = mountPage()
  await flushPromises()
  return wrapper
}

describe('views/SongDetail/index.vue 的「打开播放详情页」入口', () => {
  beforeEach(() => {
    // 歌单间会串：每个用例都从「什么都没在播」起步
    playMusicInfo.musicInfo = null
    vi.clearAllMocks()
    mocks.getDetail.mockResolvedValue({
      // songmid 才是 mid（本页身份）；trackRaw.id = 0 → 四个关联块不再发请求，本测试不关心它们
      track: { songmid: 'abc', name: '歌名', singer: '歌手', albumMid: '', albumName: '', img: '', interval: '03:00' },
      trackRaw: { singer: [{ mid: 's1', name: '歌手' }], id: 0, type: 0 },
      desc: '',
      info: { company: '', genre: '', lan: '', pubTime: '' },
    })
  })

  it('什么都没在播时，入口不出现', async() => {
    const wrapper = await mountDetailPage()

    expect(wrapper.text()).not.toContain(ENTRY_TEXT)
    wrapper.unmount()
  })

  it('在播的是本页这首时入口出现，点开打开播放详情', async() => {
    playMusicInfo.musicInfo = txMusic('abc')
    const wrapper = await mountDetailPage()

    // 页面里可点的 `<p>` 不止它一个（歌手名也是），所以按文案取本入口
    const entry = wrapper.findAll('p').find(node => node.text() === ENTRY_TEXT)
    expect(entry).toBeTruthy()

    await entry!.trigger('click')
    expect(mocks.setShowPlayerDetail).toHaveBeenCalledWith(true)
    wrapper.unmount()
  })

  it('在播的是另一首时入口也不出现（点开看到的是别人，文案会骗人）', async() => {
    playMusicInfo.musicInfo = txMusic('other')
    const wrapper = await mountDetailPage()

    expect(wrapper.text()).not.toContain(ENTRY_TEXT)
    wrapper.unmount()
  })

  it('在播的是本地文件时入口不出现（本地 meta.songId 是文件路径，不是同一首）', async() => {
    playMusicInfo.musicInfo = localMusic('/music/abc.mp3')
    const wrapper = await mountDetailPage()

    expect(wrapper.text()).not.toContain(ENTRY_TEXT)
    wrapper.unmount()
  })
})
