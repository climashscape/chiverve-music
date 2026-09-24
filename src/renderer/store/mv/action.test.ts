import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closePlayer, openMv, player } from './index'
import type { MvInfo } from './state'

/**
 * MV 播放状态的取数契约（ui-polish-3 工单 01）。
 *
 * 为什么值得单独钉：弹窗的提示行（`player.sizeText`）是**真机上唯一能看到的取流信息**——
 * 编码写不进去，「MV 播不出来是编码问题还是直链问题」就只能靠猜。它经四个调用点
 * （乐馆 MV / 搜索 / 歌手页 / 歌曲详情）的既有 `:size-text` 透传，所以这里断言的字符串
 * 就是用户会看到的那个字符串。
 *
 * 只把最外层的 SDK 换成桩（真链路：openMv → loadDetail/loadUrl → 状态写回）。
 */
const { getMvUrl, getMvDetail } = vi.hoisted(() => ({ getMvUrl: vi.fn(), getMvDetail: vi.fn() }))

// import 写在前面、vi.mock 在后面：vitest 会把 vi.mock 提到顶部（hoist），顺序不影响生效，
// 但这样过得了 lint 的 import/first
vi.mock('@renderer/utils/musicSdk', () => ({
  default: { tx: { mv: { getMvUrl, getMvDetail } } },
}))

const MV: MvInfo = {
  id: '123',
  vid: '013xscuH0xlbie',
  name: '测试 MV',
  subName: '',
  img: '',
  singer: '歌手',
  interval: '04:35',
  duration: 275,
  playCount: 100,
}

const urlResult = (over: Record<string, unknown> = {}) => ({
  vid: MV.vid,
  filetype: 40,
  format: 264,
  size: 12939264,
  sizeText: '12.34 MiB',
  url: 'http://aqqmusic.tc.qq.com/M500.f40.264.mp4?vkey=v',
  expire: 86400,
  duration: 275,
  interval: '04:35',
  source: 'tx',
  ...over,
})

beforeEach(() => {
  closePlayer()
  getMvUrl.mockReset()
  getMvDetail.mockReset()
  getMvDetail.mockResolvedValue(null)
})

describe('store/mv 取流状态', () => {
  it('提示行 = 编码 · 体积（H.264/H.265 是专名，不进 i18n）', async() => {
    getMvUrl.mockResolvedValue(urlResult())
    openMv(MV)
    await vi.waitFor(() => { expect(player.url).toBeTruthy() })

    expect(player.url).toBe(urlResult().url)
    expect(player.sizeText).toBe('H.264 · 12.34 MiB')
    expect(player.filetype).toBe(40)
    expect(player.urlError).toBe('')
  })

  it('只有 H.265 可选时提示行如实写 H.265（界面据此提示「编码不受支持」）', async() => {
    getMvUrl.mockResolvedValue(urlResult({ format: 265 }))
    openMv(MV)
    await vi.waitFor(() => { expect(player.url).toBeTruthy() })

    expect(player.sizeText).toBe('H.265 · 12.34 MiB')
  })

  it('认不出的编码不硬写：只留体积（宁可不显示，也别显示错的）', async() => {
    getMvUrl.mockResolvedValue(urlResult({ format: 0 }))
    openMv(MV)
    await vi.waitFor(() => { expect(player.url).toBeTruthy() })

    expect(player.sizeText).toBe('12.34 MiB')
  })

  it('取流抛错时给出可读文案、且不留旧直链', async() => {
    getMvUrl.mockRejectedValue(new Error('该 MV 没有可用播放地址'))
    openMv(MV)
    await vi.waitFor(() => { expect(player.urlError).toBeTruthy() })

    expect(player.url).toBe('')
    expect(player.urlError).toBe('mv__url_unavailable')
  })

  it('换一个 MV 重新打开时，上一条的直链/提示/错误都清掉', async() => {
    getMvUrl.mockResolvedValue(urlResult())
    openMv(MV)
    await vi.waitFor(() => { expect(player.url).toBeTruthy() })

    getMvUrl.mockResolvedValue(urlResult({ format: 265, url: 'http://aqqmusic.tc.qq.com/other.mp4?vkey=v2' }))
    openMv({ ...MV, vid: 'othervid', id: '456' })
    // openMv 同步就把 url/提示清空（弹窗立刻出现、不显示上一条的流）
    expect(player.url).toBe('')
    expect(player.sizeText).toBe('')

    await vi.waitFor(() => { expect(player.url).toContain('other.mp4') })
    expect(player.sizeText).toBe('H.265 · 12.34 MiB')
  })
})
