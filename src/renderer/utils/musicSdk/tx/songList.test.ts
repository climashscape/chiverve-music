import { beforeEach, describe, expect, it, vi } from 'vitest'
import songList, { readWriteResult } from './songList'

/**
 * 「我喜欢」（dirId=201）写入路径的钉子（ui-polish-3 工单 09）。
 *
 * 真机症状（用户 2026-09-24 原话）：「喜欢和取消喜欢点后怎么 qq 音乐我喜欢中没有加或者也没有移除」。
 * **真因有两层，缺一层都还是假成功**（2026-09-24 用真凭证打 QQ 网关逐条 A/B 定案）：
 *
 *   1. **comm 档案**：dirId=201 用 WEB 档案（`ct: 24, cv: 0`）时，服务端**解析不出目标目录**
 *      ——响应回显 `dirId: 0 / tid: 0 / dirName: ""`、模块级 `code: 80105`。`tid` 给 0 或真实值、
 *      `songType` 给 0/1/13 都不改结果。换安卓档案（`ct: 11, cv: 14090008, v, chid`）后同一份
 *      payload 直接 `code: 0`，回显 `dirId: 201 / dirName: "我喜欢" / tid: 3802852742`，
 *      读侧总数 928 → 929（删除方向同样 0，总数回到 928）。↔ 同一天用同一个 payload 往**自建
 *      歌单**（dirId=126）加新歌，WEB 档案下 `code: 0`、回读 `songNum` 1 → 变量只有 dirId 这一档。
 *   2. **判读**：被拒时 `data.retCode` **照样是 0**（`{ code: 80105, data: { retCode: 0 } }`），
 *      只认 retCode 就报成功——界面不报错、还就地改了收藏态，QQ 侧却什么都没发生。旧实现还把
 *      `retCode === 80092` 当成功；参考实现 `modules/songlist.py:152-155,186-189` 对 80092
 *      **两个方向都返回 False**（「已在/不在歌单里」走 `retCode 0` 那条成功分支）。
 *
 * 这个用例钉住四件事（都是本地能证的）：
 *   1. **comm 分档**：dirId=201 → `buildComm` 收到 `'android'`；自建歌单 → `'web'`；
 *   2. **请求形状**：module/method/参数（含 `tid` 用运行时解析出来的真实 tid）；
 *   3. **判读表**：`code` 与 `retCode` **都要 0** 才算成功（数值串 "0" 也认）；80105/1101/80092/
 *      缺字段一律不 ok，且诊断（code/retCode/msg）原样带出；
 *   4. **tid 解析失败不能让写挂掉**：回落到 0，请求照发。
 *
 * 真实接口不在测试里打（本机约定：不伪造凭证、不打真接口）；A/B 的原始记录见票 09 的验证节。
 */

const { txCgi, getFavDirTid, httpFetch } = vi.hoisted(() => ({ txCgi: vi.fn(), getFavDirTid: vi.fn(), httpFetch: vi.fn() }))

// `buildComm` 保留 profile 入参并把档案名带进 comm：本文件的第一条钉子就是「dirId=201 必须走
// 安卓档案」（真实现见 `utils/request.js` 的 `buildComm(credential, profile)`）。
vi.mock('./utils/request', () => ({
  txCgi,
  buildComm: (_credential: unknown, profile = 'web') => ({ uin: '10000', profile }),
  requireCredential: async() => ({ musicid: '10000', encryptUin: 'e' }),
}))
// 读取侧用的渲染侧请求层（needle 的 `httpFetch`）：它一 import 就拉 `@renderer/store`
// ——node 环境没有 `window`。写侧不碰它；分享链接那组用例靠它钉「有没有真的发请求」。
vi.mock('../../request', () => ({ httpFetch }))
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
/** `txCgi` 收到的请求（每次调用一对参数：target 与 comm）。 */
const lastTarget = () => txCgi.mock.calls.at(-1)![0]
const lastComm = () => txCgi.mock.calls.at(-1)![1]

