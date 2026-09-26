import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestMsg } from '../../message'
import lyric, { matchDictEntries } from './lyric'

/**
 * 歌词词典（双击歌词里的词查释义）的钉子 —— 数据层 + 匹配规则。
 *
 * 端点实测记录：`scripts/verify/artifacts/2026-09-26-capabilities/NOTES-lyric-dict.md`
 * （探针 `scripts/verify/probe-qq/probe_lyric_dict.py`）。**真接口不在测试里打**
 * （本机约定：不伪造凭证、不打真接口），下面按探针实测形状造桩。
 *
 * 这个文件钉三件本地能证的事：
 *   1. **歌曲标识 → 请求参数**：`songmid` 要先换成数字 `songID`（`GetAIDictInfo` 只吃数字），
 *      已经带 `songId` 的不能再查一次详情；请求体形状（模块 / method / param）逐字符钉住。
 *   2. **响应归一化**：`dictList` 在「没有词典」时是 **`null`（不是 `[]`）**，而且 `code` 照样 0
 *      —— 必须归一化成数组，调用方才能只判长度；网关码非 0 要重试到上限后抛错，不能当成功。
 *   3. **「查不到」的降级**：`matchDictEntries` 不命中时返回 `[]`（界面据此显示「无释义」）。这是
 *      主路径之一——实测中文歌 / 日文歌都没有词典，而词条匹配本身也会落空（用户可能点任何词）。
 *
 * 匹配规则的四条优先级（exact → 整行 → 落在选区内 → 选区落在 phrase 内）在下面逐条钉住；
 * 其中「同一行两条词条」「两条 phrase 同时落在选区里」用**构造数据**（真实样例里没这么巧的行），
 * 已在用例里注明。
 */

const { httpFetch, getMusicInfo } = vi.hoisted(() => ({ httpFetch: vi.fn(), getMusicInfo: vi.fn() }))

// lyric.js 走的是渲染侧 needle 请求层；歌曲详情查询整块换掉（它自己也发请求）
vi.mock('../../request', () => ({ httpFetch }))
vi.mock('./musicInfo', () => ({ default: getMusicInfo }))

const DICT_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

/** 词条形状照探针实测的 5 个字段 */
const item = (phrase: string, lyricText = '', trans = '', ts = '[00:00.00]') => ({
  phrase,
  explain: `${phrase} 的释义`,
  lyric_text: lyricText,
  trans_lyric_text: trans,
  lyric_timestamp: ts,
})

/** Queen《Bohemian Rhapsody》的 5 条（探针实测摘录，songID=7137686） */
const BOHEMIAN = [
  item('silhouetto of a man', 'I see a little silhouetto of a man', '我看到一个小小的人影', '[03:06.95]'),
  item('poor boy', "I'm just a poor boy nobody loves me", '但我只是个穷小孩 没有人爱我', '[03:23.75]'),
  item('let you go', 'We will not let you go', '我们不会放你走', '[03:42.72]'),
  item('Let me go', 'Let me go', '让我走吧', '[03:47.10]'),
  item('mamma mia', 'Oh mamma mia mamma mia', '妈妈咪呀', '[03:55.05]'),
]

/** 网关成功的响应体：业务数据在 `body.req.data`，两层 `code` 都要判（与 fetchLyric 同源） */
const okBody = (dictList: unknown) => ({ code: 0, req: { code: 0, data: { dictList } } })

/** `httpFetch` 桩：按调用次序喂响应体（不够就重复最后一个），并留下请求形状供断言 */
const stubFetch = (bodies: unknown[]) => {
  let index = 0
  httpFetch.mockImplementation(() => {
    const body = bodies[Math.min(index++, bodies.length - 1)]
    return { promise: Promise.resolve({ body }), cancelHttp: vi.fn() }
  })
}

beforeEach(() => {
  httpFetch.mockReset()
  getMusicInfo.mockReset()
  getMusicInfo.mockResolvedValue({ songId: 7137686 })
})

describe('getLyricDict：歌曲标识 → 请求参数', () => {
  it('只有 songmid 时先换成数字 songID，再按 GetAIDictInfo 的形状发请求', async() => {
    stubFetch([okBody(BOHEMIAN)])

    const list = await lyric.getLyricDict({ songmid: 'midBohemian' }).promise

    expect(getMusicInfo).toHaveBeenCalledWith('midBohemian')
    expect(httpFetch).toHaveBeenCalledTimes(1)
    const [url, options] = httpFetch.mock.calls[0] as [string, { method: string, body: unknown }]
    expect(url).toBe(DICT_URL)
    expect(options.method).toBe('post')
    expect(options.body).toEqual({
      // 与 fetchLyric 同一份 comm（且**不带凭证**：实测匿名与登录返回一致）
      comm: { ct: '19', cv: '1859', uin: '0' },
      req: {
        method: 'GetAIDictInfo',
        module: 'music.musichallSong.PlayLyricInfo',
        param: { format: 'json', songID: 7137686 },
      },
    })
    expect(list).toEqual(BOHEMIAN)
  })

  it('已经带 songId 的歌不再查一次歌曲详情', async() => {
    stubFetch([okBody(BOHEMIAN)])

    await lyric.getLyricDict({ songId: 20240001, songmid: 'midUnused' }).promise

    expect(getMusicInfo).not.toHaveBeenCalled()
    const [, options] = httpFetch.mock.calls[0] as [string, { body: { req: { param: { songID: number } } } }]
    expect(options.body.req.param.songID).toBe(20240001)
  })
})

