import { beforeEach, describe, expect, it, vi } from 'vitest'
import { favSongIds, favSongIdsLoaded, favSongs } from './state'
import { addFavSongToCloud, removeFavSongFromCloud, toggleFavSongToCloud } from './action'

/**
 * 「我喜欢」一键切换的**动作方向**（ui-polish-3 工单 06）。
 *
 * 真机要求是「按照具体的状态」：已在我喜欢里 → 移除，不在 → 加入。这条判据只有一处
 * （`toggleFavSongToCloud`），行内心形键 / 右键菜单 / 播放栏三个入口都走它，所以在这里钉住：
 *   1. 两个方向各走各的写接口，且**只**走一个；
 *   2. 收藏态还没加载时**先拉全量 id 再决定**——否则界面上那份文案还没到位，点下去会走反方向
 *      （该移除的又收藏一遍）；
 *   3. 拉不到（未登录）时不写任何东西，把错抛给调用方去弹「请先登录 QQ 音乐」。
 *
 * 只把最外层 SDK 换成桩，store 与状态写回都是真的。
 */

const { likeSong, unlikeSong, getFavSongIds } = vi.hoisted(() => ({
  likeSong: vi.fn(),
  unlikeSong: vi.fn(),
  getFavSongIds: vi.fn(),
}))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    tx: {
      songList: { likeSong, unlikeSong },
      user: { getFavSongIds },
    },
  },
}))

/** 在线歌曲对象：QQ 的 songId/songType 在 meta 里（见 common/utils/tools.ts 的映射） */
const song = (id: string) => ({
  id: `tx_${id}`,
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { id, songType: 0 },
}) as any

beforeEach(() => {
  vi.clearAllMocks()
  favSongIds.splice(0, favSongIds.length)
  favSongIdsLoaded.value = false
  // total 归零 = 「我收藏的歌曲」列表还没加载过：写成功后的就地更新不会动它
  // （本组用例只关心收藏态与写接口；列表就地更新那组会自己把 total 与列表铺好）
  favSongs.total = 0
  favSongs.list.splice(0, favSongs.list.length)
  getFavSongIds.mockResolvedValue([])
  likeSong.mockResolvedValue(true)
  unlikeSong.mockResolvedValue(true)
})

describe('store/user/action 的 toggleFavSongToCloud', () => {
  it('不在我喜欢里 → 加入（走 likeSong，不碰 unlikeSong），返回 true', async() => {
    await expect(toggleFavSongToCloud(song('1'))).resolves.toBe(true)

    expect(likeSong).toHaveBeenCalledTimes(1)
    expect(likeSong).toHaveBeenCalledWith([{ songId: 1, songType: 0 }])
    expect(unlikeSong).not.toHaveBeenCalled()
  })

  it('已在我喜欢里 → 移除（走 unlikeSong，不碰 likeSong），返回 false', async() => {
    favSongIds.push('1')
    favSongIdsLoaded.value = true

    await expect(toggleFavSongToCloud(song('1'))).resolves.toBe(false)

    expect(unlikeSong).toHaveBeenCalledTimes(1)
    expect(unlikeSong).toHaveBeenCalledWith([{ songId: 1, songType: 0 }])
    expect(likeSong).not.toHaveBeenCalled()
  })

  it('收藏态还没加载 → 先拉全量 id 再决定方向（不会点反）', async() => {
    // 服务端说这首已经在我喜欢里，但本地还没拉过（favSongIdsLoaded=false）
    getFavSongIds.mockResolvedValue(['1'])

    await toggleFavSongToCloud(song('1'))

    expect(getFavSongIds).toHaveBeenCalledTimes(1)
    expect(unlikeSong).toHaveBeenCalledTimes(1)
    expect(likeSong).not.toHaveBeenCalled()
  })

  it('拉不到收藏态（未登录）→ 抛给调用方，且一个写接口都不发', async() => {
    getFavSongIds.mockRejectedValue(new Error('QQ 音乐未登录'))

    await expect(toggleFavSongToCloud(song('1'))).rejects.toThrow('QQ 音乐未登录')

    expect(likeSong).not.toHaveBeenCalled()
    expect(unlikeSong).not.toHaveBeenCalled()
  })
})

/**
 * 写失败必须**带着 QQ 的错误码**抛出来（工单 09）。
 *
 * 真机症状是「点了没加也没移」——旧实现失败只回一个 false，`code`/`retCode`/`msg` 全被丢掉，
 * 弹窗只剩一句「添加失败」，用户贴回来也看不出是哪一步被拒。判据与文案收在
 * `isWriteOk` / `writeFailText` 两处（纯函数），这里连同旧形状（布尔）一起钉住。
 */