beforeEach(() => {
  vi.clearAllMocks()
  getFavDirTid.mockResolvedValue(3802852742)
  txCgi.mockReturnValue(node({ code: 0, data: { retCode: 0, result: {} } }))
})

describe('tx/songList 的分享链接解析（handleParseId 的域名白名单）', () => {
  it('非 QQ 域的链接一律拒绝，且**一个请求都不发**（深链能把任意 URL 送到这里 = 盲 SSRF）', async() => {
    for (const link of [
      'http://127.0.0.1:23330/collect', // 本应用自己的 OpenAPI（改状态端点）
      'http://192.168.1.1/admin', // 内网
      'http://evil.example/x/playlist/1',
      'http://notqq.com/playlist/1', // 锚定正则：不能被 endsWith('qq.com') 放过
      'file:///etc/passwd', // 非 http(s)
    ]) {
      await expect(songList.handleParseId(link)).rejects.toThrow()
    }
    expect(httpFetch).not.toHaveBeenCalled()
  })

  it('QQ 域的分享链接照常解析：跟随跳转拿回带 id 的地址', async() => {
    httpFetch.mockReturnValue(node({ headers: { location: 'https://y.qq.com/n/ryqq/playlist/12345' }, statusCode: 302 }))

    await expect(songList.handleParseId('https://c6.y.qq.com/base/fcgi-bin/u?__=abc123'))
      .resolves.toBe('https://y.qq.com/n/ryqq/playlist/12345')
    expect(httpFetch).toHaveBeenCalledWith('https://c6.y.qq.com/base/fcgi-bin/u?__=abc123')
  })

  it('没有跳转时原样返回链接（原有行为不变）', async() => {
    httpFetch.mockReturnValue(node({ headers: {}, statusCode: 200 }))

    await expect(songList.handleParseId('https://i.y.qq.com/n2/m/share/details/taoge.html?id=1'))
      .resolves.toBe('https://i.y.qq.com/n2/m/share/details/taoge.html?id=1')
  })
})

describe('tx/songList 的「我喜欢」写入', () => {
  it('likeSong：AddSonglist + dirId 201 + 「我喜欢」的真实 tid + v_songInfo + **安卓档案**', async() => {
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
    // 🔴 这一档必须是安卓档案：WEB 档案下服务端解析不出 dirId=201，只回 `code: 80105`
    expect(lastComm().profile).toBe('android')
  })

  it('unlikeSong：同一端点只换 method（DelSonglist），档案同款', async() => {
    await songList.unlikeSong([SONG])

    expect(lastTarget().method).toBe('DelSonglist')
    expect(lastTarget().param.dirId).toBe(201)
    expect(lastTarget().param.tid).toBe(3802852742)
    expect(lastTarget().param.v_songInfo).toEqual([SONG])
    expect(lastComm().profile).toBe('android')
  })

  it('自建歌单（dirId 非 201）仍走 WEB 档案——安卓档案在那条路上没实测记录', async() => {
    await songList.addSongToList(126, [SONG], 9782899569)
    expect(lastTarget().param.dirId).toBe(126)
    expect(lastComm().profile).toBe('web')

    await songList.removeSongFromList(126, [SONG], 9782899569)
    expect(lastComm().profile).toBe('web')
  })

  it('tid 解析失败 → 回落到 0，请求照发（解析失败不能挡住写）', async() => {
    getFavDirTid.mockRejectedValue(new Error('凭证缺少 encryptUin'))
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(songList.likeSong([SONG])).resolves.toMatchObject({ ok: true })

    expect(lastTarget().param.tid).toBe(0)
    // tid 回落不影响档案：档案是成败变量，tid 不是
    expect(lastComm().profile).toBe('android')
  })

  it('被拒时把 QQ 的错误码打进日志（含档案名），并原样带回调用方', async() => {
    txCgi.mockReturnValue(node({ code: 10006, data: { retCode: 80092, msg: 'song not exist' } }))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await songList.likeSong([SONG])

    expect(res).toEqual({ ok: false, code: 10006, retCode: 80092, msg: 'song not exist' })
    // 日志里只有请求形状与错误码（凭证/签名一律不进日志）
    expect(log).toHaveBeenCalledWith('[tx] 写歌单被拒', expect.objectContaining({
      method: 'AddSonglist',
      // 2026-09-24 那次假成功的变量就是档案，所以它必须出现在诊断行里
      comm: 'android',
      dirId: 201,
      songs: [{ songId: 280251533, songType: 0 }],
      code: 10006,
      retCode: 80092,
      msg: 'song not exist',
    }))
  })
})

