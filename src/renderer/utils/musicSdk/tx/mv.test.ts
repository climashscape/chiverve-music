import { beforeEach, describe, expect, it, vi } from 'vitest'
import mv from './mv'

/**
 * MV 取流的「能不能解码」钉子（ui-polish-3 工单 01）。
 *
 * 真机症状（用户 2026-09-24）：「MV 无法播放」——弹窗能开、列表也有内容，点播放就是不出画面。
 * 根因是**取回的是 H.265（HEVC）档**，而本机根本解不开它：
 *   1. Electron 自带的 `node_modules/electron/dist/libffmpeg.so` 只导出 17 个解码器
 *      （h264/aac/mp3/flac/vorbis/opus/pcm…），**没有 `ff_hevc_decoder`**——软解不存在；
 *   2. 硬解这条路在这台机器上也不通：VAAPI 驱动缺（`/usr/lib/x86_64-linux-gnu/dri/nvidia_drv_video.so`
 *      不存在，`vainfo` 报 `va_openDriver() returns -1`）。
 * 于是 `<video>` 拿到流就 `MEDIA_ERR_SRC_NOT_SUPPORTED(4)`，界面只剩黑框。
 *
 * 这个用例钉住两条防御线（缺一条都会重新踩回去）：
 *   A. **请求不点名 H.265**：`format: 265` 是在主动要 HEVC 档（参考实现 Rain120/qq-music-api
 *      与 copws/qq-music-api 传的都是 `format: 264`）；
 *   B. **选档认编码**：响应里两种编码都可能有（`mv.js` 文件头第 5 条记过「同时带回 264/265 两套」），
 *      选档只看 filetype 就会随服务端返回顺序飘——所以必须显式优先 H.264，且顺序无关。
 *
 * 样本形状照 `docs/agents/qq-music-native.md` §5.4 与 `mv.js` 文件头记的实测字段手写
 * （`data[vid].mp4[]` 里 `filetype` 10/20/30/40、`format` 264/265、`fileSize` 递增、`url[0]` 是直链）。
 * 它钉的是「选档规则」与「请求参数」，不代表线上形状已被本轮复验——真机复验步骤见票面。
 */

const { txCgi } = vi.hoisted(() => ({ txCgi: vi.fn() }))

// import 写在前面、vi.mock 写在后面：vitest 会把 vi.mock 提到文件顶部（hoist），
// 顺序不影响是否生效，但这样过得了 lint 的 import/first（仓库既有测试是反着写的，会报错）
vi.mock('./utils/request', () => ({
  txCgi,
  buildComm: () => ({ uin: '10000' }),
}))
// `../../index` 是渲染侧 utils 总入口，模块顶层就 `document.getElementsByTagName('title')`
// ——node 环境没有 document。它要的两个函数本身是 `@common/utils/common` 的纯函数，从原处取真的，
// 别在测试里手写一份可能走样的实现。
vi.mock('../../index', async() => {
  const { formatPlayTime, sizeFormate } = await import('@common/utils/common')
  return { formatPlayTime, sizeFormate }
})
// 凭证只给字段名与假值：这个用例不碰真实登录态（真值不进上下文）
vi.mock('@renderer/utils/ipc', () => ({
  getQQCredential: async() => ({ musicid: '10000', musickey: 'k', encryptUin: 'e', loginType: 2 }),
}))

const VID = '013xscuH0xlbie'
/** 实测里真的能用的档位（filetype 10/20/30/40），每档两种编码。 */
const TIERS = [10, 20, 30, 40]
const CODEC_H264 = 264
const CODEC_HEVC = 265

const tier = (filetype: number, format: number) => ({
  code: 0,
  filetype,
  format,
  // 档位越高文件越大（实测），这里只要能区分大小即可
  fileSize: filetype * 1024 * 1024,
  expire: 86400,
  url: [`http://aqqmusic.tc.qq.com/amobile.music.tc.qq.com/M500.f${filetype}.${format}.mp4?vkey=v`],
  m3u8: '',
})

/** `GetMvUrls` 响应：`data[vid].mp4[]`（hls 这账号拿不到，恒空）。 */
const response = (mp4: Array<ReturnType<typeof tier>>) => ({
  promise: Promise.resolve({
    code: 0,
    data: { [VID]: { mp4, hls: [], svp_flag: 1, duration: 275 } },
  }),
  cancelHttp: () => {},
})

/** 实测那种「同一档位两种编码都回」的响应（264 在前、265 在后）。 */
const bothCodecs = () => TIERS.flatMap(t => [tier(t, CODEC_H264), tier(t, CODEC_HEVC)])
const hevcOnly = () => TIERS.map(t => tier(t, CODEC_HEVC))

beforeEach(() => {
  txCgi.mockReset()
  txCgi.mockImplementation(() => response(bothCodecs()))
})

describe('musicSdk/tx/mv 取流：能不能解码', () => {
  it('请求不点名 H.265：取流参数 format 是 264（265 等于主动要 HEVC 档）', async() => {
    txCgi.mockImplementation(() => response(bothCodecs()))
    await mv.getMvUrl(VID)

    expect(txCgi).toHaveBeenCalledTimes(1)
    // txCgi(target, comm)：取流这次调用的 module/method/param 都在 target 上
    const [target] = txCgi.mock.calls[0]
    expect(target.module).toBe('music.stream.MvUrlProxy')
    expect(target.method).toBe('GetMvUrls')
    expect(target.param.format).toBe(CODEC_H264)
    expect(target.param.vids).toEqual([VID])
  })

  it('两种编码都回时，无论服务端把它们排成什么顺序，选出来的都必须是 H.264', async() => {
    const entries = bothCodecs()
    // 每个旋转都让一条不同的记录落在数组末尾——旧实现取 `list[list.length - 1]`，
    // 只要末尾是 265 档就会挑到解不开的流（顺序无关性是这条用例的重点）
    for (let i = 0; i < entries.length; i++) {
      const rotated = [...entries.slice(i), ...entries.slice(0, i)]
      txCgi.mockImplementation(() => response(rotated))
      const picked = await mv.getMvUrl(VID)
      expect(picked.format, `轮转 ${i} 选到的编码`).toBe(CODEC_H264)
      expect(picked.url).toContain(`.${CODEC_H264}.mp4`)
    }
  })

  it('优先高码率但必须是 H.264：40 档（1080P）两种编码都有时选 40-264', async() => {
    txCgi.mockImplementation(() => response(bothCodecs()))
    const picked = await mv.getMvUrl(VID)
    expect(picked.filetype).toBe(40)
    expect(picked.format).toBe(CODEC_H264)
  })

  it('只有 H.265 时仍给出地址（别的平台可能能解），编码如实回传 265 供 UI 提示', async() => {
    txCgi.mockImplementation(() => response(hevcOnly()))
    const picked = await mv.getMvUrl(VID)
    expect(picked.format).toBe(CODEC_HEVC)
    expect(picked.url).toContain('.mp4')
  })

  it('档位没得挑（不可用档被过滤）时照旧抛错，不因为选档规则改动而静默回空', async() => {
    const broken = TIERS.map(t => ({ ...tier(t, CODEC_H264), code: 2000, url: [] }))
    txCgi.mockImplementation(() => response(broken))
    await expect(mv.getMvUrl(VID)).rejects.toThrow('该 MV 没有可用播放地址')
  })
})
