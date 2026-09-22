import { getQQCredential } from '@renderer/utils/ipc'
import { formatPlayCount, decodeName } from '../../index'
import { txCgi, buildComm } from './utils/request'
import { createSong } from './utils/song'

/**
 * 发现页数据层（M5）：首页推荐流 / 猜你喜欢 / 雷达 / 推荐歌单 / 新歌。
 *
 * 端点是照 QQMusicApi `modules/recommend.py` 移植的，参数与**响应结构全部真机实测过**
 * （登录态 + 主窗口 CDP 直连网关，探测记录见 M5 报告）。改这个文件前先读这七条：
 *
 *   1. WEB 与安卓两种 comm **都能通**（code=0），但**返回内容不同**：安卓形态的首页是
 *      「今日为你推荐 / 精选好歌 / 热门节目」三屏（含单曲卡），WEB 形态是「为你打造 /
 *      最近常听 …」（无单曲卡）。这里统一用 WEB 档案 —— 与 M4 的账户接口同一套档案，
 *      免得同一个页面在不同档案下内容跳变。
 *   2. 首页 feed 的翻页**不是 page 语义**：必须把上一屏的 shelf id 累积进 `v_cache`、
 *      把已加载屏数累进 `s_num`、并把 `direction` 置 1；否则永远拿到第一屏
 *      （实测 direction=0/page=1 连打三次返回同一批 shelf）。返回值里的 `next` 就是
 *      下一屏要原样回传的参数，UI 直接存下来即可。
 *   3. 猜你喜欢（radio）**必须登录**：访客（无 authst）请求实测 `code=1000`、tracks 为空。
 *      另外服务端**单批上限 5 首**（num=10/20 仍只回 5 首），且每次调用都是新一批
 *      （同参数两连请求的歌曲 id 完全不同）——「换一批」就是再调一次，别去翻页。
 *   4. 推荐歌单的 `FromLimit` **恒为 400**、与 `From` 无关（实测 From=0 与 From=3 都是
 *      400），它**不是游标**：下一页要用 `From + Size`。Python 参考实现把它当归一游标
 *      （`cursor_extractor=lambda r: r.from_limit`）在这里是错的。
 *   5. 首页卡片是**异构**的（单曲 / 歌单 / 节目 / 排行榜入口 / 功能入口），
 *      `card_extra_info.Tracks` / `SongList` 实测**恒为空**：卡片只带 id + 标题 + 封面。
 *      单曲卡（type=200）里**没有 songmid / media_mid**，所以 feed 里的单曲卡构不成
 *      可播放的歌曲对象（真要播放得再按数字 id 走一次歌曲详情接口）。这里只做
 *      「卡片归一化」，不硬凑 createSong。
 *   6. 新歌 `songlist` 是**标准 Song 数组**（有 album.mid / file.media_mid / singer[]），
 *      直接喂 `createSong` 即可；`songTagInfoList[].id` 实测**就是歌曲 id**（取交集验证过），
 *      所以标签可以按 songId 关联到列表里的某首歌，不用猜。
 *   7. 语种/地区筛选 `type` 实测 1..6 = 内地 / 欧美 / 日本 / 韩国 / 最新 / 港台
 *      （响应里的 `lan` 与请求一一对应，`lanlist` 是同一组可切换项）。
 */

const PAGE_SIZE = 25
/** 猜你喜欢的电台 id（首页 type=700 卡片上的 id 也是它）。 */
const RADIO_ID = 99
/** 默认新歌地区：5 = 最新（全地区）。 */
const NEW_SONG_TYPE = 5

/**
 * 首页卡片的 type → 语义。**这些值都是实测来的**（两种档案下一共看了 68 张卡）：
 * 200 单曲卡（id=数字 songId，无 songmid）、400 长音频/节目（有声书、电台节目）、
 * 500 歌单卡（id=歌单 tid）、700 猜你喜欢入口（id=99）、800 排行榜入口、
 * 900 其它功能入口（雷达模式 id=22000 / 自定义）。没列出的类型返回 'unknown'，不猜。
 */
