import { txCgi, buildComm, requireCredential } from './utils/request'
import { createSong } from './utils/song'
import musicSearch from './musicSearch'
import { mapMusicGene, pickGeneSingerMid } from './utils/gene'

/**
 * 我的音乐（M4）：QQ 账号侧的只读接口。
 *
 * 端点是照 QQMusicApi `modules/user.py` 移植的，参数与**响应结构都用真实凭证探过**
 * （探测记录见 spec §5.3）。四条实测结论写在前面，改这个文件前先读：
 *
 *   1. 账户级接口基本要 `encryptUin`（QQ 叫 euin，就在凭证里），不是数字 uin；
 *      只有自建歌单那个（`GetPlaylistByUin`）要数字 uin（传字符串形态）。
 *   2. **主页与听歌基因必须用安卓形态的 comm**：WEB 形态会被拒（M0 实测 code=10000）。
 *      传输层支持按请求覆盖 comm —— 用 `buildComm(credential, 'android')`。
 *   3. 列表键不统一：我喜欢在 `data.songlist`、自建歌单在 `data.v_playlist`、
 *      收藏歌单/专辑在 `data.v_list`。别照一个的形状猜另一个。
 *   4. 主页的粉丝/关注数是**对象**（`{ HasEntry, Num, Add, jumpURL }`），取 `.Num`。
 *   5. 听歌基因的响应整形（含一批「名字 + 说明」型富内容）全在 `./utils/gene.js`——纯函数、
 *      可在 node 环境单测；富内容的内层键名只覆盖了实测过的路径，其余走候选键兜底，
 *      改动前先读那个文件的头部注释。
 *   6. 基因里的歌手只有数字 singer_id（`Base.Id`，没有 mid），歌手页要 mid——转 mid 走
 *      `resolveSingerMid`（按名字搜歌手档 + `singerID` 比对，spec 事实 C）。
 *
 * 只管账号中心要用的能力，不碰播放链路（取流在 musicUrl.js）。
 */

const PAGE_SIZE = 30

/** `getFavSongIds` 的页数硬上限（防 total 异常时死循环；撞上会打日志）。60 页 = 1800 首。 */
const MAX_PAGES = 60

/**
 * 「我喜欢」的目录 id。读取侧是 `CgiGetDiss` 的 `dirid`；写侧（`tx/songList.js` 的
 * `likeSong`/`unlikeSong`）用的也是它，那里从本文件导入，别再写一份字面量。
 */
export const FAV_DIR_ID = 201

/**
 * `GetPlaylistByUin` 返回的 `v_playlist` 里挑出「我喜欢」那一行的 **tid**（拿不到回 0）。
 *
 * 为什么写接口要用它：这一行是账号里「我喜欢」这个歌单的**真实 tid**（大数字，与 dirId 201
 * 不是一回事）。自建歌单那边有受控真机往返记录（M6：建临时歌单 → 加歌 → 校验 songNum 0→1 →
 * 移歌 → 删）——那次**传的就是该歌单自己的 tid**，不是 0；201 这条路径此前一律传 0。
 * tid 到底是不是必需还没定论（参考实现 `like_song` 传 0 且有 CI 覆盖），所以这里只做
 * 「有真实值就用真实值」，取不到一律回 0（= 旧行为），**任何情况下都不因这次解析失败挡住写**。
 */
export const pickFavDirTid = rawList =>
  Number((rawList ?? []).find(item => Number(item?.dirId) === FAV_DIR_ID)?.tid ?? 0) || 0

/** `search_type`：1 = 歌手档（**2 是专辑档**，别写错——spec 事实 C 的实测记录）。 */
const SEARCH_TYPE_SINGER = 1
/** 基因歌手按名字搜时取的结果条数：歌手档按相关度排序，同名艺人集中在前几条。 */
const SEARCH_SINGER_NUM = 20

/** 多数账户接口用 WEB 档案即可。 */
const webComm = credential => buildComm(credential)
/** 主页 / 听歌基因必需安卓档案（WEB 会被拒）。 */
const androidComm = credential => buildComm(credential, 'android')

