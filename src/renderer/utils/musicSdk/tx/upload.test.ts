import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import upload, {
  buildFinishParam, buildInitParam, MAX_IMAGE_BYTES, pickCdnUrl, pickContentType, pickUploadTarget,
} from './upload'

/**
 * 图片直传 COS（`upload.js`）的钉子。
 *
 * **钉住四条**：
 *   1. **三步形状**：`music.filesys.FileSystem` 的 `InitUpload` / `FinishUpload` 参数逐字段
 *      （`BusID` / `Files[].FileSha1/FileName/FileSize` / `Results[].Storage.{Bucket.{Name,Region},ObjectKey}`
 *      —— 大小写都是服务端拼法，参考实现 `modules/helper.py:38-78`）、以及中间那步
 *      **直传 COS** 的 URL 与签名头（host 由桶名 + 地域拼、路径是 ObjectKey、带临时密钥头）；
 *   2. **不动不该动的东西**：`UploadStatus === 1`（服务端认为这个 sha1 已在库里）**跳过 PUT**，
 *      但仍要 `FinishUpload` 把地址换回来；
 *   3. **失败降级**：每一步失败都抛**能看出是哪一步**的错，且**不往下走**——尤其是
 *      「上传没成功就不建歌单」这条：HTTP 非 2xx 时绝不能发出 `FinishUpload`，更不能把空地址
 *      交给建歌单（调用方 `store/user/action.ts` 的 `uploadListCover` 会原样抛给视图）。
 *      入参侧的拒绝（空文件 / 超 1MB / 非图片）必须在**发请求之前**发生；
 *   4. 签名与请求组装本身**不在本文件**（在 `utils/cos.test.ts` 用官方 SDK 的黄金向量钉），
 *      这里只钉"有没有把该给的值给进去"。
 *
 * 真机实测（1×1 PNG 走完整链路）见 `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-upload.md`。
 */

const { txCgi, httpFetch, requireCredential } = vi.hoisted(() => ({
  txCgi: vi.fn(), httpFetch: vi.fn(), requireCredential: vi.fn(),
}))

vi.mock('./utils/request', () => ({
  txCgi,
  buildComm: () => ({ uin: '10000' }),
  requireCredential,
}))
// 渲染侧请求层（needle）：本文件只验证"发出去的形状"，不打真接口
vi.mock('../../request', () => ({ httpFetch }))

/** 三轮调用都返回同一个"可 await 的请求对象"形状（契约见 tx/utils/request.js 文件头）。 */
const reqOf = (payload: unknown) => ({ promise: Promise.resolve(payload), cancelHttp: () => {} })

const OBJECT_KEY = 'songlist/u/EXAMPLEUIN/2320b/0123456789abcdef0123456789abcdef01234567_46.png'
const BUCKET = { Name: 'music-file-1258344705', Region: 'ap-guangzhou' }
const CDN = `https://music-file.y.qq.com/${OBJECT_KEY}`

const initOk = (uploadStatus = 0) => ({
  code: 0,
  data: {
    AuthInfo: { SecretID: 'AKIDEXAMPLE', SecretKey: 'SECRETEXAMPLE', Token: 'TOKENEXAMPLE', StartTime: 1, ExpiredTime: 2 },
    Files: [{ FileSha1: 'a9993e36', ObjectKey: OBJECT_KEY, Buckets: [{ Bucket: BUCKET, UploadStatus: uploadStatus }] }],
  },
})
const finishOk = () => ({
  code: 0,
  data: { Objects: [{ Storage: { Bucket: BUCKET, ObjectKey: OBJECT_KEY }, Url: { URL: 'http://x/', CDNURL: CDN } }] },
})

/** 默认：InitUpload → 直传 200 → FinishUpload。单测按需覆写某一步。 */
const wireOk = (uploadStatus = 0) => {
  txCgi.mockImplementation((target: any) => reqOf(target.method === 'InitUpload' ? initOk(uploadStatus) : finishOk()))
  httpFetch.mockReturnValue(reqOf({ statusCode: 200 }))
}

const makeFile = (text = 'abc', { name = 'cover.png', type = 'image/png', size }: { name?: string, type?: string, size?: number } = {}) => {
  const bytes = new TextEncoder().encode(text)
  return { name, type, size: size ?? bytes.length, arrayBuffer: async() => bytes.buffer }
}

const lastHttp = () => httpFetch.mock.calls.at(-1)!
const callsTo = (method: string) => txCgi.mock.calls.filter(([target]: any) => target.method === method)

beforeEach(() => {
  txCgi.mockReset()
  httpFetch.mockReset()
  requireCredential.mockReset()
  requireCredential.mockResolvedValue({ musicid: '10000', encryptUin: 'e' })
  wireOk()
})

