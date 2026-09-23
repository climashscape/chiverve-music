import { signRequest } from './utils'
import { createSong } from './utils/song'

/**
 * 搜索类型（`search_type`）。**实测同一端点支持全部类型**（2026-09-23，用本仓请求形状打网关，
 * 各类型都 `code=0` 且结果落在 `body.{song,singer,album,songlist,mv}.list`）：
 * 所以补「歌手 / 专辑 / MV」三类**不用换接口**，只是换个 `search_type` 再取不同的结果键。
 */
const SEARCH_TYPE = {
  song: 0,
  singer: 1,
  album: 2,
  songlist: 3,
  mv: 4,
}

/** 结果里可能带 `<em>` 高亮标签（`xxx_hilight` 字段是专门的高亮版），这里统一清干净。 */
const stripHighlight = value => String(value ?? '').replace(/<\/?em>/g, '')

export default {
  limit: 50,
  total: 0,
  page: 0,
  allPage: 1,
  successCode: 0,
  musicSearch(str, page, limit, type = SEARCH_TYPE.song, retryNum = 0) {
    if (retryNum > 5) return Promise.reject(new Error('搜索失败'))
    const searchRequest = signRequest({
      comm: {
        _channelid: '0',
        _os_version: '6.2.9200-2',
        ct: '19',
        cv: '2151',
        guid: '1F70E520B2EAA7D25E11760783C53CA9',
        patch: '118',
        psrf_access_token_expiresAt: 0,
        psrf_qqaccess_token: '',
        psrf_qqopenid: '',
        psrf_qqunionid: '',
        tmeAppID: 'qqmusic',
        tmeLoginType: 0,
        uin: '0',
        wid: '7223299733393904640',
      },
      'music.search.SearchCgiService': {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: {
          grp: 1,
          num_per_page: limit,
          page_num: page,
          query: str,
          remoteplace: 'txt.newclient.top',
          search_type: type,
          searchid: this.getSearchId(),
        },
      },
    })
    return searchRequest.then(({ body }) => {
      // console.log(body)
      const req = body?.['music.search.SearchCgiService'] ?? body?.req
      if (!req || body.code != this.successCode || req.code != this.successCode) {
        return this.musicSearch(str, page, limit, type, ++retryNum)
      }
      return req.data
    })
  },
  /**
   * PC 客户端版 searchid：32 位大写十六进制 GUID + 5 位补零随机数 = 37 字符。
   * 对应 QQ 音乐 PC 端 searchid 形状（服务端只需要唯一的会话 ID，形状一致即可）。
   */
  getSearchId() {
    let guid = ''
    for (let i = 0; i < 32; i++) guid += Math.floor(Math.random() * 16).toString(16)
    return guid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, '0')
  },
  handleResult(rawList) {
    // console.log(rawList)
    if (!rawList || !Array.isArray(rawList)) return []
    const list = []
    rawList.forEach(item => {
      if (!item.file?.media_mid) return

      list.push(createSong(item))
    })
    // console.log(list)
    return list
  },
  search(str, page = 1, limit) {
    if (limit == null) limit = this.limit
    return this.musicSearch(str, page, limit, SEARCH_TYPE.song).then(({ body, meta }) => {
      let list = this.handleResult(body.song.list)

      this.total = meta.sum
      this.page = page
      this.allPage = Math.ceil(this.total / limit)

      return Promise.resolve({
        list,
        allPage: this.allPage,
        limit,
        total: this.total,
        source: 'tx',
      })
    })
  },

  /** 一次按类型搜索 → 归一化后的 `{list, allPage, limit, total, source}`（与 `search()` 同形状）。 */
  packTypedResult(list, page, limit, meta) {
    // 总数只认 `meta.estimate_sum`：`perpage/curpage/nextpage` 是分页游标不是总数
    this.total = Number(meta?.estimate_sum ?? list.length)
    this.page = page
    this.allPage = Math.max(1, Math.ceil(this.total / limit))
    return {
      list,
      allPage: this.allPage,
      limit,
      total: this.total,
      source: 'tx',
    }
  },

  /**
   * 搜歌手。字段名照 desktop 端点实测（2026-09-23：`singerID/singerMID/singerName/singerPic/
   * songNum/albumNum/mvNum`，高亮版是 `*_hilight`——用不带高亮的原文，免得把 `<em>` 带进界面）。
   */
  searchSinger(str, page = 1, limit) {
    if (limit == null) limit = this.limit
    return this.musicSearch(str, page, limit, SEARCH_TYPE.singer).then(({ body, meta }) => {
      const list = (body?.singer?.list ?? []).map(item => ({
        id: String(item.singerMID ?? item.singerID ?? ''),
        mid: item.singerMID ?? '',
        name: stripHighlight(item.singerName),
        img: item.singerPic ?? '',
        songNum: Number(item.songNum ?? 0),
        albumNum: Number(item.albumNum ?? 0),
        mvNum: Number(item.mvNum ?? 0),
        source: 'tx',
      }))
      return this.packTypedResult(list, page, limit, meta)
    })
  },

  /** 搜专辑（字段：`albumID/albumMID/albumName/albumPic/publicTime/singerName`）。 */
  searchAlbum(str, page = 1, limit) {
    if (limit == null) limit = this.limit
    return this.musicSearch(str, page, limit, SEARCH_TYPE.album).then(({ body, meta }) => {
      const list = (body?.album?.list ?? []).map(item => ({
        id: item.albumMID ?? '',
        mid: item.albumMID ?? '',
        name: stripHighlight(item.albumName),
        img: item.albumPic ?? '',
        singer: stripHighlight(item.singerName ?? (item.singer_list ?? []).map(s => s.name).join('、')),
        publishDate: item.publicTime ?? '',
        songCount: Number(item.song_count ?? 0),
        source: 'tx',
      }))
      return this.packTypedResult(list, page, limit, meta)
    })
  },

  /** 搜 MV（字段：`mv_id/v_id/mv_name/mv_pic_url/duration/play_count/publish_date/singer_name`）。 */
  searchMv(str, page = 1, limit) {
    if (limit == null) limit = this.limit
    return this.musicSearch(str, page, limit, SEARCH_TYPE.mv).then(({ body, meta }) => {
      const list = (body?.mv?.list ?? []).map(item => ({
        id: String(item.v_id ?? item.mv_id ?? ''),
        vid: item.v_id ?? String(item.mv_id ?? ''),
        name: stripHighlight(item.mv_name),
        img: item.mv_pic_url ?? '',
        singer: stripHighlight(item.singer_name ?? (item.singer_list ?? []).map(s => s.name).join('、')),
        duration: Number(item.duration ?? 0),
        playCount: Number(item.play_count ?? 0),
        publishDate: item.publish_date ?? '',
        source: 'tx',
      }))
      return this.packTypedResult(list, page, limit, meta)
    })
  },
}
