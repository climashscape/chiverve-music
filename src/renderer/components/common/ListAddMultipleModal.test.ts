import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as userAction from '@renderer/store/user/action'
import ListAddMultipleModal from './ListAddMultipleModal.vue'
import { createdLists, labels as userLabels } from '@renderer/store/user/state'
import { userLists } from '@renderer/store/list/state'

/**
 * 批量「添加到…」弹窗（ui-polish-3 工单 06）。
 *
 * 与单曲那个弹窗同一套结论（同一份结构，这里钉住批量那两条特有的事）：
 *   1. 批量**不做「我喜欢」**——「喜欢了没」是逐首状态，一个键没法如实表达「有的喜欢了、有的没有」，
 *      所以这里只有「加入歌单」（本用例反着钉：没有 `list_add__cloud_fav` 这个键）；
 *   2. 去处仍是「QQ/本地」两条：云端那一组要把选中的歌**过滤成能进云端的**再整批写
 *      （本地文件混进去会让整批失败），一首都不能进云端时不给死键、改说一句为什么。
 */

const { addSongToList, addListMusics } = vi.hoisted(() => ({
  addSongToList: vi.fn(),
  addListMusics: vi.fn(),
}))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { songList: { addSongToList } } },
}))

vi.mock('@renderer/store/list/action', () => ({
  addListMusics,
  moveListMusics: vi.fn(),
  createUserList: vi.fn(),
}))

// 只把「首次打开时懒加载云端歌单」那一下换掉（同单曲弹窗的用例）
vi.mock('@renderer/store/user/action', async(importOriginal) => ({
  ...await importOriginal<typeof userAction>(),
  initUserCenter: vi.fn(),
}))

const $t = (key: string) => key

const onlineSong = (id: string, name: string) => ({
  id: `tx_${id}`,
  name,
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id, songType: 0 },
}) as any

const localFile = {
  id: 'local_1',
  name: '本地文件',
  singer: '歌手',
  source: 'local',
  interval: '03:00',
  meta: {},
} as any

const cloudCard = {
  id: '9782527408',
  dirId: '126',
  name: '云端歌单A',
  img: '',
  author: '我',
  total: '3',
  time: '',
  desc: null,
  source: 'tx',
} as any

const mountModal = async(musicList: any[]) => {
  const wrapper = mount(ListAddMultipleModal, {
    props: { show: false, musicList, bgClose: false },
    global: {
      mocks: { $t },
      stubs: {
        'material-modal': { template: '<div class="modal"><slot /></div>' },
        'base-btn': {
          template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          props: ['disabled'],
          emits: ['click'],
        },
        'base-input': { template: '<input />' },
      },
    },
  })
  await wrapper.setProps({ show: true })
  return wrapper
}

const btnByText = (wrapper: any, text: string) =>
  wrapper.findAll('button').find((btn: any) => btn.text() === text)

beforeEach(() => {
  vi.clearAllMocks()
  addSongToList.mockResolvedValue(true)
  userLists.splice(0, userLists.length, { id: 'user_1', name: '本地列表A' } as any)
  createdLists.splice(0, createdLists.length, cloudCard)
  userLabels.createdLists = ''
})

describe('components/common/ListAddMultipleModal.vue', () => {
  it('批量里没有「我喜欢」键（逐首状态没法用一个键表达），只有两处「加入歌单」', async() => {
    const wrapper = await mountModal([onlineSong('1', '歌1'), onlineSong('2', '歌2')])

    expect(wrapper.text()).not.toContain('list_add__cloud_fav')
    expect(wrapper.text()).toContain('playlists__local_group')
    expect(wrapper.text()).toContain('playlists__cloud_group')
  })

  it('QQ 云端自建歌单：整批写（本地文件被挑出去，不拖垮整批）', async() => {
    const wrapper = await mountModal([onlineSong('1', '歌1'), localFile, onlineSong('2', '歌2')])

    await btnByText(wrapper, '云端歌单A').trigger('click')

    expect(addSongToList).toHaveBeenCalledTimes(1)
    expect(addSongToList).toHaveBeenCalledWith(126, [
      { songId: 1, songType: 0 },
      { songId: 2, songType: 0 },
    ], 9782527408)
    // 没写本地列表
    expect(addListMusics).not.toHaveBeenCalled()
  })

  it('选中的一首都不能进云端（全是本地文件）→ 不给死键，改成一句说明', async() => {
    const wrapper = await mountModal([localFile])

    expect(btnByText(wrapper, '云端歌单A')).toBeUndefined()
    expect(wrapper.find('p').text().length).toBeGreaterThan(0)
  })

  it('本地自建列表照旧可用：整批加到那个列表', async() => {
    const wrapper = await mountModal([onlineSong('1', '歌1'), onlineSong('2', '歌2')])

    await btnByText(wrapper, '本地列表A').trigger('click')

    expect(addListMusics).toHaveBeenCalledTimes(1)
    expect(addListMusics.mock.calls[0][0]).toBe('user_1')
    expect(addListMusics.mock.calls[0][1]).toHaveLength(2)
    expect(addSongToList).not.toHaveBeenCalled()
  })
})
