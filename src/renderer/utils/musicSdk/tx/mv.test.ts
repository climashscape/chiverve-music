import { beforeEach, describe, expect, it, vi } from 'vitest'
import mv from './mv'

/**
 * MV 取流的两组钉子：**能不能解码**（ui-polish-3 工单 01）与**直链拼没拼**（2026-09-26 回归）。
 *
 * 第一组：真机症状（用户 2026-09-24）「MV 无法播放」——弹窗能开、列表也有内容，点播放就是不出画面。
 * 那次的根因是**取回的是 H.265（HEVC）档**，而本机根本解不开它：
 *   1. Electron 自带的 `node_modules/electron/dist/libffmpeg.so` 只导出 17 个解码器
 *      （h264/aac/mp3/flac/vorbis/opus/pcm…），**没有 `ff_hevc_decoder`**——软解不存在；
 *   2. 硬解这条路在这台机器上也不通：VAAPI 驱动缺（`/usr/lib/x86_64-linux-gnu/dri/nvidia_drv_video.so`
 *      不存在，`vainfo` 报 `va_openDriver() returns -1`）。
 *
 * 第二组（文件末尾那个 describe）：2026-09-26 用户再报「MV 播不了」——这次**不是编码**，
 * 而是 `GetMvUrls` 的 `url[]` 变成了**裸域名**，直链要自己拼（`base + urlPath + cn + '?vkey='`）；
 * 老实现把 `url[0]` 原样交给 `<video>` → 请求裸域名 → 403 → `MEDIA_ERR_SRC_NOT_SUPPORTED(4)`
 * ——**和编码问题同一个 code**，所以只看 code 会误判（见 `pitfalls.md` 坑 22）。
 *
 * 夹具分两代：`tier()` 是**旧形态**（`url[0]` 已是完整直链，≤2026-09-25 的响应），
 * `newShapeTier()` 照 **2026-09-26 live 响应**逐字段写（`url` 两条裸域名 + `cn`/`vkey`/`urlPath`/`freeflow_url`）。
 * 两组用例分别钉「选档规则 / 请求参数」与「直链拼接」；live 侧还有
 * `scripts/verify/probe-qq/probe_mv_play.py`（镜像 `resolveDirectUrl`，跑真端点）与
 * `scripts/verify/verify-mv-decode.cjs`（Electron 真解码）两道交叉验证。
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

/**
 * **2026-09-26 live 实测的新形态**：`url[]` 只剩裸域名，对象名在 `cn`、签名在 `vkey`。
 * 直链得自己拼：`url[0] + urlPath + cn + '?vkey=' + vkey`（缺这一步 = 请求裸域名 → HTTP 403
 * → `<video>` 报 `MEDIA_ERR_SRC_NOT_SUPPORTED(4)`，就是用户看到的黑框）。
 */
const newShapeTier = (filetype: number, format: number) => ({
  code: 0,
  filetype,
  format,
  fileSize: filetype * 1024 * 1024,
  expire: 86400,
  url: ['http://mv6.music.tc.qq.com/', 'https://mv.music.tc.qq.com/'],
  // 实测 `cn` 形如 `qmmv_<32位>.f9814.mp4`，后缀与 newFileType 一致；这里只留可断言的形状
  cn: `qmmv_${filetype}.f98${filetype}.mp4`,
  vkey: `vk-${filetype}`,
  urlPath: '',
  // 服务端自己拼好的完整地址（免流语义）；正常路径用不到，只作兜底
  freeflow_url: [`http://mv6.music.tc.qq.com/${filetype}free`, `https://mv.music.tc.qq.com/${filetype}free`],
  m3u8: '',
})

/** `GetMvUrls` 响应：`data[vid].mp4[]`（hls 这账号拿不到，恒空）。 */
type Mp4Record = ReturnType<typeof tier> | ReturnType<typeof newShapeTier>
const response = (mp4: Mp4Record[]) => ({
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

/**
 * 2026-09-26 真机报「MV 播放不了」的回归钉：`url[]` 只剩裸域名，直链必须自己拼。
 *
 * 实测证据（`scripts/verify/probe-qq/probe_mv_play.py`）：把 `url[0]` 原样交给 `<video>`
 * = 请求 `http://mv6.music.tc.qq.com/` → **HTTP 403** → `MEDIA_ERR_SRC_NOT_SUPPORTED(4)`
 * → 黑框；拼上 `cn`/`vkey` 后 → 206 `video/mp4`，Electron 解出时长与分辨率。
 */
describe('musicSdk/tx/mv 直链拼接：url[] 只有裸域名时', () => {
  const bareHostPattern = /^https?:\/\/[^/]+\/?$/

  it('getMvUrl 拼出可播直链（base + urlPath + cn + ?vkey）', async() => {
    txCgi.mockImplementation(() => response([newShapeTier(10, CODEC_H264), newShapeTier(40, CODEC_H264)]))
    const picked = await mv.getMvUrl(VID)
    expect(picked.filetype).toBe(40)
    expect(picked.url).toBe('http://mv6.music.tc.qq.com/qmmv_40.f9840.mp4?vkey=vk-40')
    // 交出去的绝不能是裸域名（那正是 403 的那一条）
    expect(picked.url).not.toMatch(bareHostPattern)
  })

  it('getMvUrls 的每一档（含 best）都是拼好的直链', async() => {
    txCgi.mockImplementation(() => response([newShapeTier(10, CODEC_H264), newShapeTier(40, CODEC_H264)]))
    const res = await mv.getMvUrls(VID)
    // mv.js 是 JS：`list` 的元素类型在 TS 侧是 any，这里显式标注参数类型（ts-loader 会查 .test.ts）
    expect(res.list.map((item: { url: string }) => item.url)).toEqual([
      'http://mv6.music.tc.qq.com/qmmv_10.f9810.mp4?vkey=vk-10',
      'http://mv6.music.tc.qq.com/qmmv_40.f9840.mp4?vkey=vk-40',
    ])
    expect(res.best!.url).toBe('http://mv6.music.tc.qq.com/qmmv_40.f9840.mp4?vkey=vk-40')
  })

  it('旧形态（url[i] 已是完整直链）原样透传——服务端形态回退时不炸', async() => {
    txCgi.mockImplementation(() => response([tier(40, CODEC_H264)]))
    const picked = await mv.getMvUrl(VID)
    expect(picked.url).toBe('http://aqqmusic.tc.qq.com/amobile.music.tc.qq.com/M500.f40.264.mp4?vkey=v')
  })

  it('拼不出直链但服务端给了 freeflow_url 时用它兜底', async() => {
    const noCn = { ...newShapeTier(40, CODEC_H264), cn: '', vkey: '' }
    txCgi.mockImplementation(() => response([noCn]))
    const picked = await mv.getMvUrl(VID)
    expect(picked.url).toBe('http://mv6.music.tc.qq.com/40free')
  })

  it('既拼不出又没有可兜底的地址 → 该档视为不可用（不是静默回空串）', async() => {
    const hopeless = {
      ...newShapeTier(40, CODEC_H264), cn: '', vkey: '', freeflow_url: [],
    }
    txCgi.mockImplementation(() => response([hopeless]))
    await expect(mv.getMvUrl(VID)).rejects.toThrow('该 MV 没有可用播放地址')
  })
})
