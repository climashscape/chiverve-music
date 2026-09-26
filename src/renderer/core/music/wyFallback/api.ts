import { log } from '@common/utils'
import { httpFetch } from '@renderer/utils/request'

/**
 * 网易云明文接口客户端 —— **只服务于「QQ 取不到流时静默顶替」这一件事**，不是第二个音乐源。
 *
 * ## 为什么没有加密（weapi / eapi）
 *
 * 2026-09-26 实测：网页版自己用的这两条接口**明文就能调通**，返回完整 JSON——
 * - 搜索：`GET /api/search/get/web?s=<关键词>&type=1&limit=N`
 * - 取流：`GET /api/song/enhance/player/url/v1?ids=[<id>]&level=standard&encodeType=mp3`
 *
 * 于是本模块**不引入** weapi 的 AES+RSA 实现（上游那份 `wy/utils/crypto.js` 也随单源化删了）：
 * 少一份要跟着网易改的加密代码、少一份 RSA 公钥常量。将来明文接口若被关，再考虑补加密。
 *
 * ## 身份与凭据：一律匿名
 *
 * 不带任何 Cookie（用户 2026-09-26 拍板「先纯匿名」）。代价是**只能拿非 VIP 曲目**：同日实测
 * 3 首里 2 首 302 到 `/404`（含「晴天」），所以 VIP / 独家曲目这条兜底也救不了——调用方必须
 * 能接受「兜底也失败」是常态。将来要补 `MUSIC_U`：请求头加一条 `Cookie` 即可，落盘照 QQ 凭证
 * 那套走主进程 store（不进设置文件——设置会被同步与导出带走）。
 *
 * 请求头照 §8.1 用浏览器形态（官方网页版就是这么发的），**不自报第三方**。
 */

const WY_HOST = 'https://music.163.com'
const TIMEOUT = 10_000
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: `${WY_HOST}/`,
}

/** 搜索响应是 `text/plain` 的 JSON 串（实测），needle 不会替我们解析，所以两种形态都接 */
const parseBody = (body: any): any => {
  if (body == null) return null
  if (typeof body != 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * `httpFetch` 来自 .js 模块（`renderer/utils/request.js`），`promise` 是运行时后挂上去的字段、
 * 类型推不出来，所以在这一处补签名——**别把这个 cast 散到各个调用点**。
 */
const httpGet = async(url: string): Promise<{ body: any }> =>
  (httpFetch(url, { method: 'get', timeout: TIMEOUT, headers: HEADERS }) as unknown as {
    promise: Promise<{ body: any }>
  }).promise

/** 搜索候选（只留匹配用得上的字段，响应里其余几十个字段一概不取） */
export interface WySongInfo {
  id: number
  name: string
  singer: string
  albumName: string
  /** 时长（秒）；拿不到记 0 = 未知 */
  duration: number
}

/**
 * 按关键词搜单曲（`type=1`）。
 *
 * **失败一律返回空数组**：这是兜底链路，它自己出问题不该改变原有失败行为——调用方拿到空候选
 * 就照旧报错，与没有这个功能时完全一致。
 */
export const searchMusic = async(keyword: string, limit = 20): Promise<WySongInfo[]> => {
  const url = `${WY_HOST}/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=0`
  return httpGet(url).then(({ body }) => {
    const songs = parseBody(body)?.result?.songs
    if (!Array.isArray(songs)) return []
    return songs.map((song: any): WySongInfo => ({
      id: song.id,
      name: typeof song.name == 'string' ? song.name : '',
      // 多歌手统一用 `、` 连接：与渲染侧 `singer` 字段的形态一致（匹配时还要再规范一次）
      singer: Array.isArray(song.artists) ? song.artists.map((artist: any) => artist?.name).filter(Boolean).join('、') : '',
      albumName: song.album?.name ?? '',
      duration: typeof song.duration == 'number' ? Math.round(song.duration / 1000) : 0,
    }))
  }).catch((err: any) => {
    log.warn('[wy-fallback] 搜索失败，按「没有候选」处理', err?.message ?? err)
    return []
  })
}

/**
 * 取一首歌的播放直链。
 *
 * **只认 128k（`level=standard`）**：用户口径是「音质可以不考虑」，而低档位正是匿名能拿到的那一档
 * （实测返回 `br: 128000`）。
 *
 * 返回 `null` 表示「这首拿不到可用直链」，三种情形都算：
 * - `code != 200` 或 `url` 为空（VIP / 下架曲目实测是 `code: 404, url: null`）；
 * - 只有**试听片段**（`freeTrialInfo` 非空）：播 60 秒片段比不播更容易被用户发现，与
 *   「宁可不播、不放错」同一条口径；
 * - 网络或解析失败。
 */
export const getMusicUrl = async(id: number): Promise<string | null> => {
  const url = `${WY_HOST}/api/song/enhance/player/url/v1?ids=%5B${id}%5D&level=standard&encodeType=mp3`
  return httpGet(url).then(({ body }) => {
    const data = parseBody(body)?.data?.[0]
    if (!data || data.code !== 200) return null
    if (data.freeTrialInfo != null) return null
    return typeof data.url == 'string' && data.url ? data.url : null
  }).catch((err: any) => {
    log.warn('[wy-fallback] 取流失败', err?.message ?? err)
    return null
  })
}
