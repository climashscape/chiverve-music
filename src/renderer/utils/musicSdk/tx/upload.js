import { httpFetch } from '../../request'
import { txCgi, buildComm, requireCredential } from './utils/request'
import { buildCosAuthorization, buildSignTime, sha1Hex } from './utils/cos'

/**
 * QQ 音乐的文件上传（**直传腾讯云 COS**，2026-09-26 探针实测）。
 *
 * 用途：把本地图片传到 QQ 的 COS 桶并拿回 CDN 地址——目前唯一的消费方是「建云端歌单时带
 * 自定义封面」（`songList.createList` 的 `dirPicUrl`）。
 *
 * 三步（照参考实现 `QQMusicApi/modules/helper_utils.py:134-280` 的 `UploadFileSession`）：
 *
 *   1. `music.filesys.FileSystem / InitUpload`：报 `{FileSha1, FileName, FileSize}`，
 *      拿回 **COS 临时密钥**（`AuthInfo`，TTL 6 小时）+ 每个文件的目标桶与 `ObjectKey`；
 *   2. 带临时密钥**直接 PUT 到 COS 桶**（`<bucket>.cos.<region>.myqcloud.com/<ObjectKey>`，
 *      签名见 `utils/cos.js`）——这一步不经 QQ 网关；
 *   3. `music.filesys.FileSystem / FinishUpload`：回报 `{Storage, UploadResult:0}`，
 *      服务端登记并返回各形态访问地址（我们要 `Url.CDNURL`）。
 *
 * 真机实测（2026-09-26，本机 dev 凭证 + 自造 1×1 PNG）：
 *   - 两个载体都通：`musicu.fcg`（WEB 档案，明文）与 `musics.fcg?sign=`（安卓档案）都 `code: 0`
 *     ——所以走 `txCgi` 默认那条即可，不需要为上传准备签名通道；
 *   - `ObjectKey` 形如 `songlist/u/<encryptUin>/<分段>/<hash>_<n>.png`（**含 encryptUin**，
 *     所以本模块对外只回 CDN 地址，不回 ObjectKey）；
 *   - `FinishUpload` 回来的 `Url.CDNURL` 实测可直接 GET（200 / `Content-Type: image/png`）；
 *   - `Buckets` 有两个（`ap-guangzhou` 与 `accelerate` 各一条），照参考实现取**第一个**。
 */

/** 文件系统模块名（参考实现 `modules/helper.py:39,67`）。 */
const FILESYS_MODULE = 'music.filesys.FileSystem'
/** 业务位：「歌单封面」（参考实现 `examples/upload_file.py:16` 的 `bus_id="songlist"`）。 */
export const BUS_ID_SONGLIST = 'songlist'
/**
 * 歌单封面的大小上限 1MB（y.qq.com 的歌单编辑页口径：300×300 px、支持 JPG/JPEG/GIF、≤1MB）。
 * 本模块是「图片直传」的通用口，所以把上限放在这里、由调用方决定是否更严。
 */
export const MAX_IMAGE_BYTES = 1024 * 1024

/** 扩展名 → Content-Type 兜底（`File.type` 为空时才用）。 */
const EXT_CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

/**
 * 取参与签名的 Content-Type。
 *
 * ⚠️ 这个值会**参与签名**（`q-header-list` 里有 `content-type`），所以发送时必须用同一个值
 * ——改这里就要同时改 PUT 的头，否则 COS 回 403 SignatureDoesNotMatch。
 */