const CARD_KINDS = {
  200: 'song',
  400: 'program',
  500: 'playlist',
  700: 'radio',
  800: 'chart',
  900: 'entry',
}

const requireCredential = async() => {
  const credential = await getQQCredential()
  if (credential == null) throw new Error('QQ 音乐未登录')
  return credential
}

const webComm = credential => buildComm(credential)

/**
 * unix 秒 → 'YYYY-MM-DD'。字段缺失/为 0 时返回 undefined（列表里显示占位）。
 * 注意不要用 `new Date(ts*1000)` 直接透传：QQ 会给 0 表示「无时间」。
 */
const toDate = ts => {
  if (!ts) return undefined
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * QQ 的标题是「模板 + 内容」两段：`title_template` 带 `{String}` 占位、`title_content`
 * 是填进去的值（实测 shelf 301 是 `Hi {String}  今日为你推荐` + 昵称）。这里拼成整串给 UI，
 * 顺手把 `{br}` 换成空格（标题是单行，换行符只会在 UI 上露出花括号）。
 * 多占位的模板（如电台推荐语有两个 `{String}`）**不要**用这个函数——两个占位填的不是
 * 同一个值，那种情况只把原始模板透出（见 reasons 字段）。
 */
const fillTemplate = (template, content) => {
  if (!template) return content ?? ''
  if (template.includes('{String}')) {
    // 只有单个占位时才用 content 填；多个占位填同一个值会造假，退回模板原文
    const hits = template.match(/\{String\}/g)
    if (hits && hits.length === 1) return template.replace('{String}', content ?? '').replace(/\{br\}/g, ' ').trim()
    return template.replace(/\{br\}/g, ' ').trim()
  }
  return template.replace(/\{br\}/g, ' ').trim()
}

/**
 * 首页卡片归一化。只保留 UI 真用得上的字段 —— 原始卡片里 `abt` / `extra_info.abt` /
 * `pingpong` 这些埋点串动辄 1~2KB，68 张卡全透出会把这份数据放大到几十 KB。
 *
 * `albumMid` 只有单曲卡（type=200）会解析出来：卡片的封面是标准 photo_new 链接
 * （`T002R150x150M000<albumMid>_<n>.jpg`，与本仓 tx/index.js 的 getPic 同一套规则），
 * 所以能从 URL 里拿回专辑 mid —— 单曲卡没有 songmid 但至少能跳专辑页。
 */
const toCard = raw => {
  const kind = CARD_KINDS[raw?.type] ?? 'unknown'
  const img = raw?.cover ?? ''
  const albumMid = kind === 'song' ? (/(T002R\d+x\d+M000[A-Za-z0-9]+?)\.jpg/.exec(img)?.[1] ?? '') : ''
  return {
    kind,
    type: Number(raw?.type ?? 0),
    subType: Number(raw?.subtype ?? 0),
    id: String(raw?.id ?? ''),
    name: raw?.title ?? '',
    subName: raw?.subtitle ?? '',
    img,
    // 单曲卡的 cnt 实测恒为 0；歌单卡是播放量、节目卡是集数。文本形态（'2893.4W 播放'）
    // 在 miscellany.cnt_content，UI 想直接显示就用它，别自己格式化 cnt。
    count: Number(raw?.cnt ?? 0),
    countText: raw?.miscellany?.cnt_content ?? '',
    // 卡片角标文案（'1.5万人收藏' 之类），实测只有部分卡片有
    reason: raw?.miscellany?.rcmdtemplate ?? '',
    jumpType: Number(raw?.jumptype ?? 0),
    albumMid,
    source: 'tx',
  }
}

/** 楼层（shelf）归一化：一个楼层下的多个 niche 在这里摊平成一串卡。 */
const toShelf = raw => ({
  id: String(raw?.id ?? ''),
  name: fillTemplate(raw?.title_template, raw?.title_content),
  template: raw?.title_template ?? '',
  content: raw?.title_content ?? '',
  style: Number(raw?.style ?? 0),
  cards: (raw?.v_niche ?? []).flatMap(niche => niche?.v_card ?? []).map(toCard),
})

/**
 * 歌单概要 → `store/songList/state.ts` 的 ListInfoItem（与 M4 的 tx/user.js toPlaylistInfo
 * 同一形状；play_count 复用本仓既有约定走 formatPlayCount）。
 */
const toPlaylistInfo = basic => ({
  id: String(basic?.tid ?? ''),
  name: decodeName(basic?.title ?? ''),
  img: basic?.cover?.medium_url || basic?.cover?.default_url || '',
  author: decodeName(basic?.creator?.nick ?? ''),
  total: basic?.song_cnt != null ? String(basic.song_cnt) : '',
  play_count: formatPlayCount(Number(basic?.play_cnt ?? 0)),
  time: toDate(basic?.modify_time ?? basic?.create_time),
  // 简介里带 <br>，列表/详情按纯文本用（与 tx/songList.js 的处理一致）
  desc: decodeName(basic?.desc ?? '').replace(/<br>/g, '\n') || null,
  source: 'tx',
})

export default {
  /**
   * 首页推荐流（楼层化）。返回的 `next` 是下一屏的参数，UI 原样存下再传回来即可：
   * `getHomeFeed(next)`。第一屏用默认参数（direction=0 表示「首屏」，1 表示「往后翻」）。
   *
   * `hasMore` 的判据是「这一屏拿到了楼层」——响应里的 `load_mark` / `d_num` 实测恒为 0，
   * 不能当判据用。
   */
  async getHomeFeed({ page = 1, direction = 0, sNum = 0, vCache = [] } = {}) {
    const credential = await requireCredential()
    const node = await txCgi({
      module: 'music.recommend.RecommendFeed',
      method: 'get_recommend_feed',
      param: {
        direction,
        page,
        s_num: sNum,
        // v_cache 是「已曝光楼层 id」缓存，用于去重：服务端靠它避免跨屏重复推同一楼层
        v_cache: vCache,
      },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const shelves = (data?.v_shelf ?? []).map(toShelf)
    // 去重后再回传：服务端可能把已曝光的 id 再塞回来（Python 参考实现同样在这里去重）
    const seen = new Set([...vCache.map(String), ...shelves.map(s => s.id)])
    return {
      list: shelves,
      total: shelves.length,
      page,
      limit: shelves.length,
      source: 'tx',
      hasMore: shelves.length > 0,
      next: {
        page: page + 1,
        direction: 1,
        sNum: sNum + shelves.length,
        vCache: [...seen],
      },
    }
  },

  /**
   * 猜你喜欢（电台 id=99）。**每次调用都是一批新歌**，没有分页参数：UI 的「换一批」
   * 就是再调一次，追加到已有列表上。
   *
   * `reasons[i]` 与 `list[i]` **同序同长**（实测 tracks 与 extras 长度一致），
   * 而不是把 reason 塞进歌曲对象 —— 歌曲对象是跨层流通的老式结构（见 AGENTS §2.6），
   * 往里加平台字段会丢在 toOldMusicInfo/toNewMusicInfo 上。
   */
  async getGuessRecommend(num = 5) {
    const credential = await requireCredential()
    const node = await txCgi({
      module: 'music.radioProxy.MbTrackRadioSvr',
      method: 'get_radio_track',
      param: {
        id: RADIO_ID,
        num,
        from: 0,
        scene: 0,
        song_ids: [],
      },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const extras = data?.extras ?? []
    const items = (data?.tracks ?? [])
      .map((track, i) => ({ track, extra: extras[i] }))
      .filter(item => item.track != null)
    return {
      list: items.map(item => createSong(item.track)),
      total: items.length,
      source: 'tx',
      reasons: items.map(item => ({
        songId: item.track.id,
        // 一句话理由（'根据你的听歌口味推荐'）
        reason: item.extra?.reason ?? '',
        // 理由模板，[{String}] 由 RecReasons 按顺序填；这里只透出不猜填法
        template: item.extra?.rectag?.RecReasonTemplate ?? '',
        tags: item.extra?.rectag?.RecReasons ?? [],
      })),
    }
  },

  /**
   * 雷达模式（个性化推荐流）。`Page` 从 1 起，实测 1/2/3 返回不同歌；
   * `HasMore` 一直是 true（推荐流不会真的耗尽）。`reasons` 与 `list` 同序同长。
   */
  async getRadarRecommend(page = 1) {
    const credential = await requireCredential()
    const node = await txCgi({
      module: 'music.recommend.TrackRelationServer',
      method: 'GetRadarSong',
      param: {
        Page: page,
        ReqType: 0,
        // 这两个是「已收藏 / 入口歌曲」上下文，空数组即纯推荐（照参考实现传空）
        FavSongs: [],
        EntranceSongs: [],
      },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const items = (data?.VecSongs ?? []).filter(item => item?.Track != null)
    return {
      // ⚠️ 歌曲在 VecSongs[i].Track 里，不是 VecSongs[i] 本身（实测）
      list: items.map(item => createSong(item.Track)),
      total: items.length,
      page,
      limit: items.length,
      source: 'tx',
      hasMore: data?.HasMore === true,
      reasons: items.map(item => ({
        songId: item.Track.id,
        template: item.RadioRecTag?.RecReasonTemplate ?? '',
        tags: item.RadioRecTag?.RecReasons ?? [],
      })),
    }
  },

  /**
   * 推荐歌单广场。`total` 用的是响应里的 `FromLimit`（实测恒为 400，是「最多能给到多少」
   * 而不是本页游标）；`hasMore` 直接取响应的 `HasMore`。翻页请传 page。
   */
  async getRecommendSonglist(page = 1, num = PAGE_SIZE) {
    const credential = await requireCredential()
    const node = await txCgi({
      module: 'music.playlist.PlaylistSquare',
      method: 'GetRecommendFeed',
      param: {
        // From 是偏移量、不是页码（Python 参考实现的 num*(page-1) 就在这里）
        From: num * (page - 1),
        Size: num,
      },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const list = (data?.List ?? [])
      .map(item => item?.Playlist?.basic)
      .filter(basic => basic != null)
      .map(toPlaylistInfo)
    return {
      list,
      total: Number(data?.FromLimit ?? 0),
      page,
      limit: num,
      source: 'tx',
      hasMore: data?.HasMore === true,
    }
  },

  /**
   * 推荐新歌。`songlist` 是标准 Song 数组，直接走 createSong。
   *
   * `tags[i].songId` **能对应到 list 里的歌**（实测 `songTagInfoList[].id` 就是歌曲 id，
   * 与 songlist 的 id 取交集非空），UI 想给某首歌打「独家首发30天」角标就按 songId 查。
   */
  async getNewSongs(type = NEW_SONG_TYPE) {
    const credential = await requireCredential()
    const node = await txCgi({
      module: 'newsong.NewSongServer',
      method: 'get_new_song_info',
      param: { type },
    }, webComm(credential)).promise
    // txCgi resolve 的是模块节点（响应里的 req_1），业务数据在 node.data 上
    const data = node?.data ?? {}
    const songs = data?.songlist ?? []
    return {
      list: songs.map(createSong),
      total: songs.length,
      source: 'tx',
      type: Number(data?.type ?? type),
      // 当前地区的显示名（'最新' / '内地' / '欧美' …）
      lan: data?.lan ?? '',
      // 可切换的地区/语种项：{ type, name }，type 就是下次请求要传的值
      langs: (data?.lanlist ?? []).map(item => ({ type: Number(item?.type ?? 0), name: item?.lan ?? '' })),
      // 带角标的新歌：songId → 标签名
      tags: (data?.songTagInfoList ?? []).map(item => ({
        songId: String(item?.id ?? ''),
        name: item?.tag ?? '',
        tagId: Number(item?.tagid ?? 0),
        fromType: Number(item?.from_type ?? 0),
      })),
    }
  },
}
