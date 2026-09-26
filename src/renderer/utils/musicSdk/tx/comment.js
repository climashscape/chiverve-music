import { httpFetch } from '../../request'
import { dateFormat2 } from '../../index'
import { requestMsg } from '../../message'
import { getQQCredential } from '@renderer/utils/ipc'
import getMusicInfo from './musicInfo'
import { pickCommentTotal } from './utils/commentTotal'
import { buildComm, txCgi } from './utils/request'

/**
 * 评论（读 + 写）。
 *
 * 读：最新评论走老式 h5 接口（`fcg_global_comment_h5.fcg`，`cmd=8`），热评走新式模块
 * （`CommentRead/GetHotCommentList`）——两条都匿名可访问，保持原样没动。
 * 写：新式 globalComment 接口（**要登录态**，`authst` 由 `buildComm` 从凭证里带）。
 * 端点与参数键名照抄 `QQMusicApi/qqmusic_api/modules/comment.py`，并逐条真机核对过：
 *
 *   1. 发布 `music.globalComment.CommentWriteServer/AddComment`，参数
 *      `{ Content, BizType: 1, BizId: '<数字歌曲id>' }`（回复再加 `RepliedCmId`）；
 *      **不需要 g_tk**（comm 里带 authst/qq 就够，实测 code=0/SubCode=0/'发表成功'）。
 *   2. 删除同模块 `DelComment`，参数 `{ CommentId }`，成功时 `code=0` 且 data 里
 *      `Subcode=0`。⚠️ `SubCode` 的大小写两个接口不一致（AddComment 是 `SubCode`，
 *      DelComment 是 `Subcode`），Python 侧 `data.get("SubCode", 0)` 在删除时永远取到
 *      默认值 0——照抄它等于没判成功，这里两种拼写都认。
 *   3. **老式读接口的 `commentid` 与新式 `CmId` 是同一个字符串**（实测同一条评论在两
 *      个接口里都是那个 66 字符的 `1!xxxx`），所以列表里拿到的 id 可以直接交给删除；
 *      读出来的每一项都带一个 `cmId`（裸 id），删除优先用它——新评/回复的复合 id 还能
 *      靠 `toCommentId` 还原，热评的 `${SeqNo}_${CmId}` 拆不出来，只能靠 `cmId`。
 *   4. 发布后要过几秒才会出现在公开列表里（实测同一首歌里有时 1s 内可见、有时要等
 *      数秒），别把"刚发完列表里还没有"当成失败。
 *   5. **评论条数就在上面那条 h5 读接口的响应里**（`body.comment.commenttotal`），
 *      不用另发请求、也没有可用的计数端点（`CommentRead/GetCommentCount` 未探通）：
 *      歌曲 `biztype=1` / 歌单 `biztype=3` 实测都能拿到（2026-09-25 探针，见
 *      `scripts/verify/artifacts/2026-09-25-qq-probe/NOTES.md` §3），解析统一走
 *      `./utils/commentTotal` 的 `pickCommentTotal`（取不到给 `null`，界面据此不显示计数）。
 *      ⚠️ `GetHotCommentList` 的 `data.CommentList.Total` 是**热评条数**，不是总评论数。
 *   6. **自己刚发的评论不在 h5 列表里**（2026-09-26 真机实测）：h5 `cmd=8` 是**公开视图**，
 *      `AddComment` 返回 `code=0/SubCode=0` 之后对方要过一段时间才公开（实测同一条评论
 *      发布后 2 小时仍不在 h5 列表、`commenttotal` 也不变），而新式
 *      `CommentRead/GetNewCommentList` + `SelfSeeEnable: 1` **1 秒内**就能读到它（`IsSelf=1`）。
 *      所以「刚发表的那条」单独走 `getSelfComment`，见组件的 `mergeOwnPendingComments`。
 */

