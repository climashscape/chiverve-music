import { beforeEach, describe, expect, it, vi } from 'vitest'
import user, { FAV_DIR_ID, pickFavDirTid } from './user'

/**
 * 「我喜欢」的两处**读取侧**钉子（ui-polish-3 工单 09）——都是「让写路径拿到正确的值」的前置：
 *
 * 1. `getFavSongIds`（收藏态全量 id 集合）：页数上限旧写法写死 40 页 = 1200 首，超过就**静默截断**；
 *    截断的后果是「已收藏」判成「未收藏」→ 点「取消喜欢」反而去收藏（点反方向）。
 *    现在按服务端给的 `total_song_num` 拉够就停，硬上限只作防死循环用。
 * 2. `getFavDirTid`（「我喜欢」的真实 tid）：写接口要带它。**不能把 dirId 201 当 tid 用**
 *    ——旧卡片映射（`toPlaylistInfo`）在没有 tid 时会把 `id` 兜底成 dirId，兜底值当 tid 写会写错目标，
 *    所以这里从原始行取 `tid`，缺就是 0。
 *
 * 真接口不在测试里打（本机约定）；线上数值的复验步骤见票面清单。
 */

const { txCgi } = vi.hoisted(() => ({ txCgi: vi.fn() }))

vi.mock('./utils/request', () => ({
  txCgi,
  buildComm: () => ({ uin: '10000' }),
  requireCredential: async() => ({ musicid: '10000', encryptUin: 'e' }),
}))
// 歌手 mid 解析那条链（`./musicSearch`）本文件不碰：换成桩，免得把搜索层拉进来
vi.mock('./musicSearch', () => ({ default: { musicSearch: vi.fn() } }))
// `../../index`（= src/renderer/utils/index）的总入口在模块顶层就碰 `document`
// （node 环境没有），只取其中的纯函数。注意 specifier 要按**本测试文件**的位置算：
// `user.js` 写的是 `'../../index'`、`tx/utils/song.js` 写的是 `'../../../index'`，
// 两者解析到的是同一个模块，这里按前者的写法注册即可。
vi.mock('../../index', async() => {
  const common = await import('@common/utils/common')
  return { ...common, formatPlayCount: (num: unknown) => String(num) }
})

const node = (payload: Record<string, unknown>) => ({
  promise: Promise.resolve(payload),
  cancelHttp: () => {},
})

/** 一页我喜欢：只要 `songId`（`getFavSongIds` 只读它）。 */
// 只造 `getFavSongIds` 真正读的两个字段；其余字段（page/limit/source/info…）与实现无关，
// 所以这里显式放宽成 any —— 否则 mock 的返回类型对不上 `getFavSong` 的完整签名，
// 而 `src/renderer/**` 下的测试文件会被构建期 ts-loader 一起做类型检查（TS2345/TS2322 让 build 失败）
const page = (count: number, total: number, offset = 0): any => ({
  list: Array.from({ length: count }, (_, i) => ({ songId: offset + i + 1 })),
  total,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tx/user 的 pickFavDirTid（从 GetPlaylistByUin 的原始行取「我喜欢」的 tid）', () => {
  it('取 dirId=201 那一行的 tid（字符串/数字都认）', () => {
    expect(pickFavDirTid([{ dirId: 126, tid: 9782527408 }, { dirId: 201, tid: 3802852742 }])).toBe(3802852742)
    expect(pickFavDirTid([{ dirId: '201', tid: '3802852742' }])).toBe(3802852742)
  })

  it('没有 tid 时回 0，**不把 dirId 201 当 tid**（兜底值会写错目标）', () => {
    expect(pickFavDirTid([{ dirId: 201, tid: null }])).toBe(0)
    expect(pickFavDirTid([{ dirId: 201 }])).toBe(0)
    expect(pickFavDirTid([])).toBe(0)
    expect(pickFavDirTid(undefined)).toBe(0)
  })

  it('getFavDirTid 走 GetPlaylistByUin，且用的就是 dirId=201 那一行', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: { v_playlist: [{ dirId: 126, tid: 9782527408 }, { dirId: FAV_DIR_ID, tid: 3802852742 }] },
    }))

    await expect(user.getFavDirTid()).resolves.toBe(3802852742)
    expect(txCgi.mock.calls.at(-1)![0]).toMatchObject({
      module: 'music.musicasset.PlaylistBaseRead',
      method: 'GetPlaylistByUin',
    })
  })
})

describe('tx/user 的 getFavSongIds（收藏态全量 id 集合）', () => {
  it('按 total 拉够就停：70 首 / 每页 30 → 只打 3 次', async() => {
    const spy = vi.spyOn(user, 'getFavSong').mockImplementation(async(pageNo = 1) =>
      pageNo === 3 ? page(10, 70, 60) : page(30, 70, (pageNo - 1) * 30))

    const ids = await user.getFavSongIds()

    expect(ids).toHaveLength(70)
    expect(spy).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })

  it('id 一律字符串（与 store 的收藏态比对同形）', async() => {
    const spy = vi.spyOn(user, 'getFavSong').mockImplementation(async() => page(2, 2))

    await expect(user.getFavSongIds()).resolves.toEqual(['1', '2'])
    spy.mockRestore()
  })

  it('total 拿不到（0/NaN）也不死循环：撞硬上限 1800 条并留一行日志', async() => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const spy = vi.spyOn(user, 'getFavSong').mockImplementation(async(pageNo = 1) =>
      page(30, Number.NaN, (pageNo - 1) * 30))

    const ids = await user.getFavSongIds()

    // MAX_PAGES = 60 页 × 每页 30 = 1800（防死循环，不是正常路径）
    expect(spy).toHaveBeenCalledTimes(60)
    expect(ids).toHaveLength(1800)
    expect(log).toHaveBeenCalledWith('[tx] 我喜欢的 id 集合撞到页数上限，可能截断', expect.objectContaining({ ids: 1800 }))
    spy.mockRestore()
  })
})
