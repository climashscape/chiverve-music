import { getQQCredential } from '@renderer/utils/ipc'
import { formatPlayTime, sizeFormate } from '../../index'
import { txCgi, buildComm } from './utils/request'

/**
 * MV 数据层（M5）：分类列表 / 详情 / 播放地址。
 *
 * 端点是照 QQMusicApi `modules/mv.py` 移植的，参数与**响应结构全部真机实测过**
 * （登录态 + 主窗口 CDP 直连网关，探测记录见 M5 报告）。改这个文件前先读这六条：
 *
 *   1. 🔴 **列表的 `area` / `version` 实测不生效**：area=15/8/4、version=7/13 拿到的是同一批
 *      vid（三种 comm 档案都一样）；只有 `order`（0 最新 / 1 最热）与 `start`/`size` 偏移
 *      真的换内容。参数仍照参考实现传（将来服务端修了就能用），但 UI 上先别把这两个当真筛选。
 *   2. 🔴 **这两个参数必须是数字**：传字符串（`{ area: '8', version: '8' }`）服务端**静默返回
 *      空列表**（实测 `code=0` + `total=0` + `list=[]`，不是报错）。所以这里强制 `Number()`
 *      再发出，避免 UI 从下拉框拿到字符串就整页空白。
 *   3. 🔴 **`get_video_info_batch` 的 `required` 是必填**：实测省掉它照样 `code=0`，但 `data`
 *      直接是 null（静默空）。参考实现那张字段清单就是必须原样带的 —— 这里固化成常量。
 *   4. 详情的响应是**以 vid 为键的字典**（`data[vid]`），列表项的 `mvid` 与详情的 `sid`
 *      实测同值（都是数字 id），vid 才是跨接口的键。详情里没有 `title`/`subtitle`，
 *      只有 `name`；不存在的 vid 返回 `data` 为**空对象**（不是 null），判空要判 `data[vid]`。
 *   5. 播放地址只走 **mp4**：实测可用档是 filetype 10/20/30/40（code=0，fileSize 递增）；
 *      0/50/60/70/80/90 都是 code=2000（无权限/不存在）；**hls 全部 code=2050**
 *      （这个账号下拿不到），所以别去挑 hls。直链在 `url[0]`（数组两项，vkey 已内嵌），
 *      `m3u8` 为空、`expire` 86400 秒。**同一档位会同时回 264/265 两条记录**，挑档必须认
 *      `format`（见下方 `MV_REQUEST_FORMAT` 与 `pickPlayable`）。
 *   6. `GetMvUrls` 一次可传多个 vid（返回值按 vid 分键，实测两个都回），详情同理 ——
 *      所以批量接口是顺手实现的，不额外花请求。
 */

const PAGE_SIZE = 20
/** 取流那套的 guid 占位（M3 取流实测用 '10000'，这里保持一致）。 */
const MV_GUID = '10000'
/** 列表默认筛选：15=全部, 7=全部, 0=最新（照参考实现的默认值）。 */
const MV_AREA_ALL = 15
const MV_VERSION_ALL = 7
const MV_ORDER_LATEST = 0

/** 编码：264 = H.264/AVC。265 是 H.265/HEVC，本机解不开（理由见 `MV_REQUEST_FORMAT`）。 */
const CODEC_H264 = 264

/**
 * 请求里的 `format` 只点 **264（H.264）**。
 *
 * 🔴 为什么不能点 265（这里原来是 265）：那是在主动要 H.265 档，而本机根本解不开它——
 *   1. Electron 自带的 `node_modules/electron/dist/libffmpeg.so` **没有 HEVC 解码器**
 *      （`nm -D --defined-only libffmpeg.so | grep _decoder` 只有 17 个：h264/aac/mp3/
 *      flac/vorbis/opus/pcm…，没有 `ff_hevc_decoder`），软解这条路不存在；
 *   2. 硬解也没有：本机缺 VAAPI 驱动（`/usr/lib/x86_64-linux-gnu/dri/nvidia_drv_video.so`
 *      不存在，`vainfo` 报 `va_openDriver() returns -1`）。
 * 于是 `<video>` 拿到流就是 `MEDIA_ERR_SRC_NOT_SUPPORTED(4)`，界面只剩黑框——这正是
 * 2026-09-24 真机报的「MV 无法播放」。两个参考实现（Rain120/qq-music-api、
 * copws/qq-music-api）请求的也都是 `format: 264`。
 *
 * ⚠️ 264 请求是否**只**回 264 档位，本轮没有真机复验（票面 §需真机确认）；所以 `pickPlayable`
 * 还按 `format` 兜了一层——响应里混着 265 时也不会挑到解不开的那条。
 */
