import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useI18n } from '@renderer/plugins/i18n'
import { playMusicInfo } from '@renderer/store/player/state'
import { favSongIds } from '@renderer/store/user/state'
import ControlBtns from './ControlBtns.vue'

/**
 * 播放详情页底部那排键里的「我喜欢」心形（ui-polish-3 工单 10）。
 *
 * 这一处是**三个入口里的第三个**（另外两个：歌曲表行内键、播放栏），三处共用
 * `utils/compositions/useFavSong` 的 `favIconOf`——但模板各写各的，href 绑错一样会在
 * 真机上「已喜欢仍显示空心」。所以这里按入口各钉一遍：未喜欢 → `#icon-love`（空心），
 * 已喜欢 → `#icon-love-solid`（实心）+ `active` 类（主色）。
 *
 * 顺带钉住 pug 模板能编译：这个组件是 `.vue` 里的 pug 模板，写错缩进只有挂载时才报。
 *
 * 文案走**真 i18n**（不是 `$t` 桩）：本组件用的是 `useI18n()`，它读的是
 * `plugins/i18n.ts` 里 `createI18n()` 装出来的那份实例，`global.mocks.$t` 到不了它。
 */

const t = useI18n()
/** 两个状态各一个键名（无障碍名），与行内键、播放栏同一套 key */
const FAV_LABELS = [t('list_add__cloud_fav'), t('list__unlove')]

const txSong = {
  id: 'tx_1',
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id: '1', songType: 0 },
} as any

const mountBtns = () => mount(ControlBtns, {
  global: {
    mocks: { $t: (key: string) => key },
    stubs: {
      'common-sound-effect-btn': true,
      'common-playback-rate-btn': true,
      'common-volume-btn': true,
      'common-toggle-play-mode-btn': true,
      'common-list-add-modal': true,
    },
  },
})

/** 心形键：按无障碍名找（两种状态的键名都认），不猜它在控件簇里的位置 */
const favBtn = (wrapper: ReturnType<typeof mountBtns>) => {
  const btn = wrapper.findAll('button').find(node => FAV_LABELS.includes(node.attributes('aria-label') ?? ''))
  if (!btn) throw new Error('没找到心形键，模板结构变了？')
  return btn
}

// `xlink:href` 落在 xlink 命名空间里，`attributes()` 取不到，只能断言序列化结果
// （同 plugins/SvgIcon/SvgIcon.test.ts 的口径）
const favIconHtml = (wrapper: ReturnType<typeof mountBtns>) => favBtn(wrapper).find('use').element.outerHTML

beforeEach(() => {
  favSongIds.splice(0, favSongIds.length)
  playMusicInfo.musicInfo = txSong
})

describe('layout/PlayDetail/components/ControlBtns 的「我喜欢」心形', () => {
  it('未在我喜欢里 → 空心 + 文案「收藏到…」，键名与其它两处同一套', () => {
    const wrapper = mountBtns()

    expect(favBtn(wrapper).attributes('aria-label')).toBe(t('list_add__cloud_fav'))
    expect(favIconHtml(wrapper)).toContain('xlink:href="#icon-love"')
    expect(favIconHtml(wrapper)).not.toContain('love-solid')
  })

  it('已在我喜欢里 → 实心 + active 类（主色）', async() => {
    const wrapper = mountBtns()

    favSongIds.push('1')
    await wrapper.vm.$nextTick()

    expect(favBtn(wrapper).attributes('aria-label')).toBe(t('list__unlove'))
    expect(favIconHtml(wrapper)).toContain('xlink:href="#icon-love-solid"')
    // CSS Modules 的类名带哈希，只断言「带上了这个状态类」（同 components/base/Btn.test.ts 的口径）
    expect(favBtn(wrapper).classes().some(name => name.includes('active'))).toBe(true)
  })

  it('「添加到…」键用的是歌单图形，不是心形（工单 10 用户原话）', () => {
    const wrapper = mountBtns()

    const addBtn = wrapper.findAll('button')
      .find(node => node.attributes('aria-label') === 'player__add_music_to')!
    expect(addBtn.find('use').element.outerHTML).toContain('xlink:href="#icon-list-add"')
    expect(addBtn.find('use').element.outerHTML).not.toContain('love')
  })
})