describe('uploadImage：三步链路与入参映射', () => {
  it('走 InitUpload → 直传 COS → FinishUpload，返回 CDNURL；参数逐字段对齐服务端拼法', async() => {
    const res = await upload.uploadImage(makeFile('abc'))

    expect(res).toEqual({ url: CDN })

    // 1) InitUpload：模块/方法/业务位/文件三元组（FileSha1 是**文件内容**的 sha1）
    const [initTarget, initComm] = txCgi.mock.calls[0]
    expect(initTarget).toEqual({
      module: 'music.filesys.FileSystem',
      method: 'InitUpload',
      param: {
        BusID: 'songlist',
        Files: [{ FileSha1: sha1Of('abc'), FileName: 'cover.png', FileSize: 3 }],
      },
    })
    expect(initComm).toEqual({ uin: '10000' })

    // 2) 直传：URL 由桶名 + 地域拼，路径就是 ObjectKey，带临时密钥与会话头
    const [putUrl, putOptions] = lastPutCall()
    expect(putUrl).toBe(`https://music-file-1258344705.cos.ap-guangzhou.myqcloud.com/${OBJECT_KEY}`)
    expect(putOptions.method).toBe('put')
    expect(putOptions.headers.Host).toBe('music-file-1258344705.cos.ap-guangzhou.myqcloud.com')
    expect(putOptions.headers['x-cos-security-token']).toBe('TOKENEXAMPLE')
    expect(putOptions.headers['Content-Type']).toBe('image/png')
    expect(String(putOptions.headers.Authorization)).toContain('q-ak=AKIDEXAMPLE')
    expect(Buffer.isBuffer(putOptions.body)).toBe(true)

    // 3) FinishUpload：Bucket + ObjectKey + UploadResult 0
    const [finishTarget] = txCgi.mock.calls[1]
    expect(finishTarget).toEqual({
      module: 'music.filesys.FileSystem',
      method: 'FinishUpload',
      param: {
        BusID: 'songlist',
        Results: [{ Storage: { Bucket: BUCKET, ObjectKey: OBJECT_KEY }, UploadResult: 0 }],
      },
    })
  })

  it('UploadStatus=1（服务端已有这个 sha1）→ 跳过直传，但仍要 FinishUpload 换地址', async() => {
    wireOk(1)

    const res = await upload.uploadImage(makeFile('abc'))

    expect(httpFetch).not.toHaveBeenCalled()
    expect(callsTo('FinishUpload')).toHaveLength(1)
    expect(res.url).toBe(CDN)
  })

  it('Url 只有 URL 没有 CDNURL 时回落 URL（两个都是服务端给的访问地址）', async() => {
    txCgi.mockImplementation((target: any) => reqOf(target.method === 'InitUpload'
      ? initOk()
      : { code: 0, data: { Objects: [{ Url: { URL: 'http://plain/' } }] } }))

    expect((await upload.uploadImage(makeFile('abc'))).url).toBe('http://plain/')
  })

  it('自定义 busId 会原样带进两步（同一套流程可服务别的业务位）', async() => {
    await upload.uploadImage(makeFile('abc'), 'homepage')

    expect(callsTo('InitUpload')[0][0].param.BusID).toBe('homepage')
    expect(callsTo('FinishUpload')[0][0].param.BusID).toBe('homepage')
  })
})