describe('tx/songList 的 readWriteResult 判读表', () => {
  it('code 与 retCode 都是 0（数值或数值串）→ 成功', () => {
    expect(readWriteResult({ code: 0, data: { retCode: 0 } }).ok).toBe(true)
    expect(readWriteResult({ code: 0, data: { retCode: '0' } }).ok).toBe(true)
    // retCode 挂在节点上（不在 data 里）的老形状也认
    expect(readWriteResult({ code: 0, retCode: 0 }).ok).toBe(true)
  })

  it('**code 非 0 而 retCode 是 0 → 失败**（2026-09-24 真机实测的被拒形状，旧判据在这里报成功）', () => {
    // 真机原文：`{ code: 80105, data: { retCode: 0, result: { dirId: 0, tid: 0, dirName: '', songlist: [{...}] } } }`
    // 读侧总数纹丝不动（928 → 928）；只认 retCode 就是「界面说成功、QQ 侧没变」的假成功
    expect(readWriteResult({
      code: 80105,
      data: { retCode: 0, result: { dirId: 0, tid: 0, dirName: '', songlist: [{ songId: 97773 }] } },
    })).toEqual({ ok: false, code: 80105, retCode: 0, msg: '' })
    // songType 给 1 时服务端换了个参数校验码，同样非 0 → 失败
    expect(readWriteResult({ code: 1101, data: { retCode: 0 } }).ok).toBe(false)
    // 未登录时连 data 都不给（`{ code: 1000 }`）
    expect(readWriteResult({ code: 1000 }).ok).toBe(false)
  })

  it('80092 两个方向都是失败（旧实现这里是 true，也是「假成功」的来源）', () => {
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
    // ⚠️ `Number(null) === 0`：缺 code 必须算缺失，不能读成 0（否则空响应 = 成功）
    expect(readWriteResult({ data: { retCode: 0 } }).ok).toBe(false)
    expect(readWriteResult({ code: null, data: { retCode: 0 } }).ok).toBe(false)
    expect(readWriteResult({ code: '', data: { retCode: 0 } }).ok).toBe(false)
  })
})

/**
 * 歌单详情的「总数」**接线**（ui-polish-followups 票 17 接缝 1 的调用点侧）。
 *
 * 解析本身在 `utils/songlistTotal.test.ts` 钉；这里钉的是本文件确实用它、且**兜底值是本页条数**
 * （`list.length`）——`tx/user.js` 的 `getFavSong` 那一侧兜底 0，两处不同，别在重构时被「统一」掉。
 *
 * 期望值来源：真机读数（「我喜欢」`total_song_num=928`、每页 30 条；见 `user.test.ts` 头部记录），
 * 原始响应形状按 `qq-music-native.md` 的 `CgiGetDiss` 记录（`data.dirinfo` + `data.songlist` +
 * `data.total_song_num` + `data.songlist_size`）。
 */
describe('tx/songList 的歌单详情总数（getListDetailByCgi）', () => {
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

    const res = await songList.getListDetailByCgi('3802852742')

    expect(res.total).toBe(928)
    // 本页只有 1 条（只造了 1 条）——928 只能来自 total_song_num
    expect(res.list).toHaveLength(1)
  })

  it('total_song_num 缺失 → 兜底本页条数（本文件传的是 list.length，不是 0）', async() => {
    txCgi.mockReturnValue(node({
      code: 0,
      data: {
        dirinfo: { title: '歌单' },
        songlist: [RAW_SONG, { ...RAW_SONG, id: 280251534, mid: 'mid2' }],
      },
    }))

    const res = await songList.getListDetailByCgi('123')

    expect(res.total).toBe(2)
  })
})
