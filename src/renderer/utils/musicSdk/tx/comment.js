import { httpFetch } from '../../request'
import { dateFormat2 } from '../../index'
import { getQQCredential } from '@renderer/utils/ipc'
import getMusicInfo from './musicInfo'
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
    if (this._requestObj) this._requestObj.cancelHttp()
    const songId = await this.getSongId(mInfo)

    const _requestObj = httpFetch('http://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg', {
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
    const { body, statusCode } = await _requestObj.promise
    if (statusCode != 200 || body.code !== 0) throw new Error('获取评论失败')
    // console.log(body, statusCode)
    const comment = body.comment
    return {
      source: 'tx',
      comments: this.filterNewComment(comment.commentlist),
      total: comment.commenttotal,
      page,
      limit,
      maxPage: Math.ceil(comment.commenttotal / limit) || 1,
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
    if (this._requestObj2) this._requestObj2.cancelHttp()
    const songId = await this.getSongId(mInfo)

    const _requestObj2 = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
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
    const { body, statusCode } = await _requestObj2.promise
    // console.log('body', body)
    if (statusCode != 200 || body.code !== 0 || body.req.code !== 0) throw new Error('获取热门评论失败')
    const comment = body.req.data.CommentList
    return {
      source: 'tx',
      comments: this.filterHotComment(comment.Comments),
      total: comment.Total,
      page,
      limit,
      maxPage: Math.ceil(comment.Total / limit) || 1,
    }
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