describe('uploadImage：失败降级（每一步都不许往下走）', () => {
  it('未登录 / 凭证缺失：直接抛，一个请求都不发', async() => {
    requireCredential.mockRejectedValue(new Error('QQ 音乐未登录'))

    await expect(upload.uploadImage(makeFile('abc'))).rejects.toThrow('QQ 音乐未登录')
    expect(txCgi).not.toHaveBeenCalled()
    expect(httpFetch).not.toHaveBeenCalled()
  })

  it('InitUpload 非 0：抛带 code 的错，不直传、不 FinishUpload', async() => {
    txCgi.mockImplementation(() => reqOf({ code: 80105 }))

    await expect(upload.uploadImage(makeFile('abc'))).rejects.toThrow('上传初始化失败（code 80105）')
    expect(httpFetch).not.toHaveBeenCalled()
    expect(callsTo('FinishUpload')).toHaveLength(0)
  })

  it('InitUpload 返回缺凭证/缺桶：点名缺了哪几项，不直传', async() => {
    txCgi.mockImplementation(() => reqOf({ code: 0, data: { AuthInfo: { SecretID: 'a' }, Files: [{}] } }))

    await expect(upload.uploadImage(makeFile('abc'))).rejects.toThrow(/缺 .*SecretKey/)
    expect(httpFetch).not.toHaveBeenCalled()
  })

  it('直传 COS 非 2xx：抛 HTTP 状态，且**不发** FinishUpload（不会登记一个没传上去的对象）', async() => {
    httpFetch.mockReturnValue(reqOf({ statusCode: 403 }))

    await expect(upload.uploadImage(makeFile('abc'))).rejects.toThrow('直传 COS 失败（HTTP 403）')
    expect(callsTo('FinishUpload')).toHaveLength(0)
  })

  it('FinishUpload 非 0：抛带 code 的错（别把"没登记成功"当成成功）', async() => {
    txCgi.mockImplementation((target: any) => reqOf(target.method === 'InitUpload' ? initOk() : { code: 1101 }))

    await expect(upload.uploadImage(makeFile('abc'))).rejects.toThrow('上传未完成（code 1101）')
  })

  it('FinishUpload 说成功但没有地址：抛错而不是回个空串给调用方当封面', async() => {
    txCgi.mockImplementation((target: any) => reqOf(target.method === 'InitUpload' ? initOk() : { code: 0, data: {} }))

    await expect(upload.uploadImage(makeFile('abc'))).rejects.toThrow('上传完成但服务端未返回地址')
  })

  it('入参侧的拒绝发生在发请求之前：空文件 / 超 1MB / 非图片 / 没有文件', async() => {
    await expect(upload.uploadImage(makeFile('abc', { size: 0 }))).rejects.toThrow('文件是空的')
    await expect(upload.uploadImage(makeFile('abc', { size: MAX_IMAGE_BYTES + 1 }))).rejects.toThrow(/1024KB/)
    await expect(upload.uploadImage(makeFile('abc', { type: 'application/pdf' }))).rejects.toThrow('只能上传图片')
    await expect(upload.uploadImage(null as any)).rejects.toThrow('没有拿到文件')

    expect(txCgi).not.toHaveBeenCalled()
    expect(httpFetch).not.toHaveBeenCalled()
  })
})

describe('纯函数（入参/出参映射 + 逐项校验）', () => {
  it('buildInitParam / buildFinishParam 用服务端拼法（大小写照抄参考实现）', () => {
    expect(buildInitParam('songlist', { sha1: 'abc', name: 'a.png', size: 12 }))
      .toEqual({ BusID: 'songlist', Files: [{ FileSha1: 'abc', FileName: 'a.png', FileSize: 12 }] })
    expect(buildFinishParam('songlist', { bucket: 'b', region: 'r', objectKey: 'k' }))
      .toEqual({ BusID: 'songlist', Results: [{ Storage: { Bucket: { Name: 'b', Region: 'r' }, ObjectKey: 'k' }, UploadResult: 0 }] })
  })

  it('pickUploadTarget：逐项点名缺失字段（别把半个凭证用到直传上）', () => {
    expect(() => pickUploadTarget({})).toThrow(/缺 SecretID\/SecretKey\/Token\/ObjectKey\/Bucket.Name\/Bucket.Region/)
    const full = initOk().data
    expect(pickUploadTarget(full)).toMatchObject({
      secretId: 'AKIDEXAMPLE',
      bucket: 'music-file-1258344705',
      region: 'ap-guangzhou',
      objectKey: OBJECT_KEY,
      alreadyUploaded: false,
    })
  })

  it('pickCdnUrl：CDNURL 优先，URL 兜底，都没有就抛', () => {
    expect(pickCdnUrl({ Objects: [{ Url: { URL: 'http://a/', CDNURL: 'https://b/' } }] })).toBe('https://b/')
    expect(pickCdnUrl({ Objects: [{ Url: { URL: 'http://a/' } }] })).toBe('http://a/')
    expect(() => pickCdnUrl({ Objects: [] })).toThrow('上传完成但服务端未返回地址')
  })

  it('pickContentType：File.type 优先，其次扩展名，最后 octet-stream（它会参与签名，必须确定）', () => {
    expect(pickContentType({ type: 'image/jpeg', name: 'a.PNG' })).toBe('image/jpeg')
    expect(pickContentType({ type: '', name: 'a.PNG' })).toBe('image/png')
    expect(pickContentType({ name: 'a.webp' })).toBe('image/webp')
    expect(pickContentType({ name: 'a.unknown' })).toBe('application/octet-stream')
    expect(pickContentType({})).toBe('application/octet-stream')
  })
})

/** 直传那次 httpFetch 调用（只有一个 PUT，取最后一次即可，读起来更明确）。 */
function lastPutCall() {
  expect(httpFetch).toHaveBeenCalledTimes(1)
  return lastHttp()
}

/** 只用标准 sha1 算期望值（避免和被测实现共用同一处算法）。 */
function sha1Of(text: string) {
  return createHash('sha1').update(text).digest('hex')
}
