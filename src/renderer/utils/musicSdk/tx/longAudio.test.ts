import { beforeEach, describe, expect, it, vi } from 'vitest'
import longAudio from './longAudio'

/**
 * 长音频（节目专辑）数据层的钉子（2026-09-26）。
 *
 * 这层只干两件事：**找节目专辑**（feed 热门节目楼层 / 搜索 search_type=15）。
 * 单集与播放复用既有 /album 页，所以这里不测单集。
 *
 * 钉住三件在探针里踩过的、纯本地就能证的事（探针记录见
 * `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-radio.md`）：
 *
 *   1. **入参映射**：feed 走 **android** 档案（WEB 档案没有节目楼层）；
 *      搜索走桌面端点 + `search_type=15`（18 被服务端当成 0，不能用）。
 *   2. **卡片判据**：`type=400 且 subtype=410 且 jumptype=10025` —— 数字专辑楼层
 *      （type=400 / subtype=416 / jumptype=10002）必须一条都不能进来。
 *   3. **失败降级**：未登录抛「QQ 音乐未登录」（UI 据此提示登录）；网关码非 0 抛带码的错误；
 *      响应缺字段时给空列表而不是崩；空关键词不发请求。
 *
 * 真实接口不在测试里打（本机约定：不伪造凭证、不打真接口）。
 */

const { txCgi, getQQCredential } = vi.hoisted(() => ({ txCgi: vi.fn(), getQQCredential: vi.fn() }))

vi.mock('./utils/request', () => ({
  txCgi,
  // 把档案名带进 comm：本文件的第一条钉子就是「feed 必须走 android」
  buildComm: (_credential: unknown, profile = 'web') => ({ uin: '10000', profile }),
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential }))
// `./musicSearch` 只为 searchid 生成器而引入；它自身 import 了 `../../request`（needle）与
// `../../../index`（渲染侧 utils 总入口，顶层碰 document）——整块换掉，只留形状正确的替身
vi.mock('./musicSearch', () => ({
  default: { getSearchId: () => 'A'.repeat(32) + '00001' },
}))
// `../../index` 顶层就 `document.getElementsByTagName('title')`（渲染侧 utils 总入口）：node
// 环境没有 document。本文件只用它导出的 decodeName（实现依赖 window.DOMParser），给同形状替身。
vi.mock('../../index', () => ({
  decodeName: (str: unknown) => (str == null ? '' : String(str)),
}))

const node = (payload: Record<string, unknown>) => ({
  promise: Promise.resolve(payload),
  cancelHttp: () => {},
})

const lastTarget = () => txCgi.mock.calls.at(-1)![0]
const lastComm = () => txCgi.mock.calls.at(-1)![1]

/** 一张 feed 卡片的最小形状（字段名照真机响应）。 */
const card = (overrides: Record<string, unknown> = {}) => ({
  type: 400,
  subtype: 410,
  jumptype: 10025,
  id: '70018412',
  title: '活着活着就老了|冯唐百万销量之作',
  cover: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000001kdjSB4W8DWv_3.jpg',
  cnt: 940917,
  ...overrides,
})

const feedNode = (cards: Array<Record<string, unknown>>) => node({
  code: 0,
  data: { v_shelf: [{ id: 272, v_niche: [{ v_card: cards }] }] },
})

beforeEach(() => {
  txCgi.mockReset()
  getQQCredential.mockReset()
  getQQCredential.mockResolvedValue({ musicid: '10000', musickey: 'k', encryptUin: 'e' })
})

describe('getHotAlbums（首页 feed 的节目楼层）', () => {
  it('走安卓档案打 feed：走 WEB 档案就拿不到节目楼层（探针实测只有 2 个楼层）', async() => {
    txCgi.mockReturnValue(feedNode([card()]))

    await longAudio.getHotAlbums()

    expect(lastComm().profile).toBe('android')
    expect(lastTarget()).toEqual({
      module: 'music.recommend.RecommendFeed',
      method: 'get_recommend_feed',
      param: { direction: 0, page: 1, s_num: 0, v_cache: [] },
    })
  })

  it('只收 type=400/subtype=410/jumptype=10025 的卡：数字专辑楼层（416/10002）一条都不进来', async() => {
    txCgi.mockReturnValue(feedNode([
      card(),
      // 数字专辑热卖中：同 type=400，但 subtype/jumptype 不同，scheme 是 h5 售卖页
      card({ subtype: 416, jumptype: 10002, id: '001', title: '某数字专辑' }),
      // 单曲卡 / 歌单卡
      card({ type: 200, subtype: 0, jumptype: 0, id: '002' }),
      card({ type: 500, subtype: 0, jumptype: 10014, id: '003' }),
    ]))

    const res = await longAudio.getHotAlbums()

    expect(res.list).toHaveLength(1)
    expect(res.list[0]).toEqual({
      id: '70018412',
      mid: '',
      name: '活着活着就老了|冯唐百万销量之作',
      img: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000001kdjSB4W8DWv_3.jpg',
      singer: '',
      total: 0,
      playCount: 940917,
      publishDate: '',
      source: 'tx',
    })
    expect(res.total).toBe(1)
  })

  it('卡片字段缺失不致崩：title/cover/cnt 缺了给空串与 0', async() => {
    txCgi.mockReturnValue(feedNode([card({ title: undefined, cover: undefined, cnt: undefined })]))

    const res = await longAudio.getHotAlbums()

    expect(res.list[0]).toMatchObject({ name: '', img: '', playCount: 0 })
  })

  it('同一 id 重复推两次只留一条（按 id 去重）', async() => {
    txCgi.mockReturnValue(feedNode([card(), card({ title: '重复卡' })]))

    const res = await longAudio.getHotAlbums()

    expect(res.list).toHaveLength(1)
  })

  it('没有节目楼层（WEB 档案形状 / 服务端改版）→ 空列表，不抛', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { v_shelf: [{ id: 201, v_niche: [{ v_card: [{ type: 500 }] }] }] } }))

    const res = await longAudio.getHotAlbums()

    expect(res).toEqual({ list: [], total: 0, source: 'tx' })
  })

  it('网关码非 0 → 抛带码的错误（别把失败当空列表）', async() => {
    txCgi.mockReturnValue(node({ code: 104009 }))

    await expect(longAudio.getHotAlbums()).rejects.toThrow('QQ 接口错误（104009）')
  })

  it('未登录：抛「QQ 音乐未登录」（UI 靠这句换成「请先登录 QQ 音乐」）', async() => {
    getQQCredential.mockResolvedValue(null)

    await expect(longAudio.getHotAlbums()).rejects.toThrow('QQ 音乐未登录')
    expect(txCgi).not.toHaveBeenCalled()
  })
})

