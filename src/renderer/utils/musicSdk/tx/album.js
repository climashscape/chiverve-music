import { getQQCredential } from '@renderer/utils/ipc'
import { txCgi, buildComm } from './utils/request'
import { createSong } from './utils/song'

/**
 * 专辑数据层（M5）：专辑详情 / 专辑歌曲 / 新碟上架。
 *
 * 端点是照 QQMusicApi `modules/album.py` 移植的，参数与**响应结构全部真机实测过**
 * （登录态 + 主窗口 CDP 直连网关，探测记录见 M5 报告）。改这个文件前先读这五条：
 *
 *   1. 🔴 **`GetAlbumSongList` 在安卓 comm 下必定失败**：实测 `code=104403`（连打三次 +
 *      在成功一次 WEB 之后再打，都是 104403）。换成 WEB 形态就 `code=0`。所以取专辑歌曲
 *      **必须走 WEB 档案**，别顺手把 comm 换成 android。另外它连访客 comm（无 authst）
 *      都能过 —— 失败与登录态无关，纯粹是档案不对。
 *   2. `GetAlbumDetail` 对 key 很宽容：`albumMId`（参考实现用的）、`albumMid`、`albumId`
 *      三种都返回了同一张专辑。这里照参考实现走：**纯数字 → `albumId`（数字型）、
 *      其它 → `albumMId`（mid）**。传一个不存在的 mid 拿到的是 `code=104400` +
 *      字段全空的 basicInfo（**不是** null data），所以判空要判 `basicInfo.albumMid`。
 *   3. 详情响应里**没有曲目总数**：`basicInfo.recordNum` 实测是空串（新旧专辑都是），
 *      别拿它当歌曲数。总数只能从 `getAlbumSongs` 的 `totalNum` 拿。
 *   4. `getAlbumSongs` 的条目是 `{ songInfo, listenCount, uploadTime, isThemeSong, teamStr }`，
 *      **歌曲在 `songInfo` 里**（标准 Song 对象，可直接喂 createSong）；`songList[i].index`
 *      实测不存在（想显示曲序得自己按数组下标算，或看 `songInfo.index_album`）。
 *   5. 新碟的 `area` **真的生效**（实测 1..6 的 total 各不相同：4423/1088/6148/1663/1645/2381），
 *      与 MV 列表的 area/version 形同虚设不同。新碟条目的封面 mid 在 `photo.pic_mid`，
 *      但那是带 `_1` 后缀的变体，拼封面仍按本仓约定用专辑 mid。
 */

const PAGE_SIZE = 30
/** 新碟默认地区：1 = 内地。 */
const NEW_ALBUM_AREA = 1

const requireCredential = async() => {
  const credential = await getQQCredential()
  if (credential == null) throw new Error('QQ 音乐未登录')
  return credential
}

/** 专辑/歌曲类接口走 WEB 档案（专辑歌曲在安卓档案下会 104403，见文件头第 1 条）。 */
const webComm = credential => buildComm(credential)

/** 纯数字才算「数字 id」——mid 里也可能有数字，所以用整串匹配而不是 \d 搜索。 */
const isNumericId = value => /^\d+$/.test(String(value ?? '').trim())

const albumImg = (mid, size = 500) => mid ? `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${mid}.jpg` : ''
const singerImg = (mid, size = 500) => mid ? `https://y.gtimg.cn/music/photo_new/T001R${size}x${size}M000${mid}.jpg` : ''

const singerNames = singers => Array.isArray(singers)
  ? singers.map(s => s?.name ?? '').filter(Boolean).join('、')
  : ''

/**
 * 专辑详情响应里的歌手条目 → 本仓通用的歌手摘要。
 * ⚠️ 两个接口的歌手条目**不同构**：详情是 `singer.singerList[]`（数字 id 叫 `singerID`，大写 D），
 * 新碟的 `albums[].singers[]` 数字 id 叫 `id`（实测）——所以两个键都要接。
 */
const toSinger = raw => ({
  id: String(raw?.singerID ?? raw?.id ?? ''),
  mid: raw?.mid ?? '',
  name: raw?.name ?? '',
  img: singerImg(raw?.mid),
  source: 'tx',
})

