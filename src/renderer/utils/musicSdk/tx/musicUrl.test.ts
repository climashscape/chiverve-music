import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestMsg } from '../../message'
import { getMusicUrl } from './musicUrl'

/**
 * tx 取流层对失败的**分档**（工单 01 的判据就落在这一层）。
 *
 * 为什么这个用例要紧：失效曲（无版权 / 已下架）在列表响应里**没有任何字段**能区分
 * （2026-09-25 探针：4 个列表 1146 首，0 个 differential 字段），唯一可靠判据是「真的取流」。
 * 而取流失败里混着网络抖动、服务端限流、未登录、无权限这些**与版权无关**的原因——
 * 只有「所有档位都问过、网关码 0、响应形状正常、就是没有直链」这一种才能算「不可播」，
 * 它必须带上 `txNoPlayableUrl` 标记（`core/music/unavailable.ts` 只认这个标记去置灰）。
 *
 * 真接口不在测试里打（本机约定：不伪造凭证、不打真接口）；下面是按探针记录构造的桩响应。
 */

const { txCgi, getQQCredential } = vi.hoisted(() => ({ txCgi: vi.fn(), getQQCredential: vi.fn() }))

vi.mock('./utils/request', () => ({
  txCgi,
  buildComm: () => ({ uin: '10000' }),
}))
vi.mock('@renderer/utils/ipc', () => ({ getQQCredential }))

/** 文件名前缀 → 档位（与 `musicUrl.js` 的 QUALITY_MAP 同表） */
const QUALITY_OF: Record<string, string> = {
  AI00: 'flac24bit',
  F000: 'flac',
  M800: '320k',
  M500: '128k',
}

const song = { songmid: 'songmid1', strMediaMid: 'media1' }

/** 网关响应节点（形状照 M3 实测：业务数据在 `.data`） */
const node = (midurlinfo: Array<Record<string, unknown>> | null, code = 0) => ({
  code,
  data: { midurlinfo, sip: ['https://isure.stream.qqmusic.qq.com/'] },
})
/** `midurlinfo[i]`：`purl` 空 = 没有直链；`result` 是单文件业务码 */
const info = (purl: string, result = 0) => ({ purl, result })

/**
 * 按档位给响应：`answer(quality)` 返回节点对象（或 `Error` 表示这一档请求本身失败）。
 * 一个返回 null 的档位 = 网关码 0 但响应里没有 `midurlinfo`。
 */
const stubLadder = (answer: (quality: string) => unknown) => {
  txCgi.mockImplementation((target: { param: { filename: string[] } }) => {
    const quality = QUALITY_OF[target.param.filename[0].slice(0, 4)]
    const out = answer(quality)
    return {
      promise: out instanceof Error ? Promise.reject(out) : Promise.resolve(out),
      cancelHttp: vi.fn(),
    }
  })
}

beforeEach(() => {
  txCgi.mockReset()
  getQQCredential.mockReset()
  getQQCredential.mockResolvedValue({ musicid: 10000, musickey: 'k', encryptUin: 'e' })
})

/**
 * 取流对象契约 `{ promise, cancelHttp }`（**不是裸 Promise**，见 AGENTS §2.6 硬约束 1）。
 * `musicUrl.js` 是 JS 文件：`requestObj.promise` 初值是 `null`，TS 推导出来的类型就是 `null`
 * （`checkJs` 关着，赋值不会修正推导），所以这里显式收窄——**只影响类型，不改运行时**。
 */
interface MusicUrlRequest {
  promise: Promise<{ type: LX.Quality, url: string }>
  cancelHttp: () => void
}
// 返回的是取流对象（不是 Promise），别让规则逼它变 async
// eslint-disable-next-line @typescript-eslint/promise-function-async
const fetchMusicUrl = (type?: LX.Quality) => getMusicUrl(song, type) as unknown as MusicUrlRequest

/** 请求失败时把错误对象取出来（要断言标记与文案，不能只断言 rejects） */
const catchError = async(type: LX.Quality) => fetchMusicUrl(type).promise.then(() => null as any, (err: any) => err)

describe('tx 取流：档位降级照旧', () => {
  it('最高档没有直链时降到下一档，resolve 的 type 是**实际拿到的档位**', async() => {
    stubLadder(quality => (quality == '320k' ? node([info('M800media1.mp3')]) : node([info('')])))

    const res = await fetchMusicUrl('flac24bit').promise

    expect(res).toEqual({
      type: '320k',
      url: 'https://isure.stream.qqmusic.qq.com/M800media1.mp3',
    })
  })

  it('直链已是完整 URL 时原样返回（不拼 sip）', async() => {
    stubLadder(() => node([info('http://cdn.example/a.mp3')]))

    await expect(fetchMusicUrl('128k').promise).resolves.toEqual({
      type: '128k',
      url: 'http://cdn.example/a.mp3',
    })
  })
})

