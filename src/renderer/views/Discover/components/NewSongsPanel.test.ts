import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { playMusicList } from '@renderer/core/player'
import NewSongsPanel from './NewSongsPanel.vue'

vi.mock('@renderer/core/player', () => ({ playMusicList: vi.fn() }))

/**
 * 取数在 `useNewSongsTab.ts`（会发请求），本用例只关心「点单曲时队列身份是什么」——
 * 所以桩掉模块，返回一份可改 `type` 的固定区块。
 */
const newSongs = {
  list: [
    { id: 'a', name: '歌a', singer: '歌手', source: 'tx', interval: '03:00', meta: { albumName: '专辑', _qualitys: {} } },
    { id: 'b', name: '歌b', singer: '歌手', source: 'tx', interval: '03:00', meta: { albumName: '专辑', _qualitys: {} } },
  ] as LX.Music.MusicInfoOnline[],
  total: 2,
  page: 1,
  limit: 2,
  noItemLabel: '',
  hasMore: false,
  isLoading: false,
  type: 5,
}
vi.mock('../useNewSongsTab', () => ({
  default: () => ({
    newSongs,
    typeTabs: () => [],
    initNewSongsTab: vi.fn(),
    switchNewSongType: vi.fn(),
    loadNewSongs: vi.fn(),
  }),
}))

/**
 * 发现页「新歌」的队列身份（ui-polish-followups 工单 09）。
 *
 * 地区 tab 就在本组件里切（同一个组件实例），所以身份必须**现算**（`listId` 用 getter）：
 * 身份里不带 type、或取 setup 时快照，换地区后点歌就会沿用上一个地区的队列身份——
 * `playMusicList` 判不出「换了另一串」，不重新清已播放历史，随机/上一首会串到上一个地区。
 */
const mountPanel = () => mount(NewSongsPanel, {
  global: {
    stubs: { 'material-online-list': true, 'base-tab': true },
    mocks: { $t: (key: string) => key },
  },
})

describe('DiscoverNewSongsPanel：队列身份', () => {
  it('点单曲把「当前地区这一批新歌」当队列（listId = discover__new_songs__<type>）', () => {
    const wrapper = mountPanel()
    wrapper.vm.handlePlayList(1)
    expect(playMusicList).toHaveBeenCalledWith('discover__new_songs__5', newSongs.list, 1)
    wrapper.unmount()
  })

  it('换地区后身份跟着变（同实例），指向新地区那一串', () => {
    const wrapper = mountPanel()
    newSongs.type = 1 // 内地
    wrapper.vm.handlePlayList(0)
    expect(playMusicList).toHaveBeenLastCalledWith('discover__new_songs__1', newSongs.list, 0)
    wrapper.unmount()
  })
})
