import { beforeEach, describe, expect, it, vi } from 'vitest'
import songList, { readWriteResult } from './songList'

/**
 * 「我喜欢」（dirId=201）写入路径的钉子（ui-polish-3 工单 09）。
 *
 * 真机症状（用户 2026-09-24 原话）：「喜欢和取消喜欢点后怎么 qq 音乐我喜欢中没有加或者也没有移除」。
 * 写接口本身早就有（`likeSong`/`unlikeSong`），但对它的**响应判读**是照参考实现猜的：
 *   - 旧实现 `retCode === 0 || retCode === 80092` 把 80092 当成功。参考实现
 *     `QQMusicApi/modules/songlist.py:152-155,186-189` 对 80092 **两个方向都返回 False**
 *     （「已在歌单里」/「不在歌单里」走的是 retCode 0 那条成功分支）——所以加歌方向的 80092
 *     会变成**假成功**：界面认为收好了（还就地改了收藏态），QQ 侧却没有，且不报错。
 *   - 失败只回一个 false，`code`/`retCode`/`msg` 全丢——真机上「点了没反应」时无从查起。
 *
 * 这个用例钉住三件事（都是本地能证的）：
 *   1. **请求形状**：module/method/参数（含 `tid` 用运行时解析出来的「我喜欢」真实 tid）
 *      与那次受控真机往返（M6，见 `docs/agents/qq-music-native.md` §5.3）逐字段一致；
 *   2. **判读表**：只有 retCode 0 算成功（字符串 "0" 也认）；80092 只在删除方向放行；
 *      其余/缺失一律不 ok，且诊断（code/retCode/msg）原样带出；
 *   3. **tid 解析失败不能让写挂掉**：回落到 0（= 旧行为），请求照发。
 *
 * 真实接口不在测试里打（本机约定：不伪造凭证、不打真接口）；线上形状的复验步骤见票面清单。
 */

const { txCgi, getFavDirTid } = vi.hoisted(() => ({ txCgi: vi.fn(), getFavDirTid: vi.fn() }))

vi.mock('./utils/request', () => ({
  txCgi,
  buildComm: () => ({ uin: '10000' }),
  requireCredential: async() => ({ musicid: '10000', encryptUin: 'e' }),
}))
// 读取侧用的渲染侧请求层（needle 的 `httpFetch`）：它一 import 就拉 `@renderer/store`
// ——node 环境没有 `window`。本文件只碰写侧（走 txCgi），给个空实现即可。
vi.mock('../../request', () => ({ httpFetch: vi.fn() }))
// tx/user.js 整块换掉：本文件只验「写侧怎么用 tid」，取 tid 本身（读侧）在 user.test.ts 钉
vi.mock('./user', () => ({ default: { getFavDirTid }, FAV_DIR_ID: 201 }))
// `../../index` 是渲染侧 utils 总入口，模块顶层就 `document.getElementsByTagName('title')`
// ——node 环境没有 document。它导出的几个整形函数从原处（@common/utils/common）取真的。
vi.mock('../../index', async() => {
  const { formatPlayTime, sizeFormate, dateFormat } = await import('@common/utils/common')
  return {
    formatPlayTime,
    sizeFormate,
    dateFormat,
    // 下面两个只被本模块的读取侧用到（本文件不碰），给个同名实现即可
    formatPlayCount: (num: unknown) => String(num),
    decodeName: (str: unknown) => str,
  }
})

/** 响应节点：M6 实测形状 `{ code: 0, data: { retCode: 0, result: {...} } }`。 */
const node = (payload: Record<string, unknown>) => ({
  promise: Promise.resolve(payload),
  cancelHttp: () => {},
})

const SONG = { songId: 280251533, songType: 0 }
/** `txCgi` 收到的请求（每次调用只有一个参数对：target 与 comm）。 */
const lastTarget = () => txCgi.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  getFavDirTid.mockResolvedValue(3802852742)
  txCgi.mockReturnValue(node({ code: 0, data: { retCode: 0, result: {} } }))
})

describe('tx/songList 的「我喜欢」写入', () => {
  it('likeSong：AddSonglist + dirId 201 + 「我喜欢」的真实 tid + v_songInfo', async() => {
    await expect(songList.likeSong([SONG])).resolves.toEqual({ ok: true, code: 0, retCode: 0, msg: '' })

    expect(lastTarget()).toEqual({
      module: 'music.musicasset.PlaylistDetailWrite',
      method: 'AddSonglist',
      param: {
        dirId: 201,
        // 运行时解析出来的真实 tid（自建歌单那次有记录的受控真机往返传的就是目标自己的 tid）
        tid: 3802852742,
        bFmtUtf8: true,
        v_songInfo: [{ songId: 280251533, songType: 0 }],
      },
    })
  })

  it('unlikeSong：同一端点只换 method（DelSonglist）', async() => {
    await songList.unlikeSong([SONG])

    expect(lastTarget().method).toBe('DelSonglist')
    expect(lastTarget().param.dirId).toBe(201)
    expect(lastTarget().param.tid).toBe(3802852742)
    expect(lastTarget().param.v_songInfo).toEqual([SONG])
  })

  it('tid 解析失败 → 回落到 0，请求照发（解析失败不能挡住写）', async() => {
    getFavDirTid.mockRejectedValue(new Error('凭证缺少 encryptUin'))
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(songList.likeSong([SONG])).resolves.toMatchObject({ ok: true })

    expect(lastTarget().param.tid).toBe(0)
  })

  it('被拒时把 QQ 的错误码打进日志，并原样带回调用方', async() => {
    txCgi.mockReturnValue(node({ code: 10006, data: { retCode: 80092, msg: 'song not exist' } }))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await songList.likeSong([SONG])

    expect(res).toEqual({ ok: false, code: 10006, retCode: 80092, msg: 'song not exist' })
    // 日志里只有请求形状与错误码（凭证/签名一律不进日志）
    expect(log).toHaveBeenCalledWith('[tx] 写歌单被拒', expect.objectContaining({
      method: 'AddSonglist',
      dirId: 201,
      songs: [{ songId: 280251533, songType: 0 }],
      code: 10006,
      retCode: 80092,
      msg: 'song not exist',
    }))
  })
})

describe('tx/songList 的 readWriteResult 判读表', () => {
  it('retCode 0（数值或数值串）→ 成功', () => {
    expect(readWriteResult({ code: 0, data: { retCode: 0 } }).ok).toBe(true)
    expect(readWriteResult({ code: 0, data: { retCode: '0' } }).ok).toBe(true)
    // retCode 挂在节点上（不在 data 里）的老形状也认
    expect(readWriteResult({ code: 0, retCode: 0 }).ok).toBe(true)
  })

  it('80092 两个方向都是失败（旧实现这里是 true，就是「假成功」的来源）', () => {
    // 参考实现对 80092 两个方向都返回 False；「已在/不在歌单里」走的是 retCode 0 那条成功分支
    expect(readWriteResult({ code: 0, data: { retCode: 80092 } }).ok).toBe(false)
    expect(readWriteResult({ code: 80092, data: { retCode: 80092 } }).ok).toBe(false)
  })

  it('没有 retCode（响应形状变了 / data 为 null）→ 失败，不是成功', () => {
    expect(readWriteResult({ code: 0, data: null })).toEqual({
      ok: false, code: 0, retCode: null, msg: '',
    })
    // 模块级错误码（code != 0）也要带出来
    expect(readWriteResult({ code: 104604, data: {} })).toMatchObject({ ok: false, code: 104604 })
  })
})
