import { beforeEach, describe, expect, it, vi } from 'vitest'
import { favSongIds, favSongIdsLoaded, favSongs } from './state'
import { toggleFavSongToCloud } from './action'

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
  // total 归零：add/remove 成功后会「列表已加载才刷新」，这里不需要那次刷新
  favSongs.total = 0
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
