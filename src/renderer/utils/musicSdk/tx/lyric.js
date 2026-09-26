import { httpFetch } from '../../request'
import { requestMsg } from '../../message'
import getMusicInfo from './musicInfo'
import { decodeQrc } from './qrcDecode'

const songIdMap = new Map()
const promises = new Map()
export const decodeLyric = async(lrc, tlrc, rlrc) => ({
  lyric: await decodeQrc(lrc),
  tlyric: await decodeQrc(tlrc),
  rlyric: await decodeQrc(rlrc),
})


const parseTools = {
  rxps: {
    info: /^{"/,
    lineTime: /^\[(\d+),\d+\]/,
    lineTime2: /^\[([\d:.]+)\]/,
    wordTime: /\(\d+,\d+\)/,
    wordTimeAll: /(\(\d+,\d+\))/g,
    timeLabelFixRxp: /(?:\.0+|0+)$/,
  },
  msFormat(timeMs) {
    if (Number.isNaN(timeMs)) return ''
    let ms = (timeMs % 1000).toString().padStart(3, '0')
    timeMs /= 1000
    let m = parseInt(timeMs / 60).toString().padStart(2, '0')
    timeMs %= 60
    let s = parseInt(timeMs).toString().padStart(2, '0')
    return `[${m}:${s}.${ms}]`
  },
  parseLyric(lrc) {
    lrc = lrc.trim()
    lrc = lrc.replace(/\r/g, '')
    if (!lrc) return { lyric: '', lxlyric: '' }
    const lines = lrc.split('\n')

    const lxlrcLines = []
    const lrcLines = []

    for (let line of lines) {
      line = line.trim()
      let result = this.rxps.lineTime.exec(line)
      if (!result) {
        if (line.startsWith('[offset')) {
          lxlrcLines.push(line)
          lrcLines.push(line)
        }
        if (this.rxps.lineTime2.test(line)) {
          // lxlrcLines.push(line)
          lrcLines.push(line)
        }
        continue
      }

      const startMsTime = parseInt(result[1])
      const startTimeStr = this.msFormat(startMsTime)
      if (!startTimeStr) continue

      let words = line.replace(this.rxps.lineTime, '')

      lrcLines.push(`${startTimeStr}${words.replace(this.rxps.wordTimeAll, '')}`)

      let times = words.match(this.rxps.wordTimeAll)
      if (!times) continue
      times = times.map(time => {
        const result = /\((\d+),(\d+)\)/.exec(time)
        return `<${Math.trunc(Math.max(parseInt(result[1]) - startMsTime, 0))},${result[2]}>`
      })
      const wordArr = words.split(this.rxps.wordTime)
      const newWords = times.map((time, index) => `${time}${wordArr[index]}`).join('')
      lxlrcLines.push(`${startTimeStr}${newWords}`)
    }
    return {
      lyric: lrcLines.join('\n'),
      lxlyric: lxlrcLines.join('\n'),
    }
  },
  parseRlyric(lrc) {
    lrc = lrc.trim()
    lrc = lrc.replace(/\r/g, '')
    if (!lrc) return { lyric: '', lxlyric: '' }
    const lines = lrc.split('\n')

    const lrcLines = []

    for (let line of lines) {
      line = line.trim()
      let result = this.rxps.lineTime.exec(line)
      if (!result) continue

      const startMsTime = parseInt(result[1])
      const startTimeStr = this.msFormat(startMsTime)
      if (!startTimeStr) continue

      let words = line.replace(this.rxps.lineTime, '')

      lrcLines.push(`${startTimeStr}${words.replace(this.rxps.wordTimeAll, '')}`)
    }
    return lrcLines.join('\n')
  },
  removeTag(str) {
    return str.replace(/^[\S\s]*?LyricContent="/, '').replace(/"\/>[\S\s]*?$/, '')
  },
  getIntv(interval) {
    if (!interval) return 0
    if (!interval.includes('.')) interval += '.0'
    let arr = interval.split(/:|\./)
    while (arr.length < 3) arr.unshift('0')
    const [m, s, ms] = arr
    return parseInt(m) * 3600000 + parseInt(s) * 1000 + parseInt(ms)
  },
  fixRlrcTimeTag(rlrc, lrc) {
    // console.log(lrc)
    // console.log(rlrc)
    const rlrcLines = rlrc.split('\n')
    let lrcLines = lrc.split('\n')
    // let temp = []
    let newLrc = []
    rlrcLines.forEach((line) => {
      const result = this.rxps.lineTime2.exec(line)
      if (!result) return
      const words = line.replace(this.rxps.lineTime2, '')
      if (!words.trim()) return
      const t1 = this.getIntv(result[1])

      while (lrcLines.length) {
        const lrcLine = lrcLines.shift()
        const lrcLineResult = this.rxps.lineTime2.exec(lrcLine)
        if (!lrcLineResult) continue
        const t2 = this.getIntv(lrcLineResult[1])
        if (Math.abs(t1 - t2) < 100) {
          newLrc.push(line.replace(this.rxps.lineTime2, lrcLineResult[0]))
          break
        }
        // temp.push(line)
      }
      // lrcLines = [...temp, ...lrcLines]
      // temp = []
    })
    return newLrc.join('\n')
  },
  fixTlrcTimeTag(tlrc, lrc) {
    // console.log(lrc)
    // console.log(tlrc)
    const tlrcLines = tlrc.split('\n')
    let lrcLines = lrc.split('\n')
    // let temp = []
    let newLrc = []
    tlrcLines.forEach((line) => {
      const result = this.rxps.lineTime2.exec(line)
      if (!result) return
      const words = line.replace(this.rxps.lineTime2, '')
      if (!words.trim()) return
      let time = result[1]
      if (time.includes('.')) {
        time += ''.padStart(3 - time.split('.')[1].length, '0')
      }
      const t1 = this.getIntv(time)

      while (lrcLines.length) {
        const lrcLine = lrcLines.shift()
        const lrcLineResult = this.rxps.lineTime2.exec(lrcLine)
        if (!lrcLineResult) continue
        const t2 = this.getIntv(lrcLineResult[1])
        if (Math.abs(t1 - t2) < 100) {
          newLrc.push(line.replace(this.rxps.lineTime2, lrcLineResult[0]))
          break
        }
        // temp.push(line)
      }
      // lrcLines = [...temp, ...lrcLines]
      // temp = []
    })
    return newLrc.join('\n')
  },
  parse(lrc, tlrc, rlrc) {
    const info = {
      lyric: '',
      tlyric: '',
      rlyric: '',
      lxlyric: '',
    }
    if (lrc) {
      let { lyric, lxlyric } = this.parseLyric(this.removeTag(lrc))
      info.lyric = lyric
      info.lxlyric = lxlyric
      // console.log(lyric)
      // console.log(lxlyric)
    }
    if (rlrc) info.rlyric = this.fixRlrcTimeTag(this.parseRlyric(this.removeTag(rlrc)), info.lyric)
    if (tlrc) info.tlyric = this.fixTlrcTimeTag(tlrc, info.lyric)
    // console.log(info.lyric)
    // console.log(info.tlyric)
    // console.log(info.rlyric)

    return info
  },
}


/**
 * 歌词请求层。
 *
 * 三条实测结论（2026-09-22 真机核对，见 spec §5.4）：
 *   1. `GetPlayLyricInfo` 一次就能拿四条轨：`lyric`（QRC 逐字）、`trans`（翻译）、
 *      `roma`（音译 = rlyric）、`singingAnnotationsLyric`（助唱）。**日语歌才是音译的
 *      主要来源**（如《残酷な天使のテーゼ》roma 有 7216 hex、解出 8406 字），
 *      华语歌多数没有（`roma` 为 `""`，解析出空串是正常结果，不是失败）。
 *   2. 四条轨都是 QRC 加密（hex），要过 `decodeQrc`（3DES + inflate）。
 *   3. `code=0` 才有效；模块级 `req.code` 与顶层 `body.code` 都要看。
 */
const LYRIC_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

/**
 * 发歌词请求并解析（重试也放在这一层）。
 *
 * **为什么重试不放回 `getLyric`**：原来失败时递归 `this.getLyric(songId, ++retryNum)`，
 * 把**数字 songId 当成 mInfo 又传回去**（`getSongId` 从数字里解构出 undefined → 拿
 * 一个不存在的 songmid 去查歌曲详情），而且 `.then` 里返回的是"请求对象"而不是解析
 * 结果——重试路径整体是坏的。这里改成在同一层重试，语义单一。
 *
 * `holder.requestObj` 是给外层 `cancelHttp` 用的：请求是在异步链路里才创建的，
 * 外层拿不到它，只能通过 holder 暴露"当前这一次"请求。
 */
const fetchLyric = (api, songId, holder, retryNum = 0) => {
  if (retryNum > 3) return Promise.reject(new Error('Get lyric failed'))

  holder.requestObj = httpFetch(LYRIC_URL, {
    method: 'post',
    headers: {
      referer: 'https://y.qq.com',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36',
    },
    body: {
      comm: {
        ct: '19',
        cv: '1859',
        uin: '0',
      },
      req: {
        method: 'GetPlayLyricInfo',
        module: 'music.musichallSong.PlayLyricInfo',
        param: {
          format: 'json',
          crypt: 1,
          ct: 19,
          cv: 1873,
          interval: 0,
          lrc_t: 0,
          qrc: 1,
          qrc_t: 0,
          roma: 1,
          roma_t: 0,
          songID: songId,
          trans: 1,
          trans_t: 0,
          type: -1,
        },
      },
    },
  })
  return holder.requestObj.promise.then(({ body }) => {
    if (body.code != api.successCode || body.req?.code != api.successCode) return fetchLyric(api, songId, holder, ++retryNum)
    const data = body.req.data
    // 返回 { lyric, tlyric, rlyric, lxlyric }：rlyric 供 core/lyric.ts 的 extendedLyrics 拼装
    return api.parseLyric(data.lyric, data.trans, data.roma)
  })
}

/**
 * AI 歌词词典（点歌词查词）取数层——**整首词典，不是按词查**。
 *
 * 2026-09-26 探针实测（记录：`scripts/verify/artifacts/2026-09-26-capabilities/NOTES-lyric-dict.md`）：
 *   1. 入参**只有 `songID`**，一次拿回整首歌的词条数组 `data.dictList`
 *      →「用户点哪个词」是**客户端在数组里匹配**（`matchDictEntries`），服务端没有按词查的端点。
 *   2. **没有词典时 `dictList` 是 `null`（不是 `[]`）**，而且 `code` 照样 0——没有错误码可判，
 *      只能把它当空数组（`IsAIDictExists` 那条 `exists` 只是省一次取数的预告，判据一样）。
 *   3. **不需要登录**：匿名（`uin: '0'`、不带 authst）与登录返回一致，所以这里不发凭证。
 *   4. 词条 5 个字段：`phrase`（被划的词/短语）/ `explain`（中文长释义）/ `lyric_text`（所在行原文）/
 *      `trans_lyric_text`（该行翻译）/ `lyric_timestamp`（`[mm:ss.xx]` 字符串）。
 *   5. 词典只给**外语原文歌**的条目：英文歌（Queen / Adele 原版）有，中文歌与日文歌实测都没有
 *      →「查不到」是常态，调用方必须展示「无释义」而不是空白。
 *
 * 请求形状与 `fetchLyric` 同源（同一网关、同一模块、同一份 comm），只换 method 与 param。
 */
const fetchLyricDict = (api, songId, holder, retryNum = 0) => {
  if (retryNum > 3) return Promise.reject(new Error('Get lyric dict failed'))

  holder.requestObj = httpFetch(LYRIC_URL, {
    method: 'post',
    headers: {
      referer: 'https://y.qq.com',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36',
    },
    body: {
      comm: {
        ct: '19',
        cv: '1859',
        uin: '0',
      },
      req: {
        method: 'GetAIDictInfo',
        module: 'music.musichallSong.PlayLyricInfo',
        param: {
          format: 'json',
          songID: songId,
        },
      },
    },
  })
  return holder.requestObj.promise.then(({ body }) => {
    if (body.code != api.successCode || body.req?.code != api.successCode) return fetchLyricDict(api, songId, holder, ++retryNum)
    const list = body.req.data?.dictList
    // null / 缺字段 / 形状不对一律当「没有词典」：调用方只关心「有没有可展示的词条」
    return Array.isArray(list) ? list : []
  })
}

/** 匹配用的归一化：小写 + 空白折叠 + 去首尾（`phrase` 里 `let you go` 与 `Let me go` 这类大小写不统一）。 */
const normalizeDictText = text => typeof text == 'string' ? text.toLowerCase().replace(/\s+/g, ' ').trim() : ''

/**
 * 在整首词典里匹配用户选中的文本。**纯函数**（不碰 DOM / 网络）——所以放在数据层，由 node 环境单测钉住。
 *
 * 四条规则按优先级短路（第一条命中就不再往下走）：
 *   1. 选区 == 词条 `phrase`（双击一个短语，最常见）
 *   2. 选区 == 某条词条的整行 `lyric_text` → 返回该行**全部**词条（explain 讲的是「这行里的这个词」，
 *      只给一条会让人以为其余词的释义丢了）
 *   3. 词条 `phrase` 落在选区**内部**（框选了半行 / 整行但与原行不完全相等，如歌词带标点）→ 长 phrase 优先
 *   4. 选区落在词条 `phrase` 内部（双击只选中一个英文单词，词条却是短语：选 `poor` → `poor boy`）
 *      单字符选区不参与第 4 条：`a` / `I` 这种会命中一大串无关词条
 *
 * 都不命中 → `[]`，由调用方展示「无释义」。加规则前先想清楚「哪条更具体」——顺序就是优先级。
 */
export const matchDictEntries = (dictList, text) => {
  const key = normalizeDictText(text)
  if (!key || !Array.isArray(dictList) || !dictList.length) return []
  const phraseOf = item => normalizeDictText(item?.phrase)
  const longerFirst = (a, b) => phraseOf(b).length - phraseOf(a).length

  const exact = dictList.filter(item => phraseOf(item) == key)
  if (exact.length) return exact
  const wholeLine = dictList.filter(item => normalizeDictText(item?.lyric_text) == key)
  if (wholeLine.length) return wholeLine
  const inside = dictList.filter(item => phraseOf(item) && key.includes(phraseOf(item)))
  if (inside.length) return inside.sort(longerFirst)
  if (key.length < 2) return []
  return dictList.filter(item => phraseOf(item).includes(key)).sort(longerFirst)
}

export default {
  successCode: 0,
  async getSongId({ songId, songmid }) {
    if (songId) return songId
    if (songIdMap.has(songmid)) return songIdMap.get(songmid)
    if (promises.has(songmid)) {
      const info = await promises.get(songmid)
      if (!info?.songId) throw new Error('Get song id failed')
      return info.songId
    }
    const promise = getMusicInfo(songmid)
    // key 必须是 songmid：原来写 `promises.set(promise)` 等于没去重（key 是 promise 对象），
    // 两次并发查同一首歌会各发一次请求，还会留下永远命中不到的垃圾项
    promises.set(songmid, promise)
    try {
      const info = await promise
      if (!info?.songId) throw new Error('Get song id failed')
      songIdMap.set(songmid, info.songId)
      return info.songId
    } finally {
      // 失败也要清：否则一条查不到的歌会把后续同 mid 的请求永久钉在已 reject 的 promise 上
      promises.delete(songmid)
    }
  },
  async parseLyric(lrc, tlrc, rlrc) {
    const { lyric, tlyric, rlyric } = await decodeLyric(lrc, tlrc, rlrc)
    return parseTools.parse(lyric, tlyric, rlyric)
  },
  /**
   * 取歌词。返回 `{ promise, cancelHttp }`（**不是裸 Promise**，见 §2.6 硬约束 1）。
   * promise resolve `{ lyric, tlyric, rlyric, lxlyric }`。
   *
   * `cancelHttp` 原来是个空函数（切歌时取消不掉，旧歌的响应会白跑一遍解密+解析）；
   * 这里按 `musicUrl.js` 的写法转发给"当前这一次"真实请求，并兼顾"请求还没创建就
   * 被取消"的窗口（`cancelled` 标记）。
   */
  getLyric(mInfo) {
    const holder = { requestObj: null, cancelled: false }

    return {
      cancelHttp() {
        holder.cancelled = true
        if (holder.requestObj?.cancelHttp) holder.requestObj.cancelHttp()
      },
      promise: this.getSongId(mInfo).then(songId => {
        if (holder.cancelled) throw new Error(requestMsg.cancelRequest)
        return fetchLyric(this, songId, holder)
      }),
    }
  },
  /**
   * 取整首歌词词典（点歌词查词）。返回 `{ promise, cancelHttp }`（与 `getLyric` 同契约）；
   * promise resolve **词条数组**（没有词典时是 `[]`，不会是 null——归一化在 `fetchLyricDict` 做）。
   *
   * 调用方拿到数组后用 `matchDictEntries` 匹配用户选区；**取不到不算错误**，是「这首歌没有词典」。
   * 本地音乐没有 songId（`getSongId` 会抛），调用方应先判 `source`/`songmid` 再决定要不要查。
   */
  getLyricDict(mInfo) {
    const holder = { requestObj: null, cancelled: false }

    return {
      cancelHttp() {
        holder.cancelled = true
        if (holder.requestObj?.cancelHttp) holder.requestObj.cancelHttp()
      },
      promise: this.getSongId(mInfo).then(songId => {
        if (holder.cancelled) throw new Error(requestMsg.cancelRequest)
        return fetchLyricDict(this, songId, holder)
      }),
    }
  },
}

// export default {
//   regexps: {
//     matchLrc: /.+"lyric":"([\w=+/]*)".+/,
//   },
//   getLyric(songmid) {
//     const requestObj = httpFetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq`, {
//       headers: {
//         Referer: 'https://y.qq.com/portal/player.html',
//       },
//     })
//     requestObj.promise = requestObj.promise.then(({ body }) => {
//       if (body.code != 0 || !body.lyric) return Promise.reject(new Error('Get lyric failed'))
//       return {
//         lyric: decodeName(b64DecodeUnicode(body.lyric)),
//         tlyric: decodeName(b64DecodeUnicode(body.trans)),
//       }
//     })
//     return requestObj
//   },
// }
