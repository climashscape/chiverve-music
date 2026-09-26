import { beforeEach, describe, expect, it, vi } from 'vitest'
import songDetail from './songDetail'

/**
 * 歌曲详情页的两条**资料类**读取（2026-09-26 新增）：制作人 / 曲谱。
 *
 * 端点全部在 2026-09-26 用探针实测过，记录见
 * `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-sheet-producer.md`。这个文件钉住
 * 「本仓能证的四件事」（真接口不在测试里打：不伪造凭证、不打真接口）：
 *
 *   1. 制作人的**空态是 `Lst: []`，而 `code` 仍是 0**（实测「卡农」）——判据只能看列表；
 *      空 `Name` 的项与空 `Producers` 的组都要滤掉（否则 UI 会出现无名占位行）。
 *   2. 曲谱**没有曲谱是 `code=10007` + `result: null`**（实测「夜的钢琴曲五」），是业务码不是异常：
 *      返回空数组、不 throw；`code != 0` 的其他码也不 throw（这一块不该拖垮整页）。
 *   3. 曲谱条目**没有 `picURLs` 就丢掉**（实测 `ttype=2` 的虫虫钢琴只给 `.ccmz` 私有文件、没有图）：
 *      展示不了的不往上传。
 *   4. 请求形状：制作人走**带登录态的 web comm**（`songmid` 传 mid）；曲谱走**匿名 h5 comm**
 *      （不带 `uin`/`authst`，只认 `songMid` + `ttype=0`）——两边的 comm 不能对调。
 */

const { txCgi } = vi.hoisted(() => ({ txCgi: vi.fn() }))

vi.mock('./utils/request', () => ({
  txCgi,
  buildComm: (credential: Record<string, unknown>, profile = 'web') => ({ uin: credential.musicid, authst: credential.musickey, profile }),
  requireCredential: async() => ({ musicid: '10000', musickey: 'k', encryptUin: 'e' }),
}))
// `tx/utils/song.js` 走 `../../../index`（= src/renderer/utils）拿 formatPlayTime/sizeFormate，
// 那份入口在 node 环境下会碰 document；这里只需要 createSong 能跑，别把无关的模块带进来
vi.mock('../../../index', async() => {
  const common = await import('@common/utils/common')
  return { ...common, decodeName: (str: unknown) => str }
})
// `musicSdk/utils.js` 走的是**别名** `@renderer/utils`（同一个文件、另一个模块 id，相对路径那次
// mock 覆盖不到它）——不挡这一份，`renderer/utils/index.ts` 顶层的 `document` 就会把 node 环境打死
vi.mock('@renderer/utils', async() => {
  const common = await import('@common/utils/common')
  return { ...common, decodeName: (str: unknown) => str }
})

/** 响应节点：`{ promise, cancelHttp }`（`txCgi` 的返回形状），payload 是**模块节点**。 */
const node = (payload: Record<string, unknown>) => ({
  promise: Promise.resolve(payload),
  cancelHttp: () => {},
})

