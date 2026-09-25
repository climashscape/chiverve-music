import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { playMusicList } from '@renderer/core/player'
import SongsPanel from './SongsPanel.vue'

vi.mock('@renderer/core/player', () => ({ playMusicList: vi.fn() }))

/**
 * 取数在 `useSinger.ts`（会发请求），本用例只关心「点单曲时队列身份是什么」——
 * 所以桩掉模块，返回一份固定的歌曲块。
 */
const songs = {
  list: [
    { id: 'a', name: '歌a', singer: '歌手', source: 'tx', interval: '03:00', meta: { albumName: '专辑', _qualitys: {} } },
    { id: 'b', name: '歌b', singer: '歌手', source: 'tx', interval: '03:00', meta: { albumName: '专辑', _qualitys: {} } },
  ] as LX.Music.MusicInfoOnline[],
  page: 1,
  limit: 1,
  noItemLabel: '',
  hasMore: false,
  isLoading: false,
  moreError: '',
}
vi.mock('../useSinger', () => ({
  default: () => ({ songs, ensureSongsTab: vi.fn(), loadMoreSongs: vi.fn() }),
}))

/**
 * 歌手页歌曲表的队列身份（ui-polish-followups 工单 09）。
 *
 * 钉住两件事，都是**真机不容易覆盖**的：
 * 1. 身份 = `singer__songs__<mid>`（有真实 id 用真实 id）；
 * 2. 面板不按 mid 重建（`Singer/index.vue` 的 `songs-panel` 没有 key），所以身份必须**现算**——
 *    setup 时快照一个 id 会让第二个歌手仍用第一个歌手的队列身份（换列表时判不出「不是同一串」，
 *    随机/上一首会串到上一个歌手的列表）。
 */
const mountPanel = (mid: string) => mount(SongsPanel, {
  props: { mid },
  global: {
    stubs: { 'material-online-list': true, 'base-btn': true },
    mocks: { $t: (key: string) => key },
  },
})

describe('SingerSongsPanel：队列身份', () => {
  it('点单曲把「这个歌手的歌」当队列（listId = singer__songs__<mid>）', () => {
    const wrapper = mountPanel('midA')
    wrapper.vm.handlePlaySongs(1)
    expect(playMusicList).toHaveBeenCalledWith('singer__songs__midA', songs.list, 1)
    wrapper.unmount()
  })

  it('换歌手（同一个组件实例只换 prop）后身份跟着变，不是 setup 时的快照', async() => {
    const wrapper = mountPanel('midA')
    await wrapper.setProps({ mid: 'midB' })
    wrapper.vm.handlePlaySongs(0)
    expect(playMusicList).toHaveBeenLastCalledWith('singer__songs__midB', songs.list, 0)
    wrapper.unmount()
  })
})
