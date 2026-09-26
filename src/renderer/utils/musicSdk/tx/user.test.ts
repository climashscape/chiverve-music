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
 * 3. 卡片「总数」：`GetPlaylistByUin` 的**实测字段是 `songNum`（驼峰）**，旧实现只读小写 `songnum`
 *    → 自建 / 收藏歌单卡片的总数恒为空。两种拼法都要认（见 `user.js` 的 `pickCardTotal`），
 *    这里用「真机字段 / 历史字段 / 两个都没有」三行对照把口径钉住。
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
  return {
    ...common,
    formatPlayCount: (num: unknown) => String(num),
    // `musicSdk/utils.js` 的 formatSingerName 会用它（`createSong` 的歌手名走那条路）——
    // 本文件新加的 getFavSong 用例会真的造出歌曲对象，所以给个同名实现（同 songList.test.ts）
    decodeName: (str: unknown) => str,
  }
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

describe('tx/user 的卡片总数（行里的字段是 songNum 驼峰 —— 2026-09-24 真机实测）', () => {
  it('getCreatedSonglist：认 songNum（真机字段）、songnum（历史字段），两者都缺才留空', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: {
        total: 53,
        v_playlist: [
          { dirId: FAV_DIR_ID, tid: 3802852742, dirName: '我喜欢', songNum: 928 },
          { dirId: 126, tid: 9782527408, dirName: '旧拼法', songnum: 0 },
          { dirId: 127, tid: 9782527409, dirName: '两个都没有' },
        ],
      },
    }))

    const res = await user.getCreatedSonglist()

    // 0 也要落成 '0'（空歌单是「0 首」，不是「没有这个字段」）
    expect(res.list.map((item: any) => item.total)).toEqual(['928', '0', ''])
  })

  it('getFavAlbum：同一口径（收藏专辑侧参考实现是直读小写，两种都留）', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: { total: 2, v_list: [{ mid: 'mid1', name: 'A', songNum: 12 }, { mid: 'mid2', name: 'B', songnum: 7 }] },
    }))

    const res = await user.getFavAlbum()

    expect(res.list.map((item: any) => item.total)).toEqual(['12', '7'])
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

/**
 * 「我喜欢」的**总数接线**（ui-polish-followups 票 17 接缝 1 的调用点侧）。
 *
 * 解析本身在 `utils/songlistTotal.test.ts` 钉；这里钉本文件确实用它、且**兜底值是 0**
 * （`tx/songList.js` 的 `getListDetailByCgi` 那一侧兜底本页条数，两处不同，别被「统一」掉）。
 * 这条不是纸上推演：`getFavSongIds` 的翻页结束判据就是它——取成本页条数会让 id 集合
 * 只拉到第一页（收藏态误判 → 点「取消喜欢」反而去收藏）。
 *
 * 期望值来源：真机读数（「我喜欢」`total_song_num=928`、每页 30 条，见本文件头部记录），
 * 响应形状按 `CgiGetDiss` 的记录（`data.dirinfo` + `data.songlist` + 总数字段）。
 */
describe('tx/user 的「我喜欢」总数（getFavSong）', () => {
  /** `createSong` 要读的字段（`tx/utils/song.js`）：id / mid / title / singer / album / file */
  const RAW_SONG = {
    id: 280251533,
    mid: '001Qu4J42yg8uu',
    type: 0,
    title: '歌名',
    interval: 180,
    singer: [{ name: '歌手', mid: 'singer1' }],
    album: { mid: 'album1', name: '专辑' },
    file: { media_mid: 'media1', size_128mp3: 1024 },
  }

  it('总数取 total_song_num，不取 songlist_size（本页 30 条时总数不是 30）', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: {
        dirinfo: { title: '我喜欢', picurl: '', desc: '', listennum: 0 },
        songlist: [RAW_SONG],
        total_song_num: 928,
        songlist_size: 30,
      },
    }))

    const res = await user.getFavSong(1, 30)

    expect(res.total).toBe(928)
    expect(res.list).toHaveLength(1)
  })

  it('total_song_num 缺失 → 兜底 0（本文件不拿本页条数当总数）', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: { dirinfo: {}, songlist: [RAW_SONG] },
    }))

    const res = await user.getFavSong(1, 30)

    expect(res.total).toBe(0)
  })
})

/**
 * 粉丝 / 关注用户 / 好友（资料类能力·读侧，2026-09-26）。
 *
 * 期望形状全部来自真机探针（记录见
 * `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-friends.md`），三条最容易写错的：
 *   1. **分页键不同**：粉丝 / 关注用户是 `From`（偏移量 = (page-1)*num），好友是 `Page`（**0 起**）。
 *   2. **`HasMore` 的类型不同**：关注关系是布尔，好友是 int（0/1）——判据写错会让「加载更多」永远不出现。
 *   3. **好友 0 条时 `Friends` 是 `null`（不是 `[]`）**——直接 `.map` 会炸。
 */