const targets = () => txCgi.mock.calls.map(call => call[0] as Record<string, any>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('tx/songDetail 的制作人（SongProducer）', () => {
  it('按职责分组映射（Title + Producers[].{Name,Icon,SingerMid}），丢掉空名字的项', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: {
        Lst: [
          { Title: '作词', Type: 1, Producers: [{ Name: '张三', Icon: 'https://img/1.jpg', SingerMid: 's1', Follow: 0, Scheme: 'x', Type: 1 }] },
          // 空名 + 只有名没有头像：前者丢、后者保留
          { Title: '作曲', Type: 1, Producers: [{ Name: '', Icon: '', SingerMid: '', Follow: 0, Scheme: '', Type: 1 }, { Name: '李四', Icon: '', SingerMid: '', Follow: 0, Scheme: '', Type: 1 }] },
          // 组里一个能显示的都没有 → 整组丢
          { Title: '混音', Type: 1, Producers: [] },
        ],
        ReinforceMsg: '来自 QQ 音乐',
      },
    }))

    const groups = await songDetail.getProducer('mid1')

    expect(groups).toEqual([
      { title: '作词', producers: [{ name: '张三', icon: 'https://img/1.jpg', singerMid: 's1' }] },
      { title: '作曲', producers: [{ name: '李四', icon: '', singerMid: '' }] },
    ])
  })

  it('🔴 没有制作人数据时 `Lst` 是空数组而 code 仍是 0 → 返回空数组（别拿 code 判）', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { Lst: [], ReinforceMsg: '' } }))

    await expect(songDetail.getProducer('mid1')).resolves.toEqual([])
  })

  it('请求形状：KolWorksTag/SongProducer + songmid 传 mid + 带登录态的 web comm', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { Lst: [] } }))

    await songDetail.getProducer('mid1')

    expect(targets()[0]).toEqual({
      module: 'music.sociality.KolWorksTag',
      method: 'SongProducer',
      param: { songmid: 'mid1' },
    })
    expect(txCgi.mock.calls[0][1]).toMatchObject({ uin: '10000', authst: 'k' })
  })
})

describe('tx/songDetail 的曲谱（GetMoreSheetMusic）', () => {
  const sheet = (scoreMID: string, pics: unknown[]) => ({
    scoreMID,
    scoreName: `谱${scoreMID}`,
    subName: '副标题',
    strInsType: '钢琴',
    strScoreType: '五线谱',
    coverURL: `https://img/${scoreMID}.png`,
    picURLs: pics,
  })

  it('字段映射 + pageCount 跟图片数一致', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: { result: [sheet('a', ['https://img/a1.jpg', 'https://img/a2.jpg'])], totalMap: {}, viewFrequencyByInsType: {} },
    }))

    await expect(songDetail.getSheetMusic('mid1')).resolves.toEqual([{
      id: 'a',
      name: '谱a',
      subName: '副标题',
      instrument: '钢琴',
      scoreType: '五线谱',
      cover: 'https://img/a.png',
      images: ['https://img/a1.jpg', 'https://img/a2.jpg'],
      pageCount: 2,
    }])
  })

  it('🔴 没有曲谱 = `code=10007` + `result: null`（实测）→ 空数组，不抛', async() => {
    txCgi.mockReturnValue(node({ code: 10007, data: { result: null, totalMap: {}, viewFrequencyByInsType: {} } }))

    await expect(songDetail.getSheetMusic('mid1')).resolves.toEqual([])
  })

  it('非 0 的其他码也返回空数组（这块不拖垮整页，失败文案由视图层落）', async() => {
    txCgi.mockReturnValue(node({ code: 40000, data: null }))

    await expect(songDetail.getSheetMusic('mid1')).resolves.toEqual([])
  })

  it('🔴 没有 `picURLs` 的条目丢掉（ttype=2 的虫虫钢琴只给 .ccmz 私有文件、没有图）', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: { result: [sheet('a', []), sheet('b', ['https://img/b1.jpg']), sheet('c', [null, ''])], totalMap: {}, viewFrequencyByInsType: {} },
    }))

    const list = await songDetail.getSheetMusic('mid1')

    // c 的 picURLs 全是空值 → 也丢；只剩 b
    expect(list.map((item: { id: string }) => item.id)).toEqual(['b'])
  })

  it('请求形状：SheetMusicSvr/GetMoreSheetMusic + 匿名 h5 comm（不带 uin/authst）+ ttype=0', async() => {
    txCgi.mockReturnValue(node({ code: 0, data: { result: [] } }))

    await songDetail.getSheetMusic('mid1')

    expect(targets()[0]).toEqual({
      module: 'music.mir.SheetMusicSvr',
      method: 'GetMoreSheetMusic',
      param: { songMid: 'mid1', begin: 0, end: 100, scoreType: -1, ttype: 0 },
    })
    const comm = txCgi.mock.calls[0][1] as Record<string, unknown>
    expect(comm).toMatchObject({ g_tk: 5381, uin: '', needNewCode: 1 })
    expect(comm.authst).toBeUndefined()
  })
})