describe('searchAlbums（search_type=15 节目专辑）', () => {
  const searchNode = (list: Array<Record<string, unknown>>, estimate = 511) => node({
    code: 0,
    data: { body: { album: { list } }, meta: { estimate_sum: estimate } },
  })

  const album = (overrides: Record<string, unknown> = {}) => ({
    albumID: 29145437,
    albumMID: '001gXf3z1q1VAH',
    albumName: '【日更5集】仙逆｜多人演播',
    albumPic: 'http://y.gtimg.cn/music/photo_new/T002R180x180M000001gXf3z1q1VAH_24.jpg',
    singerName: '曲中人有故事',
    song_count: 3559,
    publicTime: '2022-07-16',
    ...overrides,
  })

  it('入参映射：桌面端点 + search_type=15（18 会被当成 0，不能用）', async() => {
    txCgi.mockReturnValue(searchNode([album()]))

    await longAudio.searchAlbums('  仙逆  ', 2, 30)

    expect(lastTarget().method).toBe('DoSearchForQQMusicDesktop')
    expect(lastTarget().param).toMatchObject({
      query: '仙逆',
      search_type: 15,
      num_per_page: 30,
      page_num: 2,
      grp: 1,
      remoteplace: 'txt.newclient.top',
    })
    expect(lastTarget().param.searchid).toHaveLength(37)
    // 搜索与 feed 不同：走 WEB 档案（与本仓其余搜索/专辑接口同一套）
    expect(lastComm().profile).toBe('web')
  })

  it('条目映射：数字 id / mid / 集数 / 播讲人，封面按 mid 拼 500（不用 180 变体）', async() => {
    txCgi.mockReturnValue(searchNode([album()]))

    const res = await longAudio.searchAlbums('仙逆')

    expect(res.list[0]).toEqual({
      id: '29145437',
      mid: '001gXf3z1q1VAH',
      name: '【日更5集】仙逆｜多人演播',
      img: 'https://y.gtimg.cn/music/photo_new/T002R500x500M000001gXf3z1q1VAH.jpg',
      singer: '曲中人有故事',
      total: 3559,
      playCount: 0,
      publishDate: '2022-07-16',
      source: 'tx',
    })
    expect(res.total).toBe(511)
    expect(res.page).toBe(1)
    expect(res.limit).toBe(30)
  })

  it('total 认 meta.estimate_sum；hasMore 要「满页且未到总数」', async() => {
    // 一页只回 1 条（< limit）→ 即使估算总数很大也不算还有
    txCgi.mockReturnValue(searchNode([album()], 511))
    expect((await longAudio.searchAlbums('仙逆', 1, 30)).hasMore).toBe(false)

    // 满页（30 条）且 1*30 < 511 → 还有
    txCgi.mockReturnValue(searchNode(Array.from({ length: 30 }, (_, i) => album({ albumID: 1000 + i })), 511))
    expect((await longAudio.searchAlbums('仙逆', 1, 30)).hasMore).toBe(true)
  })

  it('空关键词不发请求，直接空列表（避免拿空串打网关）', async() => {
    const res = await longAudio.searchAlbums('   ')

    expect(txCgi).not.toHaveBeenCalled()
    expect(res).toEqual({ list: [], total: 0, page: 1, limit: 30, hasMore: false, source: 'tx' })
  })

  it('id 与 mid 都缺的条目丢掉（点进去也没有可用的专辑标识）', async() => {
    txCgi.mockReturnValue(searchNode([album({ albumID: '', albumMID: '' }), album()]))

    const res = await longAudio.searchAlbums('仙逆')

    expect(res.list).toHaveLength(1)
    expect(res.list[0].id).toBe('29145437')
  })

  it('响应缺 body/meta 时给空列表（不崩、也不谎报总数）', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: {} }))

    const res = await longAudio.searchAlbums('仙逆')

    expect(res.list).toEqual([])
    expect(res.total).toBe(0)
    expect(res.hasMore).toBe(false)
  })
})
