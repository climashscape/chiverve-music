import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useI18n } from '@renderer/plugins/i18n'
import { playMusicInfo } from '@renderer/store/player/state'
import { favSongIds } from '@renderer/store/user/state'
import ControlBtns from './ControlBtns.vue'

/**
 * 播放栏那排键里的「我喜欢」心形与「添加到…」图标（ui-polish-3 工单 10）。
 *
 * 为什么单独一个文件、不和同目录的 `ControlBtns.test.ts` 放一起：那份是**准星键**（工单 08/11）
 * 的时序用例，夹具很重（真的挂 ListMusicTable、手工改容器几何）；这里只要「两个键的 href 对不对」，
 * 混进去会把两件事的失败原因搅在一起。分工与本仓「一个测试文件盯一件事」的习惯一致。
 *
 * 心形：未喜欢 → `#icon-love`（空心），已喜欢 → `#icon-love-solid`（实心）+ 主色类。
 * 这是三个入口里的第二个（另两个：歌曲表行内键 `ListButtons.test.ts`、
 * 播放详情页 `PlayDetail/components/ControlBtns.test.ts`）。
 *
 * 文案走**真 i18n**：本组件用 `useI18n()`，`global.mocks.$t` 到不了它。
 */

const t = useI18n()
const FAV_LABELS = [t('list_add__cloud_fav'), t('list__unlove')]

// 本组件会调 `useRoute()`（准星键换页重算用）——测试里没有路由实例，按同目录那份用例的做法桩掉
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/playlists', query: {}, fullPath: '/playlists' }),
}))

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

const btnByLabel = (wrapper: ReturnType<typeof mountBtns>, label: string) => {
  const btn = wrapper.findAll('button').find(node => node.attributes('aria-label') === label)
  if (!btn) throw new Error(`没找到 ${label} 这个键，模板结构变了？`)
  return btn
}

// `xlink:href` 落在 xlink 命名空间里，`attributes()` 取不到，只能断言序列化结果
// （同 plugins/SvgIcon/SvgIcon.test.ts 的口径）
const favIconHtml = (wrapper: ReturnType<typeof mountBtns>) => favBtn(wrapper).find('use').element.outerHTML

beforeEach(() => {
  favSongIds.splice(0, favSongIds.length)
  playMusicInfo.musicInfo = txSong
})

describe('layout/PlayBar/ControlBtns 的「我喜欢」心形与「添加到…」', () => {
  it('未在我喜欢里 → 空心', () => {
    const wrapper = mountBtns()

    expect(favBtn(wrapper).attributes('aria-label')).toBe(t('list_add__cloud_fav'))
    expect(favIconHtml(wrapper)).toContain('xlink:href="#icon-love"')
    expect(favIconHtml(wrapper)).not.toContain('love-solid')
  })

  it('已在我喜欢里 → 实心 + favOn 类（主色）', async() => {
    const wrapper = mountBtns()

    favSongIds.push('1')
    await wrapper.vm.$nextTick()

    expect(favBtn(wrapper).attributes('aria-label')).toBe(t('list__unlove'))
    expect(favIconHtml(wrapper)).toContain('xlink:href="#icon-love-solid"')
    // CSS Modules 的类名带哈希，只断言「带上了这个状态类」（同 components/base/Btn.test.ts 的口径）
    expect(favBtn(wrapper).classes().some(name => name.includes('favOn'))).toBe(true)
  })

  it('「添加到…」键用的是歌单图形，不是心形（工单 10 用户原话）', () => {
    const wrapper = mountBtns()

    const addBtn = btnByLabel(wrapper, 'player__add_music_to')
    expect(addBtn.find('use').element.outerHTML).toContain('xlink:href="#icon-list-add"')
    // 「添加到…」下面挂一颗心（原 `#icon-add-2` 就是心形带加号）正是用户报的那条
    expect(addBtn.find('use').element.outerHTML).not.toContain('love')
  })
})