const MV_REQUEST_FORMAT = CODEC_H264

/**
 * `get_video_info_batch` 的 `required` 字段清单 —— **必须原样带**（见文件头第 3 条），
 * 少传或改顺序都会让服务端回空 data。这是参考实现里的那一份。
 */
const MV_DETAIL_FIELDS = [
  'vid', 'type', 'sid', 'cover_pic', 'duration', 'singers', 'video_switch', 'msg', 'name',
  'desc', 'playcnt', 'pubdate', 'isfav', 'gmid', 'uploader_headurl', 'uploader_nick',
  'uploader_encuin', 'uploader_uin', 'uploader_hasfollow', 'uploader_follower_num', 'related_songs',
]

const requireCredential = async() => {
  const credential = await getQQCredential()
  if (credential == null) throw new Error('QQ 音乐未登录')
  return credential
}

const webComm = credential => buildComm(credential)

/** unix 秒 → 'YYYY-MM-DD'；0/缺失返回 undefined（MV 的 pubdate 实测是秒级时间戳）。 */
const toDate = ts => {
  if (!ts) return undefined
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** MV 歌手条目 → 统一歌手摘要（MV 里带 picurl，但按本仓惯例用 mid 拼 T001）。 */
const toSinger = raw => ({
  id: String(raw?.id ?? ''),
  mid: raw?.mid ?? '',
  name: raw?.name ?? '',
  img: raw?.mid ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${raw.mid}.jpg` : '',
  source: 'tx',
})

const singerNames = singers => Array.isArray(singers)
  ? singers.map(s => s?.name ?? '').filter(Boolean).join('、')
  : ''

/**
 * 列表项 → MV 卡片。`interval` 与歌曲对象同名同格式（'mm:ss'）方便列表组件复用；
 * 想拿秒数用 `duration`（这两个字段都由响应里的 `duration` 秒数派生）。
 */
const toMvInfo = raw => {
  const singers = (raw?.singers ?? []).map(toSinger)
  return {
    // 列表给的是 mvid（数字 id）+ vid（字符串，跨接口的键）
    id: String(raw?.mvid ?? ''),
    vid: raw?.vid ?? '',
    name: raw?.title ?? '',
    subName: raw?.subtitle ?? '',
    img: raw?.picurl ?? '',
    singer: singerNames(singers),
    singers,
    interval: raw?.duration ? formatPlayTime(raw.duration) : null,
    duration: Number(raw?.duration ?? 0),
    playCount: Number(raw?.playcnt ?? 0),
    commentCount: Number(raw?.comment_cnt ?? 0),
    starCount: Number(raw?.star_cnt ?? 0),
    pubDate: toDate(raw?.pubdate),
    source: 'tx',
  }
}

/**
 * 详情原始对象 → MV 详情。列表项没有而详情有的字段（desc / uploader / related_songs）
 * 只在这里出现。
 */
const toMvDetail = (vid, raw) => {
  const singers = (raw?.singers ?? []).map(toSinger)
  return {
    // ⚠️ 详情没有 mvid，数字 id 是 sid（实测与列表的 mvid 同值）
    id: String(raw?.sid ?? ''),
    vid: raw?.vid ?? vid,
    gmid: raw?.gmid ?? '',
    name: raw?.name ?? '',
    desc: raw?.desc ?? '',
    img: raw?.cover_pic ?? '',
    singer: singerNames(singers),
    singers,
    interval: raw?.duration ? formatPlayTime(raw.duration) : null,
    duration: Number(raw?.duration ?? 0),
    playCount: Number(raw?.playcnt ?? 0),
    pubDate: toDate(raw?.pubdate),
    type: Number(raw?.type ?? 0),
    // isfav / uploader_hasfollow 实测是 0/1 数字，统一转成布尔（UI 直接用）
    isFav: Number(raw?.isfav ?? 0) === 1,
    // 关联歌曲 id（数字），想跳「MV 关联歌曲」时用
    relatedSongIds: raw?.related_songs ?? [],
    uploader: {
      uin: raw?.uploader_uin ?? '',
      encUin: raw?.uploader_encuin ?? '',
      name: raw?.uploader_nick ?? '',
      img: raw?.uploader_headurl ?? '',
      followerNum: Number(raw?.uploader_follower_num ?? 0),
      hasFollow: Number(raw?.uploader_hasfollow ?? 0) === 1,
    },
    source: 'tx',
  }
}

/**
 * 批量详情请求体 → 归一化后的 MV 详情数组。
 *
 * 这是模块级函数而不是对象方法：`getMvDetail` 也要用它，走 `this.xxx` 的话调用方一旦
 * 解构（`const { getMvDetail } = mv`）就会炸。
 *
 * 不存在的 vid 在 data 里**缺键**（data 是空对象而不是 null），按入参顺序取、缺的丢掉 ——
 * 所以返回数组的长度/顺序不保证与入参一致，调用方按 `item.vid` 认。
 */
const requestMvDetails = async(credential, vidList) => {
  const node = await txCgi({
    module: 'video.VideoDataServer',
    method: 'get_video_info_batch',
    param: {
      vidlist: vidList,
      // ⚠️ required 必填：省掉它 data 会是 null（实测，见文件头第 3 条）
      required: MV_DETAIL_FIELDS,
    },
  }, webComm(credential)).promise
  // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
  const data = node?.data ?? {}
  return vidList
    .map(vid => (data?.[vid] ? toMvDetail(vid, data[vid]) : null))
    .filter(detail => detail != null)
}

/**
 * 从**已过滤的可用档**里挑一条：先按编码挑 H.264，再在同编码里挑最高档。
 *
 * 为什么不能只挑 `list[list.length - 1]`（原来的做法）：`list` 只按 filetype 升序排，
 * 而同档位的 264/265 是两条独立记录（`sort` 稳定 → 谁落在后面完全取决于服务端返回顺序），
 * 于是「选到 265 = 选到解不开的流」是个随机事件。这里对顺序不做任何假设：
 * 同档位有 264 就先取 264；整份响应一条 264 都没有时，才回落到 265 ——
 * 别的平台（Windows 的 Media Foundation / macOS 的 VideoToolbox）能解，不该在这里硬拦。
 *
 * @param {Array<{filetype: number, format: number, url: string}>} list 可用档，filetype 升序
 * @param {number|null} filetype 指定档位；取不到（或传 null）时回落到「最高可用档」
 */
const pickPlayable = (list, filetype = null) => {
  const wanted = filetype == null ? null : Number(filetype)
  if (wanted != null) {
    const exact = list.filter(item => item.filetype === wanted)
    if (exact.length) return exact.find(item => item.format === CODEC_H264) ?? exact[exact.length - 1]
  }
  const h264 = list.filter(item => item.format === CODEC_H264)
  const pool = h264.length ? h264 : list
  return pool.length ? pool[pool.length - 1] : null
}

/**
 * 取播地址请求体 → `{ duration, interval, svpFlag, list, best }`。
 *
 * 只保留**真的能播**的档：`code === 0` 且 `url` 非空。不可用档（实测 filetype
 * 0/50/60/70/80/90 是 code=2000、hls 全是 code=2050）在这里被过滤掉，而不是透出
 * 让调用方自己判 —— 否则很容易挑到一个空 url 的档位。
 *
 * `list` 按 filetype 升序（实测档位越高 fileSize 越大，同一视频里 265 档是 filetype 10/20/30/40），
 * 264/265 两条都在里面（`format` 区分）；`best` 是**按编码偏好挑出来的那条**（同 `getMvUrl`），
 * 不是简单的最高档——否则调用方拿 `best` 直接播就会踩到 HEVC。
 */
const requestMvUrls = async(credential, mvId) => {
  const node = await txCgi({
    module: 'music.stream.MvUrlProxy',
    method: 'GetMvUrls',
    param: {
      vids: [mvId],
      request_type: 10003,
      guid: MV_GUID,
      videoformat: 1,
      // 只点 H.264，理由见 MV_REQUEST_FORMAT
      format: MV_REQUEST_FORMAT,
      dolby: 1,
      use_new_domain: 1,
      use_ipv6: 1,
    },
  }, webComm(credential)).promise
  // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
  const data = node?.data ?? {}
  const set = data?.[mvId] ?? {}
  const list = (set.mp4 ?? [])
    .filter(item => item?.code === 0 && Array.isArray(item.url) && item.url.length > 0)
    .map(item => ({
      filetype: Number(item.filetype ?? 0),
      // 264 / 265（HEVC）
      format: Number(item.format ?? 0),
      size: Number(item.fileSize ?? 0),
      sizeText: item.fileSize ? sizeFormate(item.fileSize) : '',
      // 直链（数组第一项即带 vkey 的可用地址）
      url: item.url[0],
      // 过期秒数（实测 86400）
      expire: Number(item.expire ?? 0),
    }))
    .sort((a, b) => a.filetype - b.filetype)
  return {
    vid: mvId,
    duration: Number(set.duration ?? 0),
    interval: set.duration ? formatPlayTime(set.duration) : null,
    svpFlag: Number(set.svp_flag ?? 0),
    list,
    best: pickPlayable(list),
  }
}

export default {
  /**
   * MV 分类列表。`order` 0=最新 / 1=最热 真的生效；`area`/`version` 只是照参考实现传
   * （实测不过滤，见文件头第 1 条）。`start/num` 是偏移式分页。
   *
   * 注意 `total` 实测**恒为 1000**（服务端上限），不能用来算总页数，`hasMore` 只能按
   * 「本页拿满了」判断。
   */
  async getMvList({ area = MV_AREA_ALL, version = MV_VERSION_ALL, order = MV_ORDER_LATEST, page = 1, num = PAGE_SIZE } = {}) {
    const credential = await requireCredential()
    const size = Number(num)
    const start = size * (page - 1)
    const node = await txCgi({
      module: 'MvService.MvInfoProServer',
      method: 'GetAllocMvInfo',
      param: {
        // 全部强制数字：字符串会让服务端静默回空列表（见文件头第 2 条）
        area: Number(area),
        version: Number(version),
        order: Number(order),
        start,
        size,
      },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const list = (data?.list ?? []).map(toMvInfo)
    return {
      list,
      // total 实测恒为 1000（上限值），不要拿它算页数
      total: Number(data?.total ?? 0),
      page,
      limit: size,
      source: 'tx',
      hasMore: list.length >= size,
    }
  },

  /** 单个 MV 详情。`vid` 是字符串键（列表项的 vid）。 */
  async getMvDetail(vid) {
    const credential = await requireCredential()
    const mvId = String(vid ?? '').trim()
    if (!mvId) throw new Error('缺少 MV vid')
    const [detail] = await requestMvDetails(credential, [mvId])
    if (detail == null) throw new Error('MV 不存在或已下架')
    return detail
  },

  /**
   * 批量 MV 详情（同一个接口，一次可传多个 vid）。返回**数组**，不存在的 vid 会被跳过
   * —— 所以不要假设返回顺序/长度与入参一致，按 `item.vid` 取。
   */
  async getMvDetails(vids) {
    const credential = await requireCredential()
    const vidList = (Array.isArray(vids) ? vids : [vids]).map(v => String(v ?? '').trim()).filter(Boolean)
    if (!vidList.length) throw new Error('缺少 MV vid')
    return requestMvDetails(credential, vidList)
  },

  /**
   * MV 播放地址全集。`list` 升序排列、只含可用档（264/265 都在，`format` 区分），
   * `best` 是按编码偏好挑出来的那条（优先 H.264，见 `pickPlayable`）；UI 想给用户选档位
   * 就直接拿 `list`，但**自己播时必须认 `format`**。
   */
  async getMvUrls(vid) {
    const credential = await requireCredential()
    const mvId = String(vid ?? '').trim()
    if (!mvId) throw new Error('缺少 MV vid')
    return { ...(await requestMvUrls(credential, mvId)), source: 'tx' }
  },

  /**
   * 取单个可播地址。`filetype` 传了就精确取那一档（同档位有 H.264 时优先它），
   * 取不到（或没传）时回落到最高可用档；一档都没有则抛错（实测无权限的 MV 会遇到，
   * 别静默返回空字符串）。
   *
   * 返回值里的 `format` 是编码（264/265）：本机解不开 265（见 `MV_REQUEST_FORMAT`），
   * UI 把编码显示在提示行上，失败时才能把「编码不支持」和「直链过期」分开说。
   */
  async getMvUrl(vid, filetype) {
    const credential = await requireCredential()
    const mvId = String(vid ?? '').trim()
    if (!mvId) throw new Error('缺少 MV vid')
    const { list, duration, interval } = await requestMvUrls(credential, mvId)
    const picked = pickPlayable(list, filetype)
    if (picked == null) throw new Error('该 MV 没有可用播放地址')
    return {
      vid: mvId,
      filetype: picked.filetype,
      format: picked.format,
      size: picked.size,
      sizeText: picked.sizeText,
      url: picked.url,
      expire: picked.expire,
      duration,
      interval,
      source: 'tx',
    }
  },
}
