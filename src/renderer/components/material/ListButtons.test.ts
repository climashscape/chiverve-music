import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ListButtons from './ListButtons.vue'
import { favSongIds } from '@renderer/store/user/state'

/**
 * 行内「我喜欢」键（ui-polish-3 工单 06）。
 *
 * 真机要求：这个键的**文案与状态要跟着当前状态走**（不在我喜欢里 → 「收藏到…」，
 * 已经在里面 → 「取消喜欢」），点了直接切换、不再开弹窗。用例钉三件事：
 *   1. 文案随状态变（读 store/user 的收藏全量 id 集合，写成功后会就地变）；
 *   2. 点了把 `fav` 交给调用方（行内键只 emit，动作在容器里做——与其它键同一套约定）；
 *   3. 不能收藏的歌（本地文件 / 非 QQ 源）与没开这个键时**不渲染**，不留死键。
 *
 * `$t` 用桩（键名即文案），断言的是「用了哪个 key」——文案本身在 i18n 四语里。
 */

const $t = (key: string) => key

const txSong = (id: string) => ({
  id: `tx_${id}`,
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id, songType: 0 },
}) as any

const localSong = {
  id: 'local_1',
  name: '本地文件',
  singer: '歌手',
  source: 'local',
  interval: '03:00',
  meta: {},
} as any

const mountBtns = (props: Record<string, any>) => mount(ListButtons, {
  props: { index: 3, playBtn: false, listAddBtn: false, favBtn: true, ...props },
  global: { mocks: { $t } },
})

const heartBtn = (wrapper: ReturnType<typeof mountBtns>) => wrapper.find('button')
// CSS Modules 的类名带哈希（`_favOn_7af6e4`），所以只断言「带上了这个状态类」，
// 不锁死生成出来的名字（同 components/base/Btn.test.ts 的口径）
const hasFavOnClass = (wrapper: ReturnType<typeof mountBtns>) =>
  wrapper.find('svg').classes().some(name => name.includes('favOn'))

beforeEach(() => {
  favSongIds.splice(0, favSongIds.length)
})

describe('components/material/ListButtons.vue 的「我喜欢」键', () => {
  it('不在我喜欢里 → 文案是「收藏到 QQ 音乐我喜欢」，点心形键 emit fav', async() => {
    const wrapper = mountBtns({ musicInfo: txSong('1') })

    expect(heartBtn(wrapper).attributes('aria-label')).toBe('list_add__cloud_fav')
    expect(heartBtn(wrapper).attributes('title')).toBe('list_add__cloud_fav')
    // 未收藏：心形不上主色
    expect(hasFavOnClass(wrapper)).toBe(false)

    await heartBtn(wrapper).trigger('click')

    expect(wrapper.emitted('btn-click')?.[0]?.[0]).toEqual({ action: 'fav', index: 3 })
  })

  it('已在我喜欢里 → 文案变「取消喜欢」、图标上主色（写成功后就地变）', async() => {
    const wrapper = mountBtns({ musicInfo: txSong('1') })

    favSongIds.push('1')
    await wrapper.vm.$nextTick()

    expect(heartBtn(wrapper).attributes('aria-label')).toBe('list__unlove')
    expect(heartBtn(wrapper).attributes('title')).toBe('list__unlove')
    expect(hasFavOnClass(wrapper)).toBe(true)
  })

  it('本地文件（没有 QQ 歌曲 ID）→ 不渲染这个键', () => {
    const wrapper = mountBtns({ musicInfo: localSong })

    expect(heartBtn(wrapper).exists()).toBe(false)
  })

  it('没传 favBtn 的调用方（本地列表 / 下载页）→ 不渲染这个键', () => {
    const wrapper = mountBtns({ musicInfo: txSong('1'), favBtn: false })

    expect(heartBtn(wrapper).exists()).toBe(false)
  })
})
