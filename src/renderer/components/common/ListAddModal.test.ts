import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as userAction from '@renderer/store/user/action'
import ListAddModal from './ListAddModal.vue'
import { createdLists, labels as userLabels } from '@renderer/store/user/state'
import { userLists } from '@renderer/store/list/state'

/**
 * 「添加到…」弹窗（ui-polish-3 工单 06）。
 *
 * 用户要求把它拆成两件事之后，这个弹窗只负责**加入歌单**，而且去处要「QQ/本地」两条都在：
 *   1. 「收藏到 QQ 音乐「我喜欢」」那个键**必须不在**了——它已独立成行内键 / 右键菜单 / 播放栏
 *      三个入口的一键开关（这是本票的回归点：以前弹窗是「混装」的）；
 *   2. 本地自建列表照旧在（点一下写本地列表）；
 *   3. QQ 云端自建歌单也在，点一下写云端（dirId 写、tid 比对，走 `addSongsToCloudList`）。
 *
 * 只把最外层 SDK 与「这首在哪些本地列表里」那个 IPC 换成桩，其余（store、写歌单的手续）都是真的。
 */

const { addSongToList } = vi.hoisted(() => ({ addSongToList: vi.fn() }))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { songList: { addSongToList } } },
}))

// 本地列表的存在性检查走主进程 IPC（测试环境没人应答），本票不关心它
const { addListMusics } = vi.hoisted(() => ({ addListMusics: vi.fn() }))
vi.mock('@renderer/store/list/action', () => ({
  addListMusics,
  moveListMusics: vi.fn(),
  createUserList: vi.fn(),
  getMusicExistListIds: vi.fn(async() => []),
}))

// 只把「首次打开时懒加载云端歌单」那一下换掉：本用例要自己摆好云端列表与文案，
// 真跑一次会去请求一堆账号接口并把文案改成「加载失败」
vi.mock('@renderer/store/user/action', async(importOriginal) => ({
  ...await importOriginal<typeof userAction>(),
  initUserCenter: vi.fn(),
}))

const $t = (key: string) => key

const song = {
  id: 'tx_1',
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id: '123456', songType: 0 },
} as any

/** 云端自建歌单卡片：`id` 是 tid、`dirId` 是写接口要的那个（两者不能混，见 store/user 的注释） */
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

const mountModal = async(musicInfo: any = song) => {
  const wrapper = mount(ListAddModal, {
    props: { show: false, musicInfo, bgClose: false },
    global: {
      mocks: { $t },
      stubs: {
        // 仓库里的 material-modal 是 teleport 到 #root 的（jsdom 里没有这个锚点，内容渲染不出来），
        // 这里换成透传插槽的壳——本用例断言的是弹窗**内容**
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
  // watcher 盯的是 props.show 的**变化**（真机上是 v-model:show 从 false 翻到 true）
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

describe('components/common/ListAddModal.vue', () => {
  it('弹窗里不再有「收藏到 QQ 音乐我喜欢」那个键', async() => {
    const wrapper = await mountModal()

    expect(wrapper.text()).not.toContain('list_add__cloud_fav')
    // 收藏键以前是一条单独的行（sourceRow），现在只剩两处「加入到哪里」
    expect(wrapper.text()).toContain('playlists__local_group')
    expect(wrapper.text()).toContain('playlists__cloud_group')
  })

  it('本地自建列表照旧在：点一下加到那个列表', async() => {
    const wrapper = await mountModal()

    await btnByText(wrapper, '本地列表A').trigger('click')

    expect(addListMusics).toHaveBeenCalledWith('user_1', [song])
    // 没走云端写接口
    expect(addSongToList).not.toHaveBeenCalled()
  })

  it('QQ 云端自建歌单也在：点一下走云端写（dirId + tid 都传对）', async() => {
    const wrapper = await mountModal()

    await btnByText(wrapper, '云端歌单A').trigger('click')

    expect(addSongToList).toHaveBeenCalledTimes(1)
    expect(addSongToList).toHaveBeenCalledWith(126, [{ songId: 123456, songType: 0 }], 9782527408)
    // 没写本地列表
    expect(addListMusics).not.toHaveBeenCalled()
  })

  it('这一首没有 QQ 歌曲 ID（本地文件）→ 云端那组不给死键，改成一句说明', async() => {
    const wrapper = await mountModal({ ...song, source: 'local', meta: {} })

    expect(btnByText(wrapper, '云端歌单A')).toBeUndefined()
    // 说明那句话（本组件里唯一一个 <p>）：说了为什么进不去，别让人以为坏了
    expect(wrapper.find('p').text().length).toBeGreaterThan(0)
  })

  it('云端歌单拉不到（未登录）→ 不给空按钮，落 store 里那句「请先登录 QQ 音乐」', async() => {
    createdLists.splice(0, createdLists.length)
    userLabels.createdLists = 'user_center__need_login'

    const wrapper = await mountModal()

    expect(btnByText(wrapper, '云端歌单A')).toBeUndefined()
    expect(wrapper.find('p').text()).toBe('user_center__need_login')
  })
})
