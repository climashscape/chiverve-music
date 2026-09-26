import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { setLanguage } from '@root/lang'
import enUs from '@root/lang/en-us.json'
import zhCn from '@root/lang/zh-cn.json'
import { playMusicInfo } from '@renderer/store/player/state'
import Page from './index.vue'

/**
 * 「相关歌单」卡片上的曲目数要走 i18n（2026-09-26 复核的缺陷 13）。
 *
 * 原来是 `{{ item.total }} 首` 硬编码量词：英文 / 韩文界面下也显示「首」。
 * 修法**复用既有 key** `user_center__gene_songs`（四语已经是 `{num} 首 / {num} tracks / …`），
 * 不新造同义文案。
 *
 * 判据取**换语言**：切到 `en-us` 后那张卡片必须变成英文——硬编码的量词不随语言变，这条才有效。
 * 所以这里用**真 i18n**（父页面模板走 `$t`），不像同目录的行为用例那样把 `$t` 桩成 key。
 */
const relatedPlaylist = {
  id: 'pl1',
  name: '开车必听',
  img: 'https://img/cover.png',
  total: 5,
}

vi.mock('@common/utils/vueRouter', () => ({
  useRoute: () => ({ query: { mid: 'abc', source: 'tx' } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@renderer/store/player/action', () => ({ setShowPlayerDetail: vi.fn() }))
vi.mock('@renderer/components/material/OnlineList/usePlay', () => ({ default: () => ({ handlePlayMusic: vi.fn() }) }))
vi.mock('@renderer/plugins/Dialog', () => ({ dialog: vi.fn() }))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    tx: {
      songDetail: {
        // 数字 songId 非 0 才会去取四个关联块（见 useSongDetail 的判据）
        getDetail: vi.fn(async() => ({
          track: { songmid: 'abc', name: '歌名', singer: '歌手', albumMid: '', albumName: '', img: '', interval: '03:00' },
          trackRaw: { singer: [{ mid: 's1', name: '歌手' }], id: 123, type: 0 },
          desc: '',
          info: { company: '', genre: '', lan: '', pubTime: '' },
        })),
        getSimilarSongs: vi.fn(async() => []),
        getOtherVersions: vi.fn(async() => []),
        getRelatedPlaylists: vi.fn(async() => [relatedPlaylist]),
        getRelatedMv: vi.fn(async() => []),
        getProducer: vi.fn(async() => []),
        getSheetMusic: vi.fn(async() => []),
      },
      getAlbumDetailPageUrl: () => '',
    },
    sources: [],
  },
}))

const stubs = {
  'common-toolbar-actions': { template: '<div><slot /></div>' },
  'base-btn': { template: '<button><slot /></button>' },
  'material-online-list': { template: '<div />' },
  'mv-player-modal': { template: '<div />' },
  'base-menu': { template: '<div />' },
  'sheet-music-modal': { template: '<div />' },
}

beforeEach(() => {
  playMusicInfo.musicInfo = null
})

afterEach(() => {
  setLanguage('zh-cn')
})

describe('歌曲详情页「相关歌单」卡片的曲目数', () => {
  it('跟随当前语言（en-us 下不是「5 首」）', async() => {
    const wrapper = mount(Page, { global: { plugins: [i18nPlugin], stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const cards = wrapper.findAll('li')
    expect(cards.length).toBeGreaterThan(0)
    const zhText = cards[0].text()
    expect(zhText).toContain(zhCn.user_center__gene_songs.replace('{num}', '5'))
    expect(zhText).toContain('5 首')

    setLanguage('en-us')
    await wrapper.vm.$nextTick()

    const enText = wrapper.findAll('li')[0].text()
    expect(enText).toContain(enUs.user_center__gene_songs.replace('{num}', '5'))
    expect(enText).not.toContain('5 首')
    wrapper.unmount()
  })
})