const emojis = {
  e400846: '😘',
  e400874: '😴',
  e400825: '😃',
  e400847: '😙',
  e400835: '😍',
  e400873: '😳',
  e400836: '😎',
  e400867: '😭',
  e400832: '😊',
  e400837: '😏',
  e400875: '😫',
  e400831: '😉',
  e400855: '😡',
  e400823: '😄',
  e400862: '😨',
  e400844: '😖',
  e400841: '😓',
  e400830: '😈',
  e400828: '😆',
  e400833: '😋',
  e400822: '😀',
  e400843: '😕',
  e400829: '😇',
  e400824: '😂',
  e400834: '😌',
  e400877: '😷',
  e400132: '🍉',
  e400181: '🍺',
  e401067: '☕️',
  e400186: '🥧',
  e400343: '🐷',
  e400116: '🌹',
  e400126: '🍃',
  e400613: '💋',
  e401236: '❤️',
  e400622: '💔',
  e400637: '💣',
  e400643: '💩',
  e400773: '🔪',
  e400102: '🌛',
  e401328: '🌞',
  e400420: '👏',
  e400914: '🙌',
  e400408: '👍',
  e400414: '👎',
  e401121: '✋',
  e400396: '👋',
  e400384: '👉',
  e401115: '✊',
  e400402: '👌',
  e400905: '🙈',
  e400906: '🙉',
  e400907: '🙊',
  e400562: '👻',
  e400932: '🙏',
  e400644: '💪',
  e400611: '💉',
  e400185: '🎁',
  e400655: '💰',
  e400325: '🐥',
  e400612: '💊',
  e400198: '🎉',
  e401685: '⚡️',
  e400631: '💝',
  e400768: '🔥',
  e400432: '👑',
}

const songIdMap = new Map()
const promises = new Map()

/**
 * 组件按 `'取消请求'` 识别「这次请求是被主动取消的」（`MusicComment/index.vue` 的
 * getComment/getHotComment），而请求层的取消文案是 `requestMsg.cancelRequest`（'取消http请求'）
 * ——两者对不上时组件会把「取消」当失败并**递归重试**（旧歌的请求会再发两次，后到的旧响应照样
 * 覆盖新列表）。所以取消在数据层出口统一成组件认的那条，组件不用改。
 * ⚠️ 这个不一致在 v2.12.6 基线里就有（组件写死 `'取消请求'`）；让它真正生效靠下面的 beginRequest。
 */
const CANCELLED_MESSAGE = '取消请求'

/**
 * 生成「本次请求」的持有者，并取消上一次还没回来的同类请求。
 *
 * 原来 `this._requestObj` / `this._requestObj2` 只有读没有写（永远是 null），`cancelHttp()`
 * 是死代码：切歌 / 重开评论区时旧请求取消不掉，旧响应后到会覆盖新列表。写法照 `tx/lyric.js`
 * 的 getLyric（已验证）：请求是在 `getSongId` 之后才创建的，用 holder 兜住「创建前就被取消」
 * 的窗口；`api[field]` 存的是本次请求的取消入口（下一次调用据此取消本次）。
 */
const beginRequest = (api, field) => {
  if (api[field]) api[field].cancelHttp()
  const holder = { requestObj: null, cancelled: false }
  api[field] = {
    cancelHttp() {
      holder.cancelled = true
      if (holder.requestObj?.cancelHttp) holder.requestObj.cancelHttp()
    },
  }
  return holder
}

/** 被取消的请求统一抛「取消请求」；其余错误原样抛。两个窗口都覆盖：创建前取消、发出后取消。 */
const throwNormalizedCancel = (err, holder) => {
  if (holder.cancelled || err?.message === requestMsg.cancelRequest) throw new Error(CANCELLED_MESSAGE)
  throw err
}

/**
 * 写接口要登录态：无凭证时直接给出可读错误，别等接口返回 code=1xxx。
 *
 * 这里**不复用** `./utils/request` 的 `requireCredential`——那个还要求凭证带 `encryptUin`
 * （账户类接口才需要），评论写接口只要有 `authst`（musickey）就够，少一个前置条件少一处失败面。
 */
