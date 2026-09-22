import { httpFetch } from '../../request'
import { formatPlayTime, dateFormat } from '../../index'
import { requestMsg } from '../../message'
import { createSong } from './utils/song'

/**
 * 歌手页（M6）：歌手信息 / 专辑 / 歌曲 / 相似歌手 / 歌手 MV。
 *
 * 端点与参数按 `QQMusicApi/qqmusic_api/modules/singer.py` 抄，并**逐条真机核对过响应
 * 结构**（记录见 spec §5.4）。下面五条是实测结论，改这个文件前先读：
 *
 *   1. `GetSingerDetail` 的参数键是 **`singer_mids`（复数、数组）**：写单数 `singer_mid`
 *      会被模块直接拒掉（`code=104400`，`singer_list` 为空）；`ex_singer`/`wiki_singer`/
 *      `group_singer`/`pic`/`photos` 必须是**数字** 0/1，写布尔值同样被拒（`code=10006`）。
 *   2. 专辑/歌曲列表条数的键是 **`num`**：Python 里的 `number` 实测被忽略（服务端按默认
 *      30 条返回），照抄 Python 的键反而拿不到指定条数。
 *   3. 两个计数键名不同：专辑数在 `GetAlbumList` 的 `data.total`，歌曲数在
 *      `GetSingerSongList` 的 `data.totalNum`——别互换。
 *   4. `GetSingerSongList` 的列表项是 `{ songInfo }` 包了一层。
 *   5. 相似歌手 `music.SimilarSingerSvr/GetSimilarSingerList`、歌手 MV
 *      `MvService.MvInfoProServer/GetSingerMvList` 都返回真实数据（已在真机核对）。
 *
 * 这些都是匿名可访问的公开端点，所以走匿名 comm 的 `createMusicuFetch`，不依赖登录态；
 * 歌曲对象统一由 `./utils/song` 的 `createSong` 构造（别再手写字段映射）。
 */

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const successCode = 0

/**
 * 发一次 musicu.fcg 请求（匿名 comm）。
 *
 * 错误处理两点：**取消**要原样抛出去（否则会被重试吞掉，调用方的 `取消http请求` 判断
 * 失效），其它错误/非 0 code 才重试。
 */
const createMusicuFetch = async(data, retryNum = 0) => {
  if (retryNum > 3) throw new Error('try max num')

  let result
  try {
    result = await httpFetch(MUSICU_URL, {
      method: 'POST',
      body: {
        comm: {
          cv: 4747474,
          ct: 24,
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          // uin 用字符串：数字型 uin 会被部分模块拒（M3 实测 code=10006）
          uin: '0',
        },
        ...data,
      },
      headers: {
        // 原实现拼成了 'User-Angent'（无效头），这里修正
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
      },
    }).promise
  } catch (err) {
    if (err?.message === requestMsg.cancelRequest) throw err
    return createMusicuFetch(data, ++retryNum)
  }
  if (result.statusCode !== 200 || result.body.code != successCode) return createMusicuFetch(data, ++retryNum)

  return result.body
}