export default {
  /**
   * 专辑详情。`value` 传专辑 mid 或数字 albumId 都行（实测两种参数形态都通）。
   * 返回单张专辑对象（不是列表）。
   */
  async getAlbumDetail(value) {
    const credential = await requireCredential()
    const id = String(value ?? '').trim()
    if (!id) throw new Error('缺少专辑 id')
    const node = await txCgi({
      module: 'music.musichallAlbum.AlbumInfoServer',
      method: 'GetAlbumDetail',
      // 数字走 albumId（且必须是数字型）、其它走 albumMId —— 照参考实现的选择规则
      param: isNumericId(id) ? { albumId: Number(id) } : { albumMId: id },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const basic = data?.basicInfo ?? {}
    // 不存在的专辑：code=104400 + basicInfo 字段全空（不是 data=null），所以这里判 mid
    if (!basic.albumMid) throw new Error('专辑不存在或已下架')
    const singers = (data?.singer?.singerList ?? []).map(toSinger)
    return {
      id: String(basic.albumID ?? ''),
      mid: basic.albumMid,
      name: basic.albumName ?? '',
      transName: basic.tranName ?? '',
      img: albumImg(basic.albumMid),
      pmid: basic.pmid ?? '',
      singer: singerNames(singers),
      singers,
      // publishDate 本来就是 'YYYY-MM-DD' 字符串，不要当时间戳转
      publishDate: basic.publishDate ?? '',
      language: basic.language ?? '',
      // '录音室专辑' / 'EP' 这类展示文案
      albumType: basic.albumType ?? '',
      genre: basic.genre ?? '',
      desc: basic.desc ?? '',
      company: data?.company?.name ?? '',
      wikiurl: basic.wikiurl ?? '',
      source: 'tx',
    }
  },

  /**
   * 专辑歌曲列表。`value` 同 getAlbumDetail；`begin/num` 是偏移式分页
   * （实测 begin=1&num=2 会回 `curBegin=1` 且换歌，偏移有效）。
   */
  async getAlbumSongs(value, page = 1, num = PAGE_SIZE) {
    const credential = await requireCredential()
    const id = String(value ?? '').trim()
    if (!id) throw new Error('缺少专辑 id')
    const begin = num * (page - 1)
    const node = await txCgi({
      module: 'music.musichallAlbum.AlbumSongList',
      method: 'GetAlbumSongList',
      param: {
        begin,
        num,
        // ⚠️ 注意大小写：详情用 albumMId，歌曲列表用 albumMid（小写 d）——照参考实现抄
        ...(isNumericId(id) ? { albumId: Number(id) } : { albumMid: id }),
      },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const rawList = data?.songList ?? []
    // 歌曲在 songList[i].songInfo 里（见文件头第 4 条）
    const list = rawList.map(item => item?.songInfo).filter(song => song != null)
    const total = Number(data?.totalNum ?? 0)
    return {
      list: list.map(createSong),
      total,
      page,
      limit: num,
      source: 'tx',
      hasMore: begin + list.length < total,
      albumMid: data?.albumMid ?? (isNumericId(id) ? '' : id),
    }
  },

  /**
   * 新碟上架。`area` 1..6 = 内地 / 港台 / 欧美 / 韩国 / 日本 / 其他（实测各地区的 total 不同，
   * 筛选确实生效）；`start/num` 是偏移式分页。
   */
  async getNewAlbum(area = NEW_ALBUM_AREA, num = PAGE_SIZE, page = 1) {
    const credential = await requireCredential()
    // 三个参数都按数字发出（与探测时被网关接受的形态一致）：UI 的下拉框/输入框可能给出字符串
    const size = Number(num)
    const start = size * (page - 1)
    const node = await txCgi({
      module: 'newalbum.NewAlbumServer',
      method: 'get_new_album_info',
      param: { area: Number(area), num: size, start },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const list = (data?.albums ?? []).map(raw => ({
      id: String(raw?.id ?? ''),
      mid: raw?.mid ?? '',
      name: raw?.name ?? '',
      // 外文专辑的中文/译名字段（可能是空串）
      transName: raw?.trans_name ?? '',
      img: albumImg(raw?.mid),
      // ⚠️ 这里歌手数组的字段是 singers（与专辑详情的 singer.singerList 不同构）
      singer: singerNames(raw?.singers),
      singers: (raw?.singers ?? []).map(toSinger),
      // release_time 是 'YYYY-MM-DD' 字符串
      publishDate: raw?.release_time ?? '',
      area: Number(raw?.area ?? 0),
      language: Number(raw?.language ?? 0),
      genre: Number(raw?.genre ?? 0),
      company: raw?.company?.name ?? '',
      // ⚠️ ex.track_nums 实测恒为 0（新碟接口不填），别当曲目总数用
      source: 'tx',
    }))
    const total = Number(data?.total ?? list.length)
    return {
      list,
      total,
      page,
      limit: size,
      source: 'tx',
      hasMore: start + list.length < total,
    }
  },
}