const requireLoginCredential = async() => {
  const credential = await getQQCredential()
  if (credential == null) throw new Error('QQ 音乐未登录')
  return credential
}

/** AddComment 的返回是 `SubCode`、DelComment 是 `Subcode`——两种拼写都认。 */
const SUB_CODE_KEYS = ['SubCode', 'Subcode']

const checkWriteResult = (node, failMsg) => {
  const data = node?.data ?? {}
  const subCode = SUB_CODE_KEYS.map(key => data[key]).find(value => value != null)
  if (node?.code != 0 || (subCode != null && subCode != 0)) throw new Error(data.Msg || failMsg)
  return data
}

/**
 * 取出裸评论 id（服务端要的 CmId）。
 *
 * 读接口给的都是复合 id：根评论 `${rootId}_${commentId}`、回复
 * `sub_${rootId}_${subCommentId}`、热评 `${SeqNo}_${CmId}`；删除接口只认裸 id。
 * 实测 181 个真实 id（commentid / rootcommentid / subcommentid，80 条评论）：
 * **没有一个含下划线**，字符集只有 `! - . *`，一律以 `1!` 开头——所以"取下划线之后
 * 的最后一段"是安全的还原方式，四种形状都能覆盖。
 */
const toCommentId = id => {
  const str = String(id ?? '').trim()
  if (!str) return ''
  const idx = str.lastIndexOf('_')
  return idx === -1 ? str : str.slice(idx + 1)
}