export default {
  /**
   * 歌手信息（含歌曲数 / 专辑数）。
   * 一次网关请求里并发三个模块：详情 + 专辑数（各取 1 条）+ 歌曲数（取 1 条）。
   * @param {string} id 歌手 mid
   */
  getInfo(id) {
    return createMusicuFetch({
      req_1: {
        module: 'music.musichallSinger.SingerInfoInter',
        method: 'GetSingerDetail',
        param: {
          singer_mids: [id],
          ex_singer: 1,
          wiki_singer: 1,
          group_singer: 0,
          pic: 1,
          photos: 0,
        },
      },
      req_2: {
        module: 'music.musichallAlbum.AlbumListServer',
        method: 'GetAlbumList',
        param: {
          singerMid: id,
          order: 0,
          begin: 0,
          num: 1,
          songNumTag: 0,
          singerID: 0,
        },
      },
      req_3: {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: {
          singerMid: id,
          order: 1,
          begin: 0,
          num: 1,
        },
      },
    }).then(body => {
      // 三个模块任一被拒（模块级 code）都算失败；用可选链兜住"节点缺失"的情况
      if (body.req_1?.code != successCode || body.req_2?.code != successCode || body.req_3?.code != successCode) throw new Error('get singer info faild.')
      const info = body.req_1.data.singer_list[0]
      if (!info) throw new Error('get singer info faild.')
      const music = body.req_3.data
      const album = body.req_2.data
      return {
        source: 'tx',
        id: info.basic_info.singer_mid,
        info: {
          name: info.basic_info.name,
          desc: info.ex_info?.desc ?? '',
          // pic.pic 是 http:// 的 300x300（实测）；统一升到 https，和本仓其它封面一致
          avatar: String(info.pic?.pic ?? '').replace(/^http:/, 'https:'),
          // 注意：ex_info.genre 实测不是性别（周杰伦、G.E.M. 都是 1），这里沿用上游字段，
          // 待歌手页真正接入时再按 UI 需求核对来源
          gender: info.ex_info?.genre === 1 ? 'man' : 'woman',
        },
        count: {
          music: music.totalNum,
          album: album.total,
        },
      }
    })
  },
  /**
   * 歌手专辑列表
   * @param {string} id 歌手 mid
   * @param {number} page 从 1 开始
   * @param {number} limit
   */
  getAlbumList(id, page = 1, limit = 10) {
    if (page === 1) page = 0
    return createMusicuFetch({
      req: {
        module: 'music.musichallAlbum.AlbumListServer',
        method: 'GetAlbumList',
        param: {
          singerMid: id,
          order: 0,
          begin: page * limit,
          num: limit,
          songNumTag: 0,
          singerID: 0,
        },
      },
    }).then(body => {
      if (body.req?.code != successCode) throw new Error('get singer album faild.')

      const list = this.filterAlbumList(body.req.data.albumList)
      return {
        source: 'tx',
        list,
        limit,
        page,
        total: body.req.data.total,
      }
    })
  },
  /**
   * 歌手歌曲列表
   * @param {string} id 歌手 mid
   * @param {number} page 从 1 开始
   * @param {number} limit
   */
  getSongList(id, page = 1, limit = 100) {
    if (page === 1) page = 0
    return createMusicuFetch({
      req: {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: {
          singerMid: id,
          order: 1,
          begin: page * limit,
          num: limit,
        },
      },
    }).then(body => {
      if (body.req?.code != successCode) throw new Error('get singer song list faild.')

      const list = this.filterSongList(body.req.data.songList)
      return {
        source: 'tx',
        list,
        limit,
        page,
        total: body.req.data.totalNum,
      }
    })
  },
  /**
   * 相似歌手（QQ 不给分页，只有条数）。
   * @param {string} id 歌手 mid
   * @param {number} num 想要几条
   */
  getSimilarSingerList(id, num = 10) {
    return createMusicuFetch({
      req: {
        module: 'music.SimilarSingerSvr',
        method: 'GetSimilarSingerList',
        param: {
          singerMid: id,
          number: num,
        },
      },
    }).then(body => {
      if (body.req?.code != successCode) throw new Error('get similar singer faild.')

      const list = this.filterSimilarSingerList(body.req.data.singerlist)
      return {
        source: 'tx',
        list,
        total: list.length,
      }
    })
  },
  /**
   * 歌手 MV 列表。
   * @param {string} id 歌手 mid
   * @param {number} page 从 1 开始
   * @param {number} limit
   */
  getMvList(id, page = 1, limit = 20) {
    return createMusicuFetch({
      req: {
        module: 'MvService.MvInfoProServer',
        method: 'GetSingerMvList',
        param: {
          singermid: id,
          order: 1,
          count: limit,
          start: (page - 1) * limit,
        },
      },
    }).then(body => {
      if (body.req?.code != successCode) throw new Error('get singer mv list faild.')

      const data = body.req.data
      const list = (data.list ?? []).map(item => ({
        source: 'tx',
        // MV 的 id 有两套：数字 mvid（老接口）与字符串 vid（分享/播放页用）
        id: String(item.mvid),
        vid: item.vid,
        name: item.title,
        img: item.picurl,
        interval: item.duration ? formatPlayTime(item.duration) : null,
        playCount: item.playcnt,
        pubDate: item.pubdate ? dateFormat(item.pubdate * 1000, 'Y-M-D') : null,
      }))
      return {
        source: 'tx',
        list,
        limit,
        page,
        total: data.total ?? list.length,
      }
    })
  },
  filterAlbumList(raw) {
    return (raw ?? []).map(item => {
      return {
        id: item.albumID,
        mid: item.albumMid,
        count: item.totalNum,
        info: {
          name: item.albumName,
          author: item.singerName,
          img: `https://y.gtimg.cn/music/photo_new/T002R500x500M000${item.albumMid}.jpg`,
          desc: null,
        },
      }
    })
  },
  filterSongList(raw) {
    // 原先这里 `raw.map(...)` 没有 return，恒返回 undefined（歌手页歌曲列表必崩）
    return (raw ?? []).map(item => createSong(item.songInfo))
  },
  filterSimilarSingerList(raw) {
    return (raw ?? []).map(item => ({
      source: 'tx',
      // 相似歌手只给 mid（没有数字 id 之外的稳定标识），统一用 mid 当 id
      id: item.singerMid,
      name: item.singerName,
      // singerPic 是 150x150 的 http 图；缺失时按 mid 拼 500x500 的兜底图
      img: String(item.singerPic || `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singerMid}.jpg`).replace(/^http:/, 'https:'),
      desc: null,
    }))
  },
}