describe('getLyricDict：响应归一化与失败', () => {
  it('没有词典时 dictList 是 null → 归一化成 []（调用方只判长度）', async() => {
    stubFetch([okBody(null)])

    await expect(lyric.getLyricDict({ songId: 20240002 }).promise).resolves.toEqual([])
  })

  it('data 里没有 dictList（形状不对）也当空数组，不抛错', async() => {
    stubFetch([{ code: 0, req: { code: 0, data: {} } }])

    await expect(lyric.getLyricDict({ songId: 20240003 }).promise).resolves.toEqual([])
  })

  it('网关码不是 0（模块级）→ 重试到上限后抛错，不把半成品当成功', async() => {
    stubFetch([{ code: 0, req: { code: 10006, data: { dictList: BOHEMIAN } } }])

    await expect(lyric.getLyricDict({ songId: 20240004 }).promise).rejects.toThrow('Get lyric dict failed')
    expect(httpFetch).toHaveBeenCalledTimes(4)
  })

  it('请求还没创建就被取消 → 抛「取消http请求」，一个请求都不发', async() => {
    stubFetch([okBody(BOHEMIAN)])

    const request = lyric.getLyricDict({ songId: 20240005 })
    request.cancelHttp()

    await expect(request.promise).rejects.toThrow(requestMsg.cancelRequest)
    expect(httpFetch).not.toHaveBeenCalled()
  })
})

describe('matchDictEntries：把用户的选区映射到词条', () => {
  it('选区就是词条 phrase → 只给这一条（大小写、空白差异都算命中）', () => {
    expect(matchDictEntries(BOHEMIAN, 'poor boy')).toEqual([BOHEMIAN[1]])
    expect(matchDictEntries(BOHEMIAN, '  Poor   Boy ')).toEqual([BOHEMIAN[1]])
    expect(matchDictEntries(BOHEMIAN, 'let me GO')).toEqual([BOHEMIAN[3]])
  })

  it('选区是整行歌词 → 给这一行的全部词条', () => {
    expect(matchDictEntries(BOHEMIAN, 'We will not let you go')).toEqual([BOHEMIAN[2]])
    // 构造：同一行有两条词条（真实样例里没有这么巧的行）——两条都要给，只给一条会让人以为释义丢了
    const twoInLine = [
      item('let you go', 'We will not let you go'),
      item('not let', 'We will not let you go'),
    ]
    expect(matchDictEntries(twoInLine, 'We will not let you go')).toEqual(twoInLine)
  })

  it('框选半行 / 整行但与原行不等 → 命中落在选区里的词条，长的优先', () => {
    expect(matchDictEntries(BOHEMIAN, 'Poor boy nobody loves me')).toEqual([BOHEMIAN[1]])
    // 构造：两条 phrase 同时落在选区里 → 更长的（更具体）排前面
    const nested = [item('poor', 'x'), item('poor boy nobody', 'x')]
    expect(matchDictEntries(nested, 'a poor boy nobody loves me').map(e => e.phrase))
      .toEqual(['poor boy nobody', 'poor'])
  })

  it('只选中短语里的一个单词 → 命中该短语（双击英文单词的常见情形）', () => {
    expect(matchDictEntries(BOHEMIAN, 'silhouetto')).toEqual([BOHEMIAN[0]])
    expect(matchDictEntries(BOHEMIAN, 'mamma')).toEqual([BOHEMIAN[4]])
  })

  it('一个字符的选区不参与「选区落在 phrase 内部」这条（否则 a / I 会命中一大串）', () => {
    expect(matchDictEntries(BOHEMIAN, 'o')).toEqual([])
    expect(matchDictEntries(BOHEMIAN, 'a')).toEqual([])
    // 但它仍然可以是完整词条（这条走 exact）
    expect(matchDictEntries([item('a'), item('I')], 'a')).toEqual([item('a')])
  })

  it('查不到 → 空数组（界面据此显示「无释义」，不是空白）', () => {
    expect(matchDictEntries(BOHEMIAN, '晚安')).toEqual([])
    expect(matchDictEntries(BOHEMIAN, 'hello world')).toEqual([])
  })

  it('空选区 / 非数组 / 空词典 → 空数组，不抛错', () => {
    expect(matchDictEntries(BOHEMIAN, '')).toEqual([])
    expect(matchDictEntries(BOHEMIAN, '   ')).toEqual([])
    expect(matchDictEntries(null, 'poor boy')).toEqual([])
    expect(matchDictEntries(BOHEMIAN, undefined as unknown as string)).toEqual([])
    expect(matchDictEntries([], 'poor boy')).toEqual([])
  })

  it('词条字段缺失（phrase 为空 / 形状不对）不会被当成命中', () => {
    // 空 phrase 若参与比较就是「任何选区都命中空词条」，会把无关的条目一起端上来
    const dirty = [item(''), { phrase: null }, { phrase: 'poor boy' }] as unknown as Array<ReturnType<typeof item>>
    expect(matchDictEntries(dirty, 'poor').map(e => e.phrase)).toEqual(['poor boy'])
  })
})