export default {
  _requestObj: null,
  _requestObj2: null,
  async getSongId({ songId, songmid }) {
    if (songId) return songId
    if (songIdMap.has(songmid)) return songIdMap.get(songmid)
    if (promises.has(songmid)) {
      const info = await promises.get(songmid)
      if (!info?.songId) throw new Error('Get song id failed')
      return info.songId
    }
    const promise = getMusicInfo(songmid)
    // key 必须是 songmid：原先写 `promises.set(promise)` 等于没去重（key 是 promise 对象，
    // 永远命中不到），并发查同一首歌会各发一次请求
    promises.set(songmid, promise)
    try {
      const info = await promise
      if (!info?.songId) throw new Error('Get song id failed')
      songIdMap.set(songmid, info.songId)
      return info.songId
    } finally {
      promises.delete(songmid)
    }
  },
  async getComment(mInfo, page = 1, limit = 20) {
    const holder = beginRequest(this, '_requestObj')
    const songId = await this.getSongId(mInfo)
    if (holder.cancelled) throw new Error(CANCELLED_MESSAGE)

    holder.requestObj = httpFetch('http://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
      },
      form: {
        uin: '0',
        format: 'json',
        cid: '205360772',
        reqtype: '2',
        biztype: '1',
        topid: songId,
        cmd: '8',
        needmusiccrit: '1',
        pagenum: page - 1,
        pagesize: limit,
      },
    })
    const { body, statusCode } = await holder.requestObj.promise.catch(err => throwNormalizedCancel(err, holder))
    if (statusCode != 200 || body.code !== 0) throw new Error('获取评论失败')
    // console.log(body, statusCode)
    const comment = body.comment
    // 总评论条数跟着这次列表响应一起回来（文件头第 5 条），界面显示「评论 (N)」直接用它，
    // 不为计数再打一次请求；`null` = 这次响应里没有这个数，调用方据此不显示计数
    const total = pickCommentTotal(comment)
    const comments = this.filterNewComment(comment.commentlist)
    // 计数缺失只该影响「总数」的显示，不该把分页上限钉成 1——那一页的列表其实可能还有更多。
    // 缺计数时按「本页是否满员」推断是否还有下一页（用原始条数判满，过滤后的条数会少）。
    const rawCount = Array.isArray(comment.commentlist) ? comment.commentlist.length : 0
    return {
      source: 'tx',
      comments,
      total,
      page,
      limit,
      maxPage: total == null
        ? (rawCount >= limit ? page + 1 : page)
        : Math.max(1, Math.ceil(total / limit)),
    }
  },
  async getHotComment(mInfo, page = 1, limit = 20) {
    // const _requestObj2 = httpFetch('http://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg', {
    //   method: 'POST',
    //   headers: {
    //     'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
    //   },
    //   form: {
    //     uin: '0',
    //     format: 'json',
    //     cid: '205360772',
    //     reqtype: '2',
    //     biztype: '1',
    //     topid: songId,
    //     cmd: '9',
    //     needmusiccrit: '1',
    //     pagenum: page - 1,
    //     pagesize: limit,
    //   },
    // })
    const holder = beginRequest(this, '_requestObj2')
    const songId = await this.getSongId(mInfo)
    if (holder.cancelled) throw new Error(CANCELLED_MESSAGE)

    holder.requestObj = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      body: {
        comm: {
          cv: 4747474,
          ct: 24,
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          notice: 0,
          platform: 'yqq.json',
          needNewCode: 1,
          uin: 0,
        },
        req: {
          module: 'music.globalComment.CommentRead',
          method: 'GetHotCommentList',
          param: {
            BizType: 1,
            BizId: String(songId),
            LastCommentSeqNo: '',
            PageSize: limit,
            PageNum: page - 1,
            HotType: 1,
            WithAirborne: 0,
            PicEnable: 1,
          },
        },
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36 Edg/113.0.0.0',
        referer: 'https://y.qq.com/',
        origin: 'https://y.qq.com',
      },
    })
    const { body, statusCode } = await holder.requestObj.promise.catch(err => throwNormalizedCancel(err, holder))
    // console.log('body', body)
    if (statusCode != 200 || body.code !== 0 || body.req.code !== 0) throw new Error('获取热门评论失败')
    const comment = body.req.data.CommentList
    return {
      source: 'tx',
      comments: this.filterHotComment(comment.Comments),
      // ⚠️ 这是**热评条数**（晴天实测 3964），**不是**歌曲总评论数（那是同名的
      // `commenttotal`，晴天 230665）——只在热评 tab 的计数与分页上用，别拿去当「评论数」
      total: comment.Total,
      page,
      limit,
      maxPage: Math.ceil(comment.Total / limit) || 1,
    }
  },
  /**
   * 取**自己的**评论（新式通道 `CommentRead/GetNewCommentList` + `SelfSeeEnable: 1`）。
   *
   * 存在的唯一理由见文件头第 6 条：h5 公开列表看不到自己「还没公开」的那条，这条通道能。
   * 返回的条目形状与 `filterNewComment` 对齐（组件与 `CommentFloor` 只认一套字段）。
   *
   * ⚠️ **别拿它替换 `getComment`**，两个硬理由：
   *   1. 它的 `PageNum` 实测**不翻页**（page 1/2/3 返回同一批数据，游标是 `LastCommentSeqNo`），
   *      界面上的数字分页器撑不住这种改法；
   *   2. 它的 `Total` 与 h5 的 `commenttotal` **不是同一个数**（晴天实测 330913 vs 230665），
   *      所以标题上的「评论 (N)」仍以 h5 为准（`pickCommentTotal`）。
   *
   * @param {object} mInfo 老式歌曲对象
   * @param {number} [limit] 最多取多少条（固定取第 1 页）
   * @returns {Promise<Array>} 只含 `IsSelf == 1` 的条目
   */
  async getSelfComment(mInfo, limit = 20) {
    const credential = await requireLoginCredential()
    const songId = await this.getSongId(mInfo)
    const node = await txCgi({
      module: 'music.globalComment.CommentRead',
      method: 'GetNewCommentList',
      param: {
        BizType: 1,
        BizId: String(songId),
        PageSize: limit,
        PageNum: 0,
        HashTagID: '',
        LastCommentSeqNo: '',
        // 关键参数：带上它才返回「仅自己可见」的条目（自己刚发的就在其中）
        SelfSeeEnable: 1,
        PicEnable: 1,
        AudioEnable: 1,
      },
    }, buildComm(credential)).promise
    if (node?.code != 0) throw new Error('获取自己的评论失败')

    const comments = node.data?.CommentList?.Comments ?? []
    return comments
      .filter(item => Number(item.IsSelf) === 1)
      .map(item => this.filterSelfComment(item))
  },
  /**
   * 发表评论（要登录态）。
   *
   * @param {object} mInfo 老式歌曲对象（有 songId 就用它，没有就按 songmid 查）
   * @param {string} content 评论正文
   * @param {string} [replyCmId] 传了就发成"回复某条评论"（根评论 id 或列表里的复合 id 都行）
   * @returns {Promise<{source: string, id: string, floor: number|null}>} id 可直接交给 deleteComment
   */
  async createComment(mInfo, content, replyCmId) {
    const text = String(content ?? '').trim()
    if (!text) throw new Error('评论内容不能为空')

    const credential = await requireLoginCredential()
    const songId = await this.getSongId(mInfo)
    const param = {
      Content: text,
      BizType: 1,
      BizId: String(songId),
    }
    if (replyCmId) param.RepliedCmId = toCommentId(replyCmId)

    const node = await txCgi({
      module: 'music.globalComment.CommentWriteServer',
      method: 'AddComment',
      param,
    }, buildComm(credential)).promise
    const data = checkWriteResult(node, '发表评论失败')

    return {
      source: 'tx',
      id: String(data.AddedCmId ?? ''),
      floor: data.Floor?.Num ?? null,
    }
  },
  /**
   * 删除评论（要登录态；服务端只允许删自己的评论）。
   * @param {string} cmId 裸 CmId，或读接口给的复合 id / 发布返回的 id
   * @returns {Promise<boolean>} 成功返回 true，失败抛错
   */
  async deleteComment(cmId) {
    const commentId = toCommentId(cmId)
    if (!commentId) throw new Error('缺少评论 id')

    const credential = await requireLoginCredential()
    const node = await txCgi({
      module: 'music.globalComment.CommentWriteServer',
      method: 'DelComment',
      param: { CommentId: commentId },
    }, buildComm(credential)).promise
    checkWriteResult(node, '删除评论失败')

    return true
  },
  filterNewComment(rawList) {
    return rawList.map(item => {
      let time = this.formatTime(item.time)
      let timeStr = time ? dateFormat2(time) : null
      if (item.middlecommentcontent) {
        let firstItem = item.middlecommentcontent[0]
        firstItem.avatarurl = item.avatarurl
        firstItem.praisenum = item.praisenum
        item.avatarurl = null
        item.praisenum = null
        item.middlecommentcontent.reverse()
      }
      return {
        id: `${item.rootcommentid}_${item.commentid}`,
        rootId: item.rootcommentid,
        // 服务端要的裸评论 id：写接口（删除）直接用这个，别去拆上面的复合 id
        cmId: String(item.commentid ?? ''),
        text: item.rootcommentcontent ? this.replaceEmoji(item.rootcommentcontent).replace(/\\n/g, '\n') : '',
        time: item.rootcommentid == item.commentid ? time : null,
        timeStr: item.rootcommentid == item.commentid ? timeStr : null,
        userName: item.rootcommentnick ? item.rootcommentnick.substring(1) : '',
        avatar: item.avatarurl,
        userId: item.encrypt_rootcommentuin,
        likedCount: item.praisenum,
        reply: item.middlecommentcontent
          ? item.middlecommentcontent.map(c => {
            // let index = c.subcommentid.lastIndexOf('_')
            return {
              id: `sub_${item.rootcommentid}_${c.subcommentid}`,
              cmId: String(c.subcommentid ?? ''),
              text: this.replaceEmoji(c.subcommentcontent).replace(/\\n/g, '\n'),
              time: c.subcommentid == item.commentid ? time : null,
              timeStr: c.subcommentid == item.commentid ? timeStr : null,
              userName: c.replynick.substring(1),
              avatar: c.avatarurl,
              userId: c.encrypt_replyuin,
              likedCount: c.praisenum,
            }
          })
          : [],
      }
    })
  },
  /**
   * 新式通道（`CommentRead/GetNewCommentList`）的条目整形。
   *
   * 字段名与 h5 那套完全不同（大驼峰），这里统一映射成 `filterNewComment` 的输出形状，
   * 组件与 `CommentFloor` 不需要知道数据来自哪条通道。`userId` 取 `EncryptUin`
   * ——已实测与凭证里的 `encryptUin` 是同一个值（同长度、同指纹），组件的
   * `canDelete` 就是靠它相等才显示「删除」。
   */
  filterSelfComment(item) {
    const time = item.PubTime ? this.formatTime(item.PubTime) : null
    return {
      id: `${item.SeqNo}_${item.CmId}`,
      rootId: item.SeqNo,
      cmId: String(item.CmId ?? ''),
      text: item.Content ? this.replaceEmoji(item.Content).replace(/\\n/g, '\n') : '',
      time,
      timeStr: time ? dateFormat2(time) : null,
      userName: item.Nick ?? '',
      avatar: item.Avatar,
      userId: item.EncryptUin,
      likedCount: item.PraiseNum,
      // 只用于「自己刚发的根评论」，不带回复列表（本应用的发评论入口也不支持附图）
      reply: [],
    }
  },
  filterHotComment(rawList) {
    return rawList.map(item => {
      return {
        id: `${item.SeqNo}_${item.CmId}`,
        rootId: item.SeqNo,
        // 热评的复合 id 是 `序号_CmId`（两半不同，拆不出来），删除只用这个裸 id
        cmId: String(item.CmId ?? ''),
        text: item.Content ? this.replaceEmoji(item.Content).replace(/\\n/g, '\n') : '',
        time: item.PubTime ? this.formatTime(item.PubTime) : null,
        timeStr: item.PubTime ? dateFormat2(this.formatTime(item.PubTime)) : null,
        userName: item.Nick ?? '',
        images: item.Pic ? [item.Pic] : [],
        avatar: item.Avatar,
        location: item.Location ? item.Location : '',
        userId: item.EncryptUin,
        likedCount: item.PraiseNum,
        reply: item.SubComments
          ? item.SubComments.map(c => {
            return {
              id: `sub_${c.SeqNo}_${c.CmId}`,
              text: this.replaceEmoji(c.Content).replace(/\\n/g, '\n'),
              time: c.PubTime ? this.formatTime(c.PubTime) : null,
              timeStr: c.PubTime ? dateFormat2(this.formatTime(c.PubTime)) : null,
              userName: c.Nick ?? '',
              avatar: c.Avatar,
              images: c.Pic ? [c.Pic] : [],
              userId: c.EncryptUin,
              likedCount: c.PraiseNum,
            }
          })
          : [],
      }
    })
  },
  replaceEmoji(msg) {
    let rxp = /^\[em\](e\d+)\[\/em\]$/
    let result = msg.match(/\[em\]e\d+\[\/em\]/g)
    if (!result) return msg
    result = Array.from(new Set(result))
    for (let item of result) {
      let code = item.replace(rxp, '$1')
      msg = msg.replace(new RegExp(item.replace('[em]', '\\[em\\]').replace('[/em]', '\\[\\/em\\]'), 'g'), emojis[code] || '')
    }
    return msg
  },
  formatTime(time) {
    return String(time).length < 10 ? null : parseInt(time + '000')
  },
}
