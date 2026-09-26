import { getQQCredential } from '@renderer/utils/ipc'
import { decodeName } from '../../index'
import { buildComm, txCgi } from './utils/request'
import musicSearch from './musicSearch'

/**
 * 长音频（有声书 / 节目）数据层：**只负责找到「节目专辑」**。
 *
 * 探针 2026-09-26（脚本 `scripts/verify/probe-qq/probe_longaudio.py` 与 `probe_longaudio2.py`，
 * 记录 `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-radio.md`）。改本文件前先读这六条：
 *
 *   1. **没有独立的「节目列表」端点**：fork（QQMusicApi）里跟长音频相关的只有
 *      `music.radioProxy.MbTrackRadioSvr/get_radio_track`（猜你喜欢电台，已落地在
 *      `tx/recommend.js` 的 getGuessRecommend）。节目专辑的浏览入口只有两处：
 *      首页 feed 的「热门节目」楼层（**只有安卓档案有**）与搜索 `search_type=15`。
 *   2. **feed 的档案差异**：WEB 档案只回 2 个楼层（为你打造 / 最近常听），安卓档案回 3 个
 *      （含 shelf 272「热门节目，听点不一样的」）。所以这里**单独打一次 feed 并固定 android** ——
 *      不要顺手改 `recommend.js` 的 getHomeFeed（那个刻意用 WEB，理由在那个文件里）。
 *   3. **节目卡片判据**（实测，用来把「数字专辑热卖中」楼层排除掉）：`type=400`
 *      **且** `subtype=410` **且** `jumptype=10025`。数字专辑同样是 `type=400`，但
 *      `subtype=416` / `jumptype=10002`、scheme 是 h5 售卖页 —— 只按 type 过滤会混进数字专辑。
 *   4. 卡片字段：`id` 是节目专辑的**数字 albumId**（与 scheme
 *      `qqmusic://qq.com/ui/album?p={"id":…}` 里的 id 一致）、`title` 专辑名、`cover` 封面直链、
 *      `cnt` 播放量。卡片里**没有 mid / 播讲人 / 集数** —— 要这些得再取一次详情，而本仓
 *      `/album` 页做的正是这件事（所以点卡片直接进那一页，不在这里补字段）。
 *   5. 搜索用**桌面端点** `DoSearchForQQMusicDesktop` + `search_type=15`（节目专辑），结果在
 *      `body.album.list`。⚠️ 同端点的 `search_type=18`（fork 里叫「节目」）**被服务端当成 0**
 *      （实测返回与单曲搜索同源的普通歌曲），别用 18。
 *   6. **单集不需要新链路**：单集在数据层与普通歌曲同构 ——
 *      `music.musichallAlbum.AlbumSongList/GetAlbumSongList`（入参数字 `albumId` 或 `albumMid`）
 *      回 `songList[].songInfo`（标准 Song：mid / file.media_mid / interval / singer[] / album.mid），
 *      `totalNum` 是总集数；本仓 `tx/album.js` 的 getAlbumSongs 早就按这个形状解包，取流走既有
 *      `vkey.GetVkeyServer/CgiGetVkey`（实测节目单集 128k purl 非空、sip 2 个）。
 *      所以这里**只产出专辑**，单集浏览与播放复用既有 `/album` 页 —— 不新造列表、不新造播放器。
 */

/** 首页 feed 里节目楼层的卡片判据（见文件头第 3 条）。 */
const PROGRAM_TYPE = 400
const PROGRAM_SUBTYPE = 410
const PROGRAM_JUMPTYPE = 10025

/** 搜索类型：15 = 节目专辑（fork 的 SearchType.AUDIO_ALBUM）。 */
const SEARCH_TYPE_AUDIO_ALBUM = 15

const PAGE_SIZE = 30

const requireCredential = async() => {
  const credential = await getQQCredential()
  if (credential == null) throw new Error('QQ 音乐未登录')
  return credential
}

const webComm = credential => buildComm(credential)
/** 节目楼层只在安卓档案的 feed 里（见文件头第 2 条）。 */
const androidComm = credential => buildComm(credential, 'android')

const isProgramCard = card => Number(card?.type) === PROGRAM_TYPE &&
  Number(card?.subtype) === PROGRAM_SUBTYPE &&
  Number(card?.jumptype) === PROGRAM_JUMPTYPE