describe('store/user/action 的写失败诊断', () => {
  it('SDK 回诊断结构且 not ok → 抛出的文案带上 code / retCode / msg', async() => {
    favSongIdsLoaded.value = true
    likeSong.mockResolvedValue({ ok: false, code: 10006, retCode: 80092, msg: 'song not exist' })

    await expect(addFavSongToCloud(song('1'))).rejects.toThrow(/code=10006/)
    await expect(addFavSongToCloud(song('1'))).rejects.toThrow(/retCode=80092/)
    await expect(addFavSongToCloud(song('1'))).rejects.toThrow(/song not exist/)
    // 失败不能就地改收藏态（改了就成假成功）
    expect(favSongIds.includes('1')).toBe(false)
  })

  it('取消喜欢失败同理（带码抛给调用方）', async() => {
    favSongIdsLoaded.value = true
    unlikeSong.mockResolvedValue({ ok: false, code: null, retCode: 80092, msg: '' })

    await expect(removeFavSongFromCloud(song('1'))).rejects.toThrow(/retCode=80092/)
  })

  it('**被拒但 retCode 是 0**（真机实测形状 `code: 80105`）→ 照样抛，且不改收藏态', async() => {
    // 2026-09-24 真机实测：服务端拒绝时 `code: 80105` 而 `data.retCode: 0`。
    // SDK 两条都判之后这里才是 ok:false；store 这一层要保证「retCode 0」不能让它当成功放行。
    favSongIdsLoaded.value = true
    likeSong.mockResolvedValue({ ok: false, code: 80105, retCode: 0, msg: '' })

    await expect(addFavSongToCloud(song('1'))).rejects.toThrow(/code=80105/)
    expect(favSongIds.includes('1')).toBe(false)

    unlikeSong.mockResolvedValue({ ok: false, code: 80105, retCode: 0, msg: '' })
    favSongIds.push('1')
    await expect(removeFavSongFromCloud(song('1'))).rejects.toThrow(/code=80105/)
    expect(favSongIds.includes('1')).toBe(true)
  })

  it('旧形状（SDK 回布尔 true）仍然算成功——契约没收窄', async() => {
    likeSong.mockResolvedValue(true)

    await expect(addFavSongToCloud(song('1'))).resolves.toBeUndefined()
  })

  it('写成功 → 就地改收藏态，界面（行内键 / 菜单）立刻跟着变', async() => {
    favSongIdsLoaded.value = true
    likeSong.mockResolvedValue({ ok: true, code: 0, retCode: 0, msg: '' })

    await addFavSongToCloud(song('1'))

    expect(favSongIds.includes('1')).toBe(true)
  })
})

/**
 * 「我收藏的歌曲」列表的**就地更新**（2026-09-24 用户报障）。
 *
 * 现象：人在收藏页上，在别处点心收藏/取消，列表当场不变，切走再回来才看到。
 * 根因：写成功后那次「立刻重读」拿回来的是**服务端还没反映这次写的旧页**
 * （同 `favSongIds` 注释说的「这次收藏要等下次重拉才认」），正好把界面盖回原样。
 * 所以现在改成写成功即就地改列表——这组用例钉住它，并覆盖几种边界。
 */
const idsOf = () => favSongs.list.map((item: any) => item.meta.id)

describe('store/user/action 的「我收藏的歌曲」就地更新', () => {
  const seedList = (...ids: string[]) => {
    favSongs.list.splice(0, favSongs.list.length, ...ids.map(id => song(id)))
    favSongs.total = ids.length
  }

  it('收藏成功 → 新歌立刻出现在列表最前，total +1', async() => {
    seedList('9', '8')
    likeSong.mockResolvedValue({ ok: true, code: 0, retCode: 0, msg: '' })

    await addFavSongToCloud(song('1'))

    expect(idsOf()).toEqual(['1', '9', '8'])
    expect(favSongs.total).toBe(3)
  })

  it('取消喜欢成功 → 那一行立刻从列表移出，total -1', async() => {
    seedList('1', '9')
    unlikeSong.mockResolvedValue({ ok: true, code: 0, retCode: 0, msg: '' })

    await removeFavSongFromCloud(song('1'))

    expect(idsOf()).toEqual(['9'])
    expect(favSongs.total).toBe(1)
  })

  it('重复收藏同一首（已在列表里）→ 不重复插入、total 不加', async() => {
    seedList('1', '9')
    likeSong.mockResolvedValue(true)

    await addFavSongToCloud(song('1'))

    expect(idsOf()).toEqual(['1', '9'])
    expect(favSongs.total).toBe(2)
  })

  it('取消一首不在列表里的（列表只加载了第一页）→ 列表不动、total 不变', async() => {
    seedList('1', '9')
    unlikeSong.mockResolvedValue(true)

    await removeFavSongFromCloud(song('404'))

    expect(idsOf()).toEqual(['1', '9'])
    expect(favSongs.total).toBe(2)
  })

  it('列表还没加载过（total=0）→ 不往列表里塞东西（进页面会重拉）', async() => {
    likeSong.mockResolvedValue(true)

    await addFavSongToCloud(song('1'))

    expect(favSongs.list).toHaveLength(0)
    expect(favSongs.total).toBe(0)
  })

  it('写被拒（真机形状 code 80105 + retCode 0）→ 列表一行都不动', async() => {
    seedList('9')
    likeSong.mockResolvedValue({ ok: false, code: 80105, retCode: 0, msg: '' })

    await expect(addFavSongToCloud(song('1'))).rejects.toThrow()

    expect(idsOf()).toEqual(['9'])
    expect(favSongs.total).toBe(1)
  })
})
