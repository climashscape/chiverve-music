import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestMsg } from '../../message'
import comment from './comment'

/**
 * `tx/comment.js` 的「取评论」请求取消（票 05 的陈旧评论）。
 *
 * 原来 `this._requestObj` 只有读没有写（恒为 null），`cancelHttp()` 是死代码：切歌 / 重开
 * 评论区时旧请求取消不掉，旧响应后到会覆盖新列表（`MusicComment/index.vue` 侧已另有守卫，
 * 但请求本身该停就得停）。写法照 `tx/lyric.js` 的 getLyric，这里钉住三件事：
 *
 *   1. 第二次取评论会**真的取消**上一次未回的请求（`_requestObj` 存的是本次请求的取消入口）；
 *   2. 请求还没创建就被取消的窗口也能兜住（`getSongId` 是异步的）；
 *   3. 被取消的那次以组件认识的 `'取消请求'` 拒绝（组件据此不再递归重试），
 *      没被取消的正常路径不受影响。
 */

const { httpFetch, getMusicInfo } = vi.hoisted(() => ({ httpFetch: vi.fn(), getMusicInfo: vi.fn() }))

vi.mock('../../request', () => ({ httpFetch }))
vi.mock('./musicInfo', () => ({ default: getMusicInfo }))
// `../../index`（= src/renderer/utils/index）顶层就会碰 `document`（node 环境没有），
// comment.js 只从它拿 dateFormat2 —— 按 user.test.ts 的做法只给这一个纯函数
vi.mock('../../index', () => ({ dateFormat2: vi.fn() }))

/** h5 读接口的成功响应：`comment.commentlist` + `commenttotal`（文件头第 5 条） */
const okBody = { code: 0, comment: { commentlist: [], commenttotal: 42 } }

const deferred = <T>() => {
  let resolveDeferred!: (value: T) => void
  let rejectDeferred!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve
    rejectDeferred = reject
  })
  return { promise, resolve: resolveDeferred, reject: rejectDeferred }
}

/** 让 getComment 里 `await this.getSongId(...)` 那一步走完 */
const tick = async() => { await Promise.resolve(); await Promise.resolve() }

describe('tx/comment 取评论的请求取消', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('第二次取评论会取消上一次未回的请求，被取消的那次以「取消请求」拒绝', async() => {
    const first = deferred<any>()
    const firstReq = {
      promise: first.promise,
      cancelHttp: vi.fn(() => { first.reject(new Error(requestMsg.cancelRequest)) }),
    }
    const secondReq = {
      promise: Promise.resolve({ statusCode: 200, body: okBody }),
      cancelHttp: vi.fn(),
    }
    httpFetch.mockReturnValueOnce(firstReq).mockReturnValueOnce(secondReq)

    const p1 = comment.getComment({ songId: 1 }, 1, 20)
    // 先挂一个处理器：本用例断言的是「被取消时抛什么」，不是「有没有被接住」
    const p1Settled = p1.catch((err: any) => err)
    await tick()

    const p2 = comment.getComment({ songId: 1 }, 1, 20)
    await expect(p2).resolves.toMatchObject({ source: 'tx', total: 42 })

    expect(firstReq.cancelHttp).toHaveBeenCalledTimes(1)
    await expect(p1Settled).resolves.toMatchObject({ message: '取消请求' })
  })

  it('请求还没创建就被取消（getSongId 未回）→ 不发第一次请求，且以「取消请求」拒绝', async() => {
    const info = deferred<any>()
    getMusicInfo.mockReturnValueOnce(info.promise)
    httpFetch.mockReturnValue({
      promise: Promise.resolve({ statusCode: 200, body: okBody }),
      cancelHttp: vi.fn(),
    })

    const p1 = comment.getComment({ songmid: 'midA' }, 1, 20)
    const p1Settled = p1.catch((err: any) => err)
    await tick()

    const p2 = comment.getComment({ songId: 2 }, 1, 20)
    await expect(p2).resolves.toMatchObject({ source: 'tx' })

    info.resolve({ songId: 111 })
    await expect(p1Settled).resolves.toMatchObject({ message: '取消请求' })
    // 第一次的 httpFetch 从未发出（请求创建前就被取消）
    expect(httpFetch).toHaveBeenCalledTimes(1)
  })

  it('正常路径不回归：单次取评论照常返回数据', async() => {
    httpFetch.mockReturnValue({
      promise: Promise.resolve({ statusCode: 200, body: okBody }),
      cancelHttp: vi.fn(),
    })

    await expect(comment.getComment({ songId: 3 }, 1, 20)).resolves.toMatchObject({
      source: 'tx',
      comments: [],
      total: 42,
      page: 1,
      limit: 20,
    })
  })
})
