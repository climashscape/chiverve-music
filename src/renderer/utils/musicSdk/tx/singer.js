import { httpFetch } from '../../request'
import { formatPlayTime, dateFormat } from '../../index'
import { requestMsg } from '../../message'
import { createSong } from './utils/song'
import user from './user'

/**
 * 歌手页（M6）：歌手信息 / 专辑 / 歌曲 / 相似歌手 / 歌手 MV / **关注态（读侧）**。
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
 *
 * ⚠️ **唯一例外是关注态**（`getFollowState`）：它必须带登录态，走 `./user` 的账号接口。
 * 判据通道为什么不是「搜索接口的 `concern_status`」，见 `getFollowState` 上方的长注释
 * （2026-09-26 真机实测：那条路要凭证，且搜索模块一压就空）。
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

/**
 * 关注列表一次拉的粒度。**1000 是实测过的**：本账号 604 人在 `Size=1000` 时一次全回来
 * 且 `HasMore=false`（`From`/`Size` 是偏移量分页，`Size=200` 时同一份列表要拉 4 页）。
 * 服务器没有在 200 处截断（200 只是「一页 200 条」的语义）。
 */
const FOLLOW_PAGE_SIZE = 1000
/** 页数硬上限（防 `HasMore` 异常时死循环；5000 位歌手远超出正常用量，撞上会留日志）。 */
const FOLLOW_MAX_PAGES = 5

/** 会话内缓存：关注歌手的 mid 集合。`null` = 还没拉过（失败或写侧改动后也清回 null）。 */
let followedSingerMids = null
/** 在途的那次拉取（单飞：同一次会话里多个歌手页同时开也只打一次接口）。 */
let followedSingerMidsInflight = null

const fetchFollowedSingerMids = async() => {
  const mids = new Set()
  for (let page = 1; page <= FOLLOW_MAX_PAGES; page++) {
    // 复用账号模块（`user.js` 的 `getFollowSingers`）：端点与参数形状只留一处，
    // 别在这里再抄一遍 `music.concern.RelationList/GetFollowSingerList`（那会多一份要维护的拼写）
    const res = await user.getFollowSingers(page, FOLLOW_PAGE_SIZE)
    res.list.forEach(item => {
      // 没有 mid 的行判不了成员（mid 是唯一判据，名字不能用来比）：留一行日志便于定位。
      // 实测本账号 604/604 行都有 MID；真出现时空缺的那位会被判成「未关注」——已知代价，
      // 不改成「整表作废」（那会把所有未关注歌手都变成不显示）
      if (!item.id) {
        console.log('[tx] 关注列表有一行没有 mid，该歌手的关注态无法判定')
        return
      }
      mids.add(String(item.id))
    })
    // 停的三个条件：服务端说没有更多 / 空页（防服务端忽略游标把同一页又给一遍）/ 够数了
    if (!res.hasMore || !res.list.length || (res.total && mids.size >= res.total)) return mids
  }
  console.log('[tx] 关注歌手的总数撞到页数上限，可能截断', { mids: mids.size, maxPages: FOLLOW_MAX_PAGES })
  return mids
}

const loadFollowedSingerMids = () => {
  if (followedSingerMids) return Promise.resolve(followedSingerMids)
  if (!followedSingerMidsInflight) {
    followedSingerMidsInflight = fetchFollowedSingerMids().then(
      mids => {
        followedSingerMids = mids
        followedSingerMidsInflight = null
        return mids
      },
      err => {
        // 失败**不留缓存**：下次进歌手页会重试（与 useSinger 的 loadedMid「失败不写」同一条纪律）
        followedSingerMidsInflight = null
        throw err
      },
    )
  }
  return followedSingerMidsInflight
}