describe('tx 取流：只有「所有档位都没直链」才算不可播', () => {
  it('码 0、响应形状正常、四档全空 → 抛带 `txNoPlayableUrl` 标记的错误', async() => {
    stubLadder(() => node([info('')]))

    const err = await catchError('flac24bit')

    expect(err.message).toBe(requestMsg.noPlayableUrl)
    expect(err.txNoPlayableUrl).toBe(true)
    // 四档都问过（降到底才下结论）
    expect(txCgi).toHaveBeenCalledTimes(4)
    // 各档的 result 原样带出，真机排查「哪种码算失效」时不用改代码
    expect(err.txResults).toEqual([0, 0, 0, 0])
  })

  it('服务端说「无权限」（result=104003）→ **不算**不可播（可能是会员 / 购买，不是失效）', async() => {
    stubLadder(() => node([info('', 104003)]))

    const err = await catchError('flac24bit')

    expect(err.message).toBe(requestMsg.noPermission)
    expect(err.txNoPlayableUrl).toBeUndefined()
  })

  it('部分档位无权限、部分档位码 0 空直链 → 只要有权限信号就不算不可播', async() => {
    stubLadder(quality => node([info('', quality == '320k' ? 104003 : 0)]))

    const err = await catchError('flac24bit')

    expect(err.message).toBe(requestMsg.noPermission)
    expect(err.txNoPlayableUrl).toBeUndefined()
  })

  it('网关限流（code=104009）→ 抛「服务器繁忙」并且**不再往下刷档位**', async() => {
    // 探针实测：连刷 vkey 后服务端按 IP 回 104009（与是哪首歌无关），再试更低档只会延长限流
    stubLadder(() => node(null, 104009))

    const err = await catchError('flac24bit')

    expect(err.message).toBe(requestMsg.tooManyRequests)
    expect(err.txNoPlayableUrl).toBeUndefined()
    expect(txCgi).toHaveBeenCalledTimes(1)
  })

  it('响应里没有 midurlinfo（形状不对）→ 不算不可播', async() => {
    stubLadder(() => node(null))

    const err = await catchError('flac24bit')

    expect(err.txNoPlayableUrl).toBeUndefined()
    expect(err.message).toMatch(/QQ 接口响应异常/)
  })

  it('网关码非 0 且不是限流 → 原样报网关错误，不算不可播', async() => {
    stubLadder(() => node(null, 10006))

    const err = await catchError('flac24bit')

    expect(err.txNoPlayableUrl).toBeUndefined()
    expect(err.message).toContain('10006')
  })

  it('请求级失败（网络）→ 抛网络错误本身，不算不可播', async() => {
    stubLadder(() => new Error(requestMsg.timeout))

    const err = await catchError('flac24bit')

    expect(err.message).toBe(requestMsg.timeout)
    expect(err.txNoPlayableUrl).toBeUndefined()
  })

  it('一半档位网络失败、一半档位空直链 → 有请求级错误就不算不可播（结论不可信）', async() => {
    stubLadder(quality => (quality == '128k' ? new Error(requestMsg.notConnectNetwork) : node([info('')])))

    const err = await catchError('flac24bit')

    expect(err.message).toBe(requestMsg.notConnectNetwork)
    expect(err.txNoPlayableUrl).toBeUndefined()
  })

  it('取消请求 → 原样抛「取消http请求」，不参与判定', async() => {
    stubLadder(() => node([info('')]))

    const requestObj = fetchMusicUrl('flac24bit')
    requestObj.cancelHttp()

    await expect(requestObj.promise).rejects.toThrow(requestMsg.cancelRequest)
    expect(txCgi).not.toHaveBeenCalled()
  })

  it('未登录 → 抛「QQ 音乐未登录」，不算不可播（也不发请求）', async() => {
    getQQCredential.mockResolvedValue(null)
    stubLadder(() => node([info('')]))

    const err = await catchError('flac24bit')

    expect(err.message).toBe('QQ 音乐未登录')
    expect(err.txNoPlayableUrl).toBeUndefined()
    expect(txCgi).not.toHaveBeenCalled()
  })
})
