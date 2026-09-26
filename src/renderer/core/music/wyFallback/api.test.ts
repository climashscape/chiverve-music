import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMusicUrl, searchMusic } from './api'

/**
 * 网易云明文接口客户端（`./api.ts`）的钉子。
 *
 * 钉两件事：①两个端点的路径与参数形态（2026-09-26 实测可用，改了要重探）；
 * ②**失败一律收敛成空值**——兜底链路自己出问题不许把异常抛给播放链路。
 */

const { httpFetch } = vi.hoisted(() => ({ httpFetch: vi.fn() }))
vi.mock('@renderer/utils/request', () => ({ httpFetch }))
// 失败路径会写 electron-log（真机日志），测试里换桩——理由同 `index.test.ts`
vi.mock('@common/utils', async(importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, log: { info: vi.fn(), warn: vi.fn() } }
})

const reply = (body: unknown) => {
  httpFetch.mockReturnValue({ promise: Promise.resolve({ body }), cancelHttp: vi.fn() })
}

describe('searchMusic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('请求打到网页版搜索接口，带 s / type=1 / limit', async() => {
    reply({ result: { songs: [] } })
    await searchMusic('晴天 周杰伦', 20)

    const url = httpFetch.mock.calls[0][0] as string
    expect(url).toContain('/api/search/get/web')
    expect(url).toContain('type=1')
    expect(url).toContain('limit=20')
    expect(url).toContain(encodeURIComponent('晴天 周杰伦'))
    // §8.1：身份是浏览器形态，不自报第三方
    const headers = httpFetch.mock.calls[0][1].headers
    expect(headers['User-Agent']).toContain('Mozilla/5.0')
    expect(JSON.stringify(headers)).not.toMatch(/lx-music|chiverve/i)
  })

  it('响应是 text/plain 的 JSON 串也要能解析（实测形态）', async() => {
    const songs = [{
      id: 1330348068,
      name: '晴天',
      artists: [{ name: '周杰伦' }],
      album: { name: '叶惠美' },
      duration: 269000,
    }]
    reply(JSON.stringify({ result: { songs } }))

    await expect(searchMusic('晴天')).resolves.toEqual([{
      id: 1330348068,
      name: '晴天',
      singer: '周杰伦',
      albumName: '叶惠美',
      duration: 269,
    }])
  })

  it('多歌手用 `、` 连接（与渲染侧 singer 字段同形）', async() => {
    reply({ result: { songs: [{ id: 1, name: 'x', artists: [{ name: 'A' }, { name: 'B' }], album: {}, duration: 1000 }] } })
    const [song] = await searchMusic('x')
    expect(song.singer).toBe('A、B')
  })

  it.each([
    ['没有 result', { code: 200 }],
    ['songs 不是数组', { result: { songs: null } }],
    ['body 不是 JSON', 'not json at all'],
    ['body 为 null', null],
  ])('%s → 空数组', async(_name, body) => {
    reply(body)
    await expect(searchMusic('x')).resolves.toEqual([])
  })

  it('网络失败 → 空数组（不抛给播放链路）', async() => {
    httpFetch.mockReturnValue({ promise: Promise.reject(new Error('请求超时')), cancelHttp: vi.fn() })
    await expect(searchMusic('x')).resolves.toEqual([])
  })
})

describe('getMusicUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('请求打到 url/v1，固定 128k（standard）', async() => {
    reply({ data: [{ code: 200, url: 'http://m801.music.126.net/a.mp3', freeTrialInfo: null }] })
    await expect(getMusicUrl(1330348068)).resolves.toBe('http://m801.music.126.net/a.mp3')

    const url = httpFetch.mock.calls[0][0] as string
    expect(url).toContain('/api/song/enhance/player/url/v1')
    expect(url).toContain('level=standard')
    expect(url).toContain(encodeURIComponent('[1330348068]'))
  })

  it('VIP / 下架（code 404、url 为空，实测形态）→ null', async() => {
    reply({ data: [{ id: 186016, url: null, br: 0, code: 404, freeTrialInfo: null }] })
    await expect(getMusicUrl(186016)).resolves.toBeNull()
  })

  it('只有试听片段（freeTrialInfo 非空）→ null（播 60 秒片段比不播更容易被发现）', async() => {
    reply({
      data: [{
        code: 200,
        url: 'http://m801.music.126.net/trial.mp3',
        freeTrialInfo: { start: 0, end: 60 },
      }],
    })
    await expect(getMusicUrl(1)).resolves.toBeNull()
  })

  it.each([
    ['data 为空', { data: [] }],
    ['body 不是 JSON', '<html>'],
    ['url 是空串', { data: [{ code: 200, url: '' }] }],
  ])('%s → null', async(_name, body) => {
    reply(body)
    await expect(getMusicUrl(1)).resolves.toBeNull()
  })

  it('网络失败 → null', async() => {
    httpFetch.mockReturnValue({ promise: Promise.reject(new Error('无法连接到服务器')), cancelHttp: vi.fn() })
    await expect(getMusicUrl(1)).resolves.toBeNull()
  })
})