/**
 * 关注列表缓存作废 —— **写侧（关注 / 取关）成功后必须调用**。
 *
 * 缓存是会话级的（读侧不想为每个歌手页各打一次接口，也不想象素级刷新列表），
 * 所以写操作改了关注关系后，这里不清就会让整轮会话的标记停在旧值上。
 * 写侧还没落地（票 02 只做了读侧），这个导出是留给它的接口，不是死代码。
 */
export const clearFollowSingerCache = () => {
  followedSingerMids = null
  followedSingerMidsInflight = null
}

export default {
  /**
   * 「我关注了这位歌手没」——歌手页的**只读**关注态（读侧）。
   *
   * ## 判据通道：全量关注列表 + mid 集合成员判定（不是搜索接口的 `concern_status`）
   *
   * spec 里用户选的是「搜索接口现查」（`search_type=1` 的每条带 `concern_status`），
   * 2026-09-26 实现时**先按那条路真机试过**，三条实测把它否掉了（记录：
   * `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-follow-read.md`）：
   *
   *   1. **匿名搜的 `concern_status` 恒为 0**（本账号关注了周杰伦，访客 comm 搜回来仍是 0）
   *      ——要拿真值必须带凭证再用**另一套**请求形状打搜索模块；而本仓既有的搜索入口
   *      （`musicSearch.js`）是访客档案，`concern_status` 直接读会**把已关注显示成未关注**。
   *   2. **按名搜不一定命中**：60 个已关注样本里 1 个名字（`ROSÉ (로제)`）搜回来 0 条，
   *      只能落「不可判」；同名歌手本身不是问题（按 mid 精确匹配）。
   *   3. 更关键：搜索模块**一压就空**——连续 ~100 次请求后，`search_type` 0/1 全都
   *      `code=0 且 data=None`，三种载体（musicu+web 凭证 / musicu+访客 / musics 签名）
   *      与两条 search_type 一致，而同一时刻 `GetSingerDetail` / `GetFollowSingerList`
   *      照常 `code=0`；20 分钟后仍未恢复。浏览歌手页正是「连续多次」的场景。
   *
   * 全量通道（本实现）：`GetFollowSingerList` + `Size=1000` **一次请求**把整个关注列表拉回来
   * （本账号 604 人，`HasMore=false`），按 mid 判成员——不依赖名字、不依赖搜索模块，
   * 且会话内缓存后比「每个歌手页搜一次」更省请求（铺开时同样受益：调用方直接复用这个集合）。
   *
   * ## 返回值三态（这条是契约，界面与测试都按它走）
   *
   * - `true`  = 已关注（mid 在集合里）
   * - `false` = 未关注（列表拿到了，mid 不在集合里）
   * - `null`  = **取不到**（未登录 / 请求失败）——界面必须**什么都不显示**，
   *   **不许退化成 `false`**：把「不知道」画成「未关注」是在骗用户。
   *
   * @param {string} id 歌手 mid
   * @returns {Promise<boolean|null>}
   */
  async getFollowState(id) {
    const mid = String(id ?? '').trim()
    if (!mid) return null
    try {
      return (await loadFollowedSingerMids()).has(mid)
    } catch (err) {
      console.log('[singer] follow state', err)
      return null
    }
  },
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
    return createMusicuFetch({
      req: {
        module: 'music.musichallAlbum.AlbumListServer',
        method: 'GetAlbumList',
        param: {
          singerMid: id,
          order: 0,
          // begin 是**原始偏移量**（实测：begin=0 → 第 1 张，begin=100 → 第 101 张）。
          // 曾经写成 `if (page === 1) page = 0` + `begin: page * limit`，那会让 page ≥ 2
          // 整整跳掉一页（偏移 50–99 永远取不到）——别改回那种写法。
          begin: (page - 1) * limit,
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
    return createMusicuFetch({
      req: {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: {
          singerMid: id,
          order: 1,
          // 同 getAlbumList：begin 是原始偏移量，分页用 (page-1)*limit；
          // 服务端对 num 的上限实测是 100
          begin: (page - 1) * limit,
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