export const pickContentType = (file) => {
  if (file?.type && /^image\//i.test(file.type)) return file.type.toLowerCase()
  const ext = String(file?.name ?? '').split('.').pop()?.toLowerCase() ?? ''
  return EXT_CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

/** `InitUpload` 的入参（纯函数，单测钉住字段名与大小写）。 */
export const buildInitParam = (busId, { sha1, name, size }) => ({
  BusID: busId,
  Files: [{ FileSha1: sha1, FileName: name, FileSize: size }],
})

/**
 * 从 `InitUpload` 的 `data` 里取出「直传要用的那一套」，缺一项就抛（别把半个凭证用到 PUT 上）。
 * 返回值里的密钥**只在本模块内流转**，不外传、不打印。
 */
export const pickUploadTarget = (data) => {
  const auth = data?.AuthInfo ?? {}
  const file = (data?.Files ?? [])[0]
  const bucket = (file?.Buckets ?? [])[0]?.Bucket ?? {}
  const missing = []
  if (!auth.SecretID) missing.push('SecretID')
  if (!auth.SecretKey) missing.push('SecretKey')
  if (!auth.Token) missing.push('Token')
  if (!file?.ObjectKey) missing.push('ObjectKey')
  if (!bucket.Name) missing.push('Bucket.Name')
  if (!bucket.Region) missing.push('Bucket.Region')
  if (missing.length) throw new Error(`上传初始化返回不完整（缺 ${missing.join('/')}）`)
  return {
    secretId: auth.SecretID,
    secretKey: auth.SecretKey,
    token: auth.Token,
    bucket: bucket.Name,
    region: bucket.Region,
    objectKey: file.ObjectKey,
    // 服务端认为这个 sha1 已经在库里（同图重复上传）→ 跳过第 2 步直传
    alreadyUploaded: (file.Buckets ?? [])[0]?.UploadStatus === 1,
  }
}

/** `FinishUpload` 的入参（纯函数）。 */
export const buildFinishParam = (busId, { bucket, region, objectKey }) => ({
  BusID: busId,
  Results: [{ Storage: { Bucket: { Name: bucket, Region: region }, ObjectKey: objectKey }, UploadResult: 0 }],
})

/** 从 `FinishUpload` 的 `data` 里取 CDN 地址（拿不到就抛）。 */
export const pickCdnUrl = (data) => {
  const url = (data?.Objects ?? [])[0]?.Url ?? {}
  const cdn = url.CDNURL || url.URL
  if (!cdn) throw new Error('上传完成但服务端未返回地址')
  return cdn
}

/** 直传 COS 那一步（单独拎出来便于单测喂假的 httpFetch）。 */
const putToCos = async({ buffer, contentType, target }) => {
  const host = `${target.bucket}.cos.${target.region}.myqcloud.com`
  const path = `/${target.objectKey}`
  const signTime = buildSignTime()
  // 只签这三个头（见 utils/cos.js 的文件头）：host / content-type / x-cos-security-token。
  // 临时密钥必须随请求带 `x-cos-security-token`，否则 COS 认不出密钥归属。
  const signedHeaders = {
    host,
    'content-type': contentType,
    'x-cos-security-token': target.token,
  }
  const authorization = buildCosAuthorization({
    secretId: target.secretId,
    secretKey: target.secretKey,
    method: 'put',
    path,
    headers: signedHeaders,
    signTime,
  })

  const res = await httpFetch(`https://${host}${path}`, {
    method: 'put',
    headers: {
      Host: host,
      'Content-Type': contentType,
      'x-cos-security-token': target.token,
      Authorization: authorization,
      // 让 needle 按 Buffer 原样发（不加长度以外的处理）
      'Content-Length': buffer.length,
    },
    body: buffer,
    json: false,
  }).promise

  const status = Number(res?.statusCode ?? 0)
  if (status < 200 || status >= 300) throw new Error(`直传 COS 失败（HTTP ${status || '未知'}）`)
}

export default {
  /**
   * 上传一张图片到 QQ 的 COS 桶，返回可直接用的 CDN 地址。
   *
   * @param {File | { name?: string, type?: string, size?: number, arrayBuffer(): Promise<ArrayBuffer> }} file
   *   浏览器 `<input type="file">` 的 File 对象（只要这几个字段，测试好替身）。
   * @param {string} busId 业务位，默认歌单封面。
   * @returns {Promise<{ url: string }>} `url` 是 `FinishUpload` 的 `Url.CDNURL`
   *   （形如 `https://music-file.y.qq.com/<busid>/u/<encryptUin>/…`，可直接当 `<img src>`）。
   */
  async uploadImage(file, busId = BUS_ID_SONGLIST) {
    if (file == null || typeof file.arrayBuffer !== 'function') throw new Error('没有拿到文件')
    const size = Number(file.size ?? 0)
    if (!size) throw new Error('文件是空的')
    if (size > MAX_IMAGE_BYTES) throw new Error(`图片不能超过 ${Math.round(MAX_IMAGE_BYTES / 1024)}KB`)
    if (file.type && !/^image\//i.test(file.type)) throw new Error('只能上传图片')

    const buffer = Buffer.from(await file.arrayBuffer())
    const sha1 = sha1Hex(buffer)
    const name = String(file.name || 'cover.png')
    const credential = await requireCredential()
    const comm = buildComm(credential)

    // 1) 初始化：换临时密钥 + 目标桶 + ObjectKey
    const initNode = await txCgi({
      module: FILESYS_MODULE,
      method: 'InitUpload',
      param: buildInitParam(busId, { sha1, name, size: buffer.length }),
    }, comm).promise
    if (Number(initNode?.code ?? -1) !== 0) throw new Error(`上传初始化失败（code ${initNode?.code ?? '未知'}）`)
    const target = pickUploadTarget(initNode?.data)

    // 2) 直传 COS（服务端已按 sha1 判过重复就跳过）
    if (!target.alreadyUploaded) {
      await putToCos({ buffer, contentType: pickContentType(file), target })
    }

    // 3) 完成：服务端登记并回地址
    const finishNode = await txCgi({
      module: FILESYS_MODULE,
      method: 'FinishUpload',
      param: buildFinishParam(busId, target),
    }, comm).promise
    if (Number(finishNode?.code ?? -1) !== 0) throw new Error(`上传未完成（code ${finishNode?.code ?? '未知'}）`)
    return { url: pickCdnUrl(finishNode?.data) }
  },
}