describe('tx/user 的粉丝 / 关注用户（GetFansList / GetFollowUserList）', () => {
  /** 一行关注关系（字段名照真机响应；`MID` 实测恒为空串）。 */
  const ROW = {
    EncUin: 'enc_uin_1',
    Name: '昵称',
    AvatarUrl: 'https://pic6.y.qq.com/x.jpg',
    Desc: '简介',
    FanNum: 8,
    IsFollow: false,
    BeFollowed: true,
    MID: '',
  }

  it('getFans：走 RelationList/GetFansList，From 是偏移量（第 3 页 / 每页 30 → From=60）', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { List: [ROW], Total: 12, HasMore: false } }))

    const res = await user.getFans(3, 30)

    expect(txCgi.mock.calls.at(-1)![0]).toMatchObject({
      module: 'music.concern.RelationList',
      method: 'GetFansList',
      param: { HostUin: 'e', From: 60, Size: 30 },
    })
    expect(res).toMatchObject({ total: 12, page: 3, limit: 30, hasMore: false })
  })

  it('getFollowUsers：同一模块的另一个方法（与「关注的歌手」不是一口）', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { List: [], Total: 9, HasMore: true } }))

    const res = await user.getFollowUsers(1, 30)

    expect(txCgi.mock.calls.at(-1)![0]).toMatchObject({
      module: 'music.concern.RelationList',
      method: 'GetFollowUserList',
    })
    expect(res.hasMore).toBe(true)
  })

  it('行映射：id 取 EncUin（**不是恒空的 MID**）、关注态两个布尔分得很清', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { List: [ROW], Total: 1, HasMore: false } }))

    const [item] = (await user.getFans(1, 30)).list

    expect(item).toEqual({
      id: 'enc_uin_1',
      name: '昵称',
      img: 'https://pic6.y.qq.com/x.jpg',
      desc: '简介',
      fans: 8,
      isFollow: false,
      isFollowed: true,
      source: 'tx',
    })
  })

  it('关注态是**严判**：`0` / 字符串这类真值形态不会被当成「已关注」', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: { List: [ROW, { EncUin: 'x', IsFollow: 1, BeFollowed: '1' }], Total: 2, HasMore: false },
    }))

    const list = (await user.getFans(1, 30)).list

    expect(list.map((item: any) => [item.isFollow, item.isFollowed])).toEqual([[false, true], [false, false]])
    // 缺 Name/AvatarUrl 时落空串而不是 undefined（界面直接绑，undefined 会渲染成 "undefined"）
    expect(list[1]).toMatchObject({ name: '', img: '', fans: 0 })
  })

  it('空列表：`List` 缺失也算空，不炸', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: {} }))

    const res = await user.getFans(1, 30)

    expect(res.list).toEqual([])
    expect(res.total).toBe(0)
  })
})

describe('tx/user 的 QQ 好友（GetFriendList——页码 0 起、无总数）', () => {
  it('分页是页码：第 1 页 → Page=0（不是 1），PageSize 是本页条数', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { Friends: null, HasMore: 0 } }))

    const res = await user.getFriends(1, 30)

    expect(txCgi.mock.calls.at(-1)![0]).toMatchObject({
      module: 'music.homepage.Friendship',
      method: 'GetFriendList',
      param: { Page: 0, PageSize: 30 },
    })
    expect(res).toMatchObject({ total: null, page: 1, hasMore: false })
  })

  it('第 2 页 → Page=1', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { Friends: null, HasMore: 1 } }))

    await user.getFriends(2, 30)

    expect(txCgi.mock.calls.at(-1)![0].param).toMatchObject({ Page: 1 })
  })

  it('0 好友：`Friends` 是 null（不是 []）→ 空列表；`HasMore` 是 int，`=== 1` 才算有更多', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { Friends: null, HasMore: 0 } }))
    await expect(user.getFriends(1, 30)).resolves.toMatchObject({ list: [], hasMore: false })

    txCgi.mockReturnValue(node({ code: 0, data: { Friends: [], HasMore: 1 } }))
    await expect(user.getFriends(1, 30)).resolves.toMatchObject({ list: [], hasMore: true })
  })

  it('行映射：认 fork 模型的 EncryptUin/UserName，也认关注关系那套拼法', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: {
        Friends: [
          { EncryptUin: 'friend_1', UserName: '好友甲', AvatarUrl: 'https://thirdqq.qlogo.cn/a.jpg', IsFollow: true },
          { EncUin: 'friend_2', Name: '好友乙' },
        ],
        HasMore: 0,
      },
    }))

    const res = await user.getFriends(1, 30)

    expect(res.list[0]).toMatchObject({ id: 'friend_1', name: '好友甲', isFollow: true, isFollowed: false })
    expect(res.list[1]).toMatchObject({ id: 'friend_2', name: '好友乙', isFollow: false, fans: 0 })
  })
})