const toDate = ts => {
  if (!ts) return undefined
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const singerNames = singers => Array.isArray(singers)
  ? singers.map(s => s?.name ?? '').filter(Boolean).join('、')
  : (singers?.name ?? '')

/**
 * `GetPlaylistByUin` 的取数：返回**原始行**（不映射成卡片）与总数。
 * 两个调用方要的东西不同——`getCreatedSonglist` 要卡片（映射后 `id` 是 tid）、
 * `getFavDirTid` 要原始 `tid`（卡片在没有 tid 时会把 `id` 兜底成 dirId，当 tid 用会写错目标）——
 * 所以原样回原始行，映射交给各自的调用方。
 */
const getPlaylistsRaw = async() => {
  const credential = await requireCredential()
  const data = await txCgi({
    module: 'music.musicasset.PlaylistBaseRead',
    method: 'GetPlaylistByUin',
    param: { uin: String(credential.musicid ?? '') },
  }, webComm(credential)).promise
  const d = data?.data ?? {}
  return { raw: d.v_playlist ?? [], total: d.total }
}

/** QQ 歌单（自建 / 收藏同构）→ LX 歌单卡片对象（对齐 store/songList/state.ts 的 ListInfoItem）。
 *  `id` 用 tid（打开详情页要用它）；另带 `dirId`——「我喜欢」就是靠 dirId=201 识别的。 */
const toPlaylistInfo = raw => ({
  id: String(raw.tid ?? raw.dirId ?? ''),
  dirId: String(raw.dirId ?? ''),
  name: raw.name ?? raw.dirName ?? '',
  img: raw.logo ?? raw.picUrl ?? raw.albumPicUrl ?? '',
  author: raw.nickname ?? raw.nick ?? '',
  total: raw.songnum != null ? String(raw.songnum) : '',
  time: toDate(raw.updateTime ?? raw.createtime),
  desc: null,
  source: 'tx',
})

/** 收藏专辑 → 同一个卡片形状；id 用专辑 mid（点开走专辑页）。 */
const toAlbumInfo = raw => ({
  id: String(raw.mid ?? ''),
  name: raw.name ?? '',
  img: raw.logo ?? '',
  author: singerNames(raw.v_singer),
  total: raw.songnum != null ? String(raw.songnum) : '',
  time: toDate(raw.pubtime),
  desc: null,
  source: 'tx',
})

export default {
  /** 我喜欢（QQ 的 dirid=201 目录）。响应里带 dirinfo，顺手返回目录名/封面/描述。 */
  async getFavSong(page = 1, num = PAGE_SIZE) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.srfDissInfo.DissInfo',
      method: 'CgiGetDiss',
      param: {
        disstid: 0,
        dirid: FAV_DIR_ID,
        tag: true,
        song_begin: num * (page - 1),
        song_num: num,
        userinfo: true,
        orderlist: true,
        enc_host_uin: credential.encryptUin,
      },
    }, webComm(credential)).promise
    const d = data?.data ?? {}
    const dir = d.dirinfo ?? {}
    return {
      list: (d.songlist ?? []).map(createSong),
      // 总数只能取 total_song_num：songlist_size 是**本页返回条数**（参考实现 models/songlist.py:55,63），
      // 取错会让「我喜欢」永远显示成每页条数（50），后面的歌也翻不到
      total: Number(d.total_song_num ?? d.songlist_size ?? 0),
      page,
      limit: num,
      source: 'tx',
      info: {
        name: dir.title ?? '我喜欢',
        img: dir.picurl ?? '',
        desc: dir.desc ?? null,
        listennum: dir.listennum ?? 0,
      },
    }
  },

  /**
   * 我喜欢的**歌曲 id 集合**（数字 songId）——给「这一首喜欢了没」用（本地收藏取消后的收藏态）。
   *
   * 同 `getFavAlbumIds`：这条读接口没有按 id 单查的形态，只能拉全量在本地比对。
   * 两处与那两口不同，改这里前先看：
   *   1. 页长用 `PAGE_SIZE`（30，与「我喜欢」列表分页同一档），**不给大值**——
   *      `song_begin = num * (page - 1)` 是按请求页长算的，服务端一旦按更小的页长截断，
   *      大页长就会跳过中间没拿到的歌（`getFavAlbumIds` 敢给 600 是因为那两口实测过）。
   *   2. 结束判据是 `total_song_num`（`songlist_size` 是**本页条数**，别取错）。
   *      页数上限 `MAX_PAGES` 只是防 total 异常（0/NaN/极大）时的死循环；**够数就提前停**，
   *      所以这个账号（923 首）实际只拉 31 页。旧写法把上限写死 40 页 = 1200 首，
   *      超过就静默截断——截断的后果是收藏态判成「未收藏」（点「取消喜欢」反而去收藏），
   *      所以真的撞上限时必须留一行日志（见本票）。
   */
  async getFavSongIds() {
    const ids = []
    let total = 0
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.getFavSong(page, PAGE_SIZE)
      if (!res.list.length) break
      res.list.forEach(item => { if (item.songId) ids.push(String(item.songId)) })
      total = Number(res.total ?? 0) || total
      if (total && ids.length >= total) break
    }
    if (ids.length >= MAX_PAGES * PAGE_SIZE) {
      console.log('[tx] 我喜欢的 id 集合撞到页数上限，可能截断', { ids: ids.length, total, maxPages: MAX_PAGES })
    }
    return ids
  },

  /**
   * 「我喜欢」（dirId=201）的**真实 tid**——写接口（`PlaylistDetailWrite`）要带的那个。
   *
   * 从 `GetPlaylistByUin` 的原始行里取（不走 `toPlaylistInfo`：那张卡片把 `id` 兜底成了
   * dirId，兜底值当 tid 用会写错目标）。取不到回 0，调用方（`tx/songList.js` 的 likeSong）
   * 在解析失败时也回落到 0——**解析失败绝不挡住写**。
   */
  async getFavDirTid() {
    return pickFavDirTid((await getPlaylistsRaw()).raw)
  },

  /** 自建歌单列表。注意"我喜欢"也在这个列表里（它的 dirId 是 201）。 */
  async getCreatedSonglist() {
    const { raw, total } = await getPlaylistsRaw()
    const list = raw.map(toPlaylistInfo)
    return { list, total: Number(total ?? list.length), source: 'tx' }
  },

  /** 收藏的（他人）歌单。 `hasmore` 是 0/1。 */
  async getFavSonglist(page = 1, num = PAGE_SIZE) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.musicasset.PlaylistFavRead',
      method: 'CgiGetPlaylistFavInfo',
      param: { uin: credential.encryptUin, offset: (page - 1) * num, size: num },
    }, webComm(credential)).promise
    const d = data?.data ?? {}
    const list = (d.v_list ?? []).map(toPlaylistInfo)
    return { list, total: Number(d.total ?? list.length), page, limit: num, source: 'tx', hasMore: d.hasmore === 1 }
  },

  /** 收藏的歌单的 **tid 集合**（同上：读接口没有单条查询，只能拉全量比对）。 */
  async getFavSonglistIds() {
    const ids = []
    for (let page = 1; page <= 12; page++) {
      const res = await this.getFavSonglist(page, 600)
      res.list.forEach(item => { if (item.id) ids.push(item.id) })
      if (!res.hasMore) break
    }
    return ids
  },

  /** 收藏的专辑。 */
  async getFavAlbum(page = 1, num = PAGE_SIZE) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.musicasset.AlbumFavRead',
      method: 'CgiGetAlbumFavInfo',
      param: { euin: credential.encryptUin, offset: (page - 1) * num, size: num },
    }, webComm(credential)).promise
    const d = data?.data ?? {}
    const list = (d.v_list ?? []).map(toAlbumInfo)
    return { list, total: Number(d.total ?? list.length), page, limit: num, source: 'tx', hasMore: d.hasmore === 1 }
  },

  /**
   * 收藏的专辑的 **mid 集合**——给「这张专辑收了没」用（工单 08 的按钮状态）。
   *
   * 这条读接口没有「按 id 查是否收藏」的形态，只能把整份收藏拉回来在本地比对；
   * 实测 `size` 给大值能一次拿全（该账号 445 张，一次 `size=600` 全回来）。
   * 拉到 `hasmore` 为 0 或到页数上限为止。
   */
  async getFavAlbumIds() {
    const ids = []
    for (let page = 1; page <= 12; page++) {
      const res = await this.getFavAlbum(page, 600)
      res.list.forEach(item => { if (item.id) ids.push(item.id) })
      if (!res.hasMore) break
    }
    return ids
  },

  /** 关注的歌手。 */
  async getFollowSingers(page = 1, num = PAGE_SIZE) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.concern.RelationList',
      method: 'GetFollowSingerList',
      param: { HostUin: credential.encryptUin, From: (page - 1) * num, Size: num },
    }, webComm(credential)).promise
    const d = data?.data ?? {}
    const list = (d.List ?? []).map(raw => ({
      id: String(raw.MID ?? ''),
      name: raw.Name ?? '',
      img: raw.AvatarUrl ?? '',
      desc: raw.Desc ?? '',
      fans: Number(raw.FanNum ?? 0),
      source: 'tx',
    }))
    return { list, total: Number(d.Total ?? list.length), page, limit: num, source: 'tx', hasMore: d.HasMore === true }
  },

  /** 会员信息：`music_lev_*` 为 "1" 表示有该档权益。 */
  async getVipInfo() {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'VipLogin.VipLoginInter',
      method: 'vip_login_base',
      param: {},
    }, webComm(credential)).promise
    const d = data?.data ?? {}
    return {
      canRenew: d.canRenew === '1',
      hires: d.music_lev_hires === '1',
      dolby: d.music_lev_dolby === '1',
      maxSongNum: Number(d.maxsongnum ?? 0),
      maxDirNum: Number(d.maxdirnum ?? 0),
    }
  },

  /** 主页概览：昵称/头像 + 关注、粉丝、好友、访客数（后四个是对象，取 Num）。 */
  async getHomepage() {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.UnifiedHomepage.UnifiedHomepageSrv',
      method: 'GetHomepageHeader',
      param: { uin: credential.encryptUin, IsQueryTabDetail: 1 },
    }, androidComm(credential)).promise
    const info = data?.data?.Info ?? {}
    const base = info.BaseInfo ?? {}
    const num = v => Number(v?.Num ?? 0)
    return {
      name: base.Name ?? '',
      avatar: base.Avatar ?? '',
      bigAvatar: base.BigAvatar ?? '',
      isSinger: base.IsSinger === '1',
      fans: num(info.FansNum),
      follow: num(info.FollowNum),
      friends: num(info.FriendsNum),
      visitor: num(info.VisitorNum),
    }
  },

  /**
   * 听歌基因：偏好歌手 / 偏好曲风 / 一句话画像 + 一批富内容（人格、乐状态、音乐年龄、
   * BPM、律动、时间偏好、代表色、近 6 个月听歌数、AI 解读卡）。
   *
   * 整形全部在 `utils/gene.js`（纯函数、可在 node 环境单测）；这里只负责取数。
   * 返回**恒含全部键**，空值用空数组/空串/null——store 是 `Object.assign` 覆盖，
   * 少给键会留下上一份数据（见 gene.js 的注释）。
   */
  async getMusicGene() {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.recommend.UserProfileSettingSvr',
      method: 'GetProfileReport',
      param: { uin: credential.encryptUin },
    }, androidComm(credential)).promise
    return mapMusicGene(data?.data)
  },

  /**
   * 偏好歌手（基因只给数字 `Base.Id`）→ 歌手页要的 mid。
   *
   * 没有 id→mid 直通端点（spec 事实 C 实测），只能按名字搜歌手档、再用 `singerID` 比对：
   * 判据与实测记录见 `utils/gene.js` 的 `pickGeneSingerMid`。
   *
   * 走底层 `musicSearch.musicSearch` 而不是 `musicSearch.searchSinger`：后者把 `singerID`
   * 归一化掉了（`id` 给的是 mid），而这里**必须**拿 `singerID` 比（名字会变、也会重名）。
   * 搜索通道自带访客 comm（`uin: '0'`），不要求登录态，也不需要凭证。
   *
   * @param {string} name 歌手名（基因的 `Base.TypeTitle`）
   * @param {string|number} singerId 基因的 `Base.Id`
   * @returns {Promise<string>} 命中返回 mid；未命中返回空串（调用方据此显示「跳不了」）
   */
  async resolveSingerMid(name, singerId) {
    if (!name || !singerId) return ''
    const data = await musicSearch.musicSearch(name, 1, SEARCH_SINGER_NUM, SEARCH_TYPE_SINGER)
    return pickGeneSingerMid(data?.body?.singer?.list, singerId)
  },
}
