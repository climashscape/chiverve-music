import { describe, expect, it, vi } from 'vitest'
import useMenu from './useMenu'

/**
 * 本地列表歌曲表右键菜单里「歌曲详情」的显隐（ui-polish-followups 工单 03）。
 *
 * 本仓的口径是**本地文件不出现在线相关的菜单项**（显示成灰的等于「点了没反应」）——跳转 / 分享那几项
 * 本来就是这么写的（`hide`），这里把 `sourceDetail` 也从 `disabled` 改成同一套：
 * 判据仍是「源有没有 `getMusicDetailPageUrl`」，本地源没有 → 不出现。
 *
 * 菜单项点下去进哪一页由 `useMusicJump.test.ts` 钉；这里只管**显不显示**。
 */
vi.mock('@renderer/utils/musicSdk', () => ({ default: { tx: { getMusicDetailPageUrl: () => 'https://y.qq.com/x.html' } } }))
vi.mock('@renderer/plugins/i18n', () => ({ useI18n: () => (key: string) => key }))
vi.mock('@renderer/core/dislikeList', () => ({ hasDislike: () => false }))
vi.mock('@renderer/utils/compositions/useFavSong', () => ({
  default: () => ({ canFav: () => false, favTitle: () => '', toggleFav: vi.fn(), loadFavState: vi.fn() }),
}))

/** 整个菜单只为本用例关心的一项：其余处理函数给空桩（本用例不点任何菜单项） */
// `assertApiSupport` 是**注入**的（`index.vue` 传 `store/utils.ts` 的那个），默认桩「源声明了音质档位」
const createMenu = (assertApiSupport: () => boolean = () => true) => useMenu({
  assertApiSupport,
  emit: vi.fn(),
  handleShowDownloadModal: vi.fn(),
  handlePlayMusic: vi.fn(),
  handlePlayMusicLater: vi.fn(),
  handleSearch: vi.fn(),
  handleShowMusicAddModal: vi.fn(),
  handleShowMusicMoveModal: vi.fn(),
  handleShowSortModal: vi.fn(),
  handleOpenMusicDetail: vi.fn(),
  handleCopyName: vi.fn(),
  handleDislikeMusic: vi.fn(),
  handleRemoveMusic: vi.fn(),
  handleJumpAlbum: vi.fn(),
  handleJumpSinger: vi.fn(),
  handleCopyLink: vi.fn(),
  handleOpenInQqMusic: vi.fn(),
})

/** 菜单项的 `hide`（渲染层是 `v-show="!item.hide"`）；没有这项时返回 undefined，用例会因此失败 */
const sourceDetailOf = (menus: any[]) => menus.find(item => item.action == 'sourceDetail')
/** 菜单项的 `disabled`（渲染层是 `:disabled="item.disabled"`） */
const downloadOf = (menus: any[]) => menus.find(item => item.action == 'download')

describe('ListMusicTable 右键菜单的「歌曲详情」', () => {
  it('在线歌曲：出现（点了进本仓的歌曲详情页）', () => {
    const { menus, showMenu } = createMenu()

    showMenu({ pageX: 0, pageY: 0 }, { source: 'tx', meta: { songId: '001Qu4J42yg8uu' } })

    expect(sourceDetailOf(menus.value)?.hide).toBeFalsy()
  })

  it('本地文件：不出现（没有在线 mid，进不了本仓详情页）', () => {
    const { menus, showMenu } = createMenu()

    showMenu({ pageX: 0, pageY: 0 }, { source: 'local', meta: { songId: '/music/song.mp3' } })

    expect(sourceDetailOf(menus.value)?.hide).toBe(true)
  })
})

/**
 * 动作可用性的组合（ui-polish-followups 票 17 接缝 3）：**下载**这一项同时看两件事——
 * `assertApiSupport(source)`（源声明了音质档位）**且** `source != 'local'`。
 *
 * 为什么要钉「本地」那一行：`assertApiSupport('local')` 的真实返回值就是 **true**
 * （`store/utils.ts` 的 `source == 'local' || qualityList[source] != null`，那是给播放用的），
 * 所以只判 `assertApiSupport` 会给本地文件开出一个点了没意义的下载项。本用例注入的
 * `() => true` 桩**就是** `assertApiSupport('local')` 的真实结果。
 *
 * 期望值来源：`useMenu.js:149`（`itemMenuControl.download = assertApiSupport(...) && source != 'local'`）
 * 与 `index.vue:71` 的行内键同一表达式；`store/utils.test.ts` 另钉 `assertApiSupport` 自身的语义。
 */
describe('ListMusicTable 右键菜单的「下载」可用性（本地 vs 在线）', () => {
  it('在线歌曲 + 源声明了音质档位 → 可下载', () => {
    const { menus, showMenu } = createMenu()

    showMenu({ pageX: 0, pageY: 0 }, { source: 'tx', meta: { songId: '001Qu4J42yg8uu' } })

    expect(downloadOf(menus.value)?.disabled).toBe(false)
  })

  it('在线歌曲但源没声明音质档位（assertApiSupport 为 false）→ 不可下载', () => {
    const { menus, showMenu } = createMenu(() => false)

    showMenu({ pageX: 0, pageY: 0 }, { source: 'tx', meta: { songId: '001Qu4J42yg8uu' } })

    expect(downloadOf(menus.value)?.disabled).toBe(true)
  })

  it('本地文件 → 不可下载（即使 assertApiSupport 为 true，挡住它的是 != local 那一半）', () => {
    const { menus, showMenu } = createMenu()

    showMenu({ pageX: 0, pageY: 0 }, { source: 'local', meta: { songId: '/music/song.mp3' } })

    expect(downloadOf(menus.value)?.disabled).toBe(true)
  })
})