/** 封面按专辑 mid 拼（与 `utils/song.js` 的 buildImg 同一套规则，实测节目专辑也返回 200）。 */
const albumCover = (mid, fallback = '') => mid
  ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg`
  : fallback

/**
 * 首页 feed 卡片 → 节目专辑。**只带卡片真有的字段**：卡片没有 mid / 播讲人 / 集数，
 * 这里不填假值（空串表示「这一层没有」，UI 据此不显示那一行）。
 */
const fromCard = card => ({
  id: String(card?.id ?? ''),
  mid: '',
  name: card?.title ?? '',
  img: card?.cover ?? '',
  singer: '',
  // 集数在卡片里没有（要详情才有），0 = 未知
  total: 0,
  // 卡片 cnt 实测是播放量（数字专辑楼层是 0）
  playCount: Number(card?.cnt ?? 0),
  publishDate: '',
  source: 'tx',
})

/** 搜索结果条目 → 节目专辑（字段实测：albumID / albumMID / albumName / singerName / song_count / publicTime）。 */
const fromSearch = raw => ({
  id: String(raw?.albumID ?? ''),
  mid: raw?.albumMID ?? '',
  name: decodeName(raw?.albumName ?? ''),
  // 搜索给的 albumPic 是 180 变体（带 _24 后缀），有 mid 就按本仓约定拼 500 的
  img: albumCover(raw?.albumMID, raw?.albumPic ?? ''),
  singer: decodeName(raw?.singerName ?? ''),
  total: Number(raw?.song_count ?? 0),
  playCount: 0,
  publishDate: raw?.publicTime ?? '',
  source: 'tx',
})

export default {
  /**
   * 热门节目专辑（首页 feed 的安卓档案 → 「热门节目」楼层的 type=400 卡片）。
   *
   * 单次调用、**不分页**：实测 feed 的翻页是「换一批楼层」（第二屏回来的是数字专辑、
   * 歌单、排行榜等别的楼层），同一个节目楼层不会再次出现，所以没有「加载更多」可做 ——
   * 想找更多节目走 searchAlbums。
   */
  async getHotAlbums() {
    const credential = await requireCredential()
    const node = await txCgi({
      module: 'music.recommend.RecommendFeed',
      method: 'get_recommend_feed',
      param: { direction: 0, page: 1, s_num: 0, v_cache: [] },
    }, androidComm(credential)).promise
    if (node?.code != null && node.code != 0) throw new Error(`QQ 接口错误（${node.code}）`)
    const shelves = node?.data?.v_shelf ?? []
    const list = shelves
      .flatMap(shelf => (shelf?.v_niche ?? []).flatMap(niche => niche?.v_card ?? []))
      .filter(isProgramCard)
      .map(fromCard)
      // 同一楼层里可能有重复 id（实测没有，但服务端偶尔会重复推同一张卡）
      .filter((album, index, all) => album.id !== '' && all.findIndex(item => item.id === album.id) === index)
    return {
      list,
      total: list.length,
      source: 'tx',
    }
  },

  /**
   * 搜索节目专辑（有声书 / 电台节目）。空关键词**不发请求**，直接回空列表。
   *
   * `total` 取 `meta.estimate_sum`（与 `musicSearch.js` 的 packTypedResult 同一判据：
   * perpage / curpage / nextpage 是分页游标，不是总数）。
   */
  async searchAlbums(keyword, page = 1, limit = PAGE_SIZE) {
    const str = String(keyword ?? '').trim()
    if (!str) return { list: [], total: 0, page, limit, hasMore: false, source: 'tx' }
    const credential = await requireCredential()
    const node = await txCgi({
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicDesktop',
      param: {
        grp: 1,
        // searchid 复用 musicSearch 的生成器：形状（32 位大写十六进制 + 5 位补零）与服务端要求一致
        searchid: musicSearch.getSearchId(),
        query: str,
        search_type: SEARCH_TYPE_AUDIO_ALBUM,
        num_per_page: limit,
        page_num: page,
        remoteplace: 'txt.newclient.top',
      },
    }, webComm(credential)).promise
    if (node?.code != null && node.code != 0) throw new Error(`QQ 接口错误（${node.code}）`)
    const body = node?.data?.body ?? {}
    const list = (body?.album?.list ?? []).map(fromSearch).filter(album => album.id !== '' || album.mid !== '')
    const total = Number(node?.data?.meta?.estimate_sum ?? list.length)
    return {
      list,
      total,
      page,
      limit,
      // 满页且还没到服务端报的总数才算还有（服务端的 total 是估算值，可能偏大）
      hasMore: list.length >= limit && page * limit < total,
      source: 'tx',
    }
  },
}
