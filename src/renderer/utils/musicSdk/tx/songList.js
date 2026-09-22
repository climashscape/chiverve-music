import { httpFetch } from '../../request'
import { decodeName, dateFormat, formatPlayCount } from '../../index'
import { createSong } from './utils/song'
import { txCgi, buildComm, requireCredential } from './utils/request'

export default {
  _requestObj_tags: null,
  _requestObj_hotTags: null,
  _requestObj_list: null,
  limit_list: 36,
  limit_song: 100000,
  successCode: 0,
  sortList: [
    {
      name: '推荐',
      id: -1,
    },
    {
      name: '最热',
      id: 3,
    },
    {
      name: '最新',
      id: 2,
    },
  ],
  regExps: {
    hotTagHtml: /class="c_bg_link js_tag_item" data-id="\w+">.+?<\/a>/g,
    hotTag: /data-id="(\w+)">(.+?)<\/a>/,

    // https://y.qq.com/n/yqq/playlist/7217720898.html
    // https://i.y.qq.com/n2/m/share/details/taoge.html?platform=11&appshare=android_qq&appversion=9050006&id=7217720898&ADTAG=qfshare
    listDetailLink: /\/playlist\/(\d+)/,
    listDetailLink2: /id=(\d+)/,
  },
  tagsUrl: 'https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=wk_v15.json&needNewCode=0&data=%7B%22tags%22%3A%7B%22method%22%3A%22get_all_categories%22%2C%22param%22%3A%7B%22qq%22%3A%22%22%7D%2C%22module%22%3A%22playlist.PlaylistAllCategoriesServer%22%7D%7D',
  hotTagUrl: 'https://c.y.qq.com/node/pc/wk_v15/category_playlist.html',
  getListUrl(id, page) {
    id = parseInt(id)
    return `https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=wk_v15.json&needNewCode=0&data=${encodeURIComponent(JSON.stringify({
        comm: { cv: 1602, ct: 20 },
        playlist: {
          method: 'get_category_content',
          param: {
            titleid: id,
            caller: '0',
            category_id: id,
            size: this.limit_list,
            page: page - 1,
            use_page: 1,
          },
          module: 'playlist.PlayListCategoryServer',
        },
        }))}`
    // return `https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json&inCharset=utf-8&outCharset=utf-8&data=${encodeURIComponent(JSON.stringify({
    //       comm: { cv: 1602, ct: 20 },
    //       playlist: {
    //         method: 'get_playlist_by_tag',
    //         param: { id: 10000000, sin: this.limit_list * (page - 1), size: this.limit_list, order: sortId, cur_page: page },
    //         module: 'playlist.PlayListPlazaServer',
    //       },
    //   }))}`
  },
  getListDetailUrl(id) {
    return `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`
  },

  // http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=2849349915&pn=0&rn=100&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1
  // 获取标签
  getTag(tryNum = 0) {
    if (this._requestObj_tags) this._requestObj_tags.cancelHttp()
    if (tryNum > 2) return Promise.reject(new Error('try max num'))
    this._requestObj_tags = httpFetch(this.tagsUrl)
    return this._requestObj_tags.promise.then(({ body }) => {
      if (body.code !== this.successCode) return this.getTag(++tryNum)
      return this.filterTagInfo(body.tags.data.v_group)
    })
  },
  // 获取标签
  getHotTag(tryNum = 0) {
    if (this._requestObj_hotTags) this._requestObj_hotTags.cancelHttp()
    if (tryNum > 2) return Promise.reject(new Error('try max num'))
    this._requestObj_hotTags = httpFetch(this.hotTagUrl)
    return this._requestObj_hotTags.promise.then(({ statusCode, body }) => {
      if (statusCode !== 200) return this.getHotTag(++tryNum)
      return this.filterInfoHotTag(body)
    })
  },
  filterInfoHotTag(html) {
    let hotTag = html.match(this.regExps.hotTagHtml)
    const hotTags = []
    if (!hotTag) return hotTags

    hotTag.forEach(tagHtml => {
      let result = tagHtml.match(this.regExps.hotTag)
      if (!result) return
      hotTags.push({
        id: parseInt(result[1]),
        name: result[2],
        source: 'tx',
      })
    })
    return hotTags
  },
  filterTagInfo(rawList) {
    return rawList.map(type => ({
      name: type.group_name,
      list: type.v_item.map(item => ({
        parent_id: type.group_id,
        parent_name: type.group_name,
        id: item.id,
        name: item.name,
        source: 'tx',
      })),
    }))
  },

  async getRecommendList(page) {
    const { body } = await httpFetch(
    `https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=wk_v15.json&needNewCode=0&data=${encodeURIComponent(
      JSON.stringify({
        comm: { cv: 1602, ct: 20 },
        playlist: {
          module: 'music.playlist.PlaylistSquare',
          method: 'GetRecommendWhole',
          param: {
            IsReqFeed: true,
            FeedReq: {
              From: (page - 1) * this.limit_list,
              Size: this.limit_list,
            },
          },
        },
      }),
    )}`,
    ).promise
    if (body.code !== this.successCode) throw new Error('tx getRecommendList failed')
    return {
      list:
      body.playlist.data.FeedRsp.List?.map(({ Playlist }) => ({
        play_count: formatPlayCount(Playlist.basic.play_cnt),
        id: String(Playlist.basic.tid),
        author: decodeName(Playlist.basic.creator.nick),
        name: decodeName(Playlist.basic.title),
        time: Playlist.basic.modify_time ? dateFormat(Playlist.basic.modify_time * 1000, 'Y-M-D') : '',
        img: Playlist.basic.cover.medium_url || Playlist.basic.cover.default_url,
        total: Playlist.basic.song_cnt,
        desc: decodeName(Playlist.basic.desc).replace(/<br>/g, '\n'),
        source: 'tx',
      })) || [],
      total: body.playlist.data.FeedRsp.FromLimit,
      limit: this.limit_list,
      page,
      source: 'tx',
    }
  },

  // 获取列表数据
  getList(sortId, tagId, page, tryNum = 0) {
    if (this._requestObj_list) this._requestObj_list.cancelHttp()
    if (tryNum > 2) return Promise.reject(new Error('try max num'))
    if (!tagId) {
      if (!tagId && sortId == -1) return this.getRecommendList(page)
      tagId = sortId
    }
    this._requestObj_list = httpFetch(
      this.getListUrl(tagId, page),
    )
    // console.log(this.getListUrl(sortId, tagId, page))
    return this._requestObj_list.promise.then(({ body }) => {
      if (body.code !== this.successCode) return this.getList(sortId, tagId, page, ++tryNum)
      return this.filterList(body.playlist.data, page)
    })
  },

  // filterList(data, page) {
  //   return {
  //     list: data.v_playlist.map(item => ({
  //       play_count: formatPlayCount(item.access_num),
  //       id: String(item.tid),
  //       author: item.creator_info.nick,
  //       name: item.title,
  //       time: item.modify_time ? dateFormat(item.modify_time * 1000, 'Y-M-D') : '',
  //       img: item.cover_url_medium,
  //       // grade: item.favorcnt / 10,
  //       total: item.song_ids?.length,
  //       desc: decodeName(item.desc).replace(/<br>/g, '\n'),
  //       source: 'tx',
  //     })),
  //     total: data.total,
  //     page,
  //     limit: this.limit_list,
  //     source: 'tx',
  //   }
  // },
  filterList({ content }, page) {
    // console.log(content.v_item)
    return {
      list: content.v_item.map(({ basic }) => ({
        play_count: formatPlayCount(basic.play_cnt),
        id: String(basic.tid),
        author: basic.creator.nick,
        name: basic.title,
        // time: basic.publish_time,
        img: basic.cover.medium_url || basic.cover.default_url,
        // grade: basic.favorcnt / 10,
        desc: decodeName(basic.desc).replace(/<br>/g, '\n'),
        source: 'tx',
      })),
      total: content.total_cnt,
      page,
      limit: this.limit_list,
      source: 'tx',
    }
  },

  async handleParseId(link, retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('link try max num'))

    const requestObj_listDetailLink = httpFetch(link)
    const { headers: { location }, statusCode } = await requestObj_listDetailLink.promise
    // console.log(headers)
    if (statusCode > 400) return this.handleParseId(link, ++retryNum)
    return location == null ? link : location
  },

  async getListId(id) {
    if ((/[?&:/]/.test(id))) {
      if (!this.regExps.listDetailLink.test(id)) {
        id = await this.handleParseId(id)
      }
      let result = this.regExps.listDetailLink.exec(id)
      if (!result) {
        result = this.regExps.listDetailLink2.exec(id)
        if (!result) throw new Error('failed')
      }
      id = result[1]
      // console.log(id)
    }
    return id
  },
  // 获取歌曲列表内的音乐
  async getListDetail2(id, tryNum = 0) {
    if (tryNum > 2) return Promise.reject(new Error('try max num'))

    const requestObj_listDetail = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'post',
      headers: {
        Origin: 'https://y.qq.com',
        Referer: `https://y.qq.com/n/yqq/playsquare/${id}.html`,
      },
      body: {
        comm: {
          cv: 4747474,
          ct: 24,
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          platform: 'yqq.json',
          needNewCode: 1,
          uin: 0,
        },
        req_1: {
          module: 'music.srfDissInfo.aiDissInfo',
          method: 'uniform_get_Dissinfo',
          param: {
            disstid: parseInt(id),
            userinfo: 1,
            tag: 1,
            orderlist: 1,
            song_begin: 0,
            song_num: this.limit_song,
            onlysonglist: 0,
            enc_host_uin: '',
          },
        },
      },
    })
    const { body } = await requestObj_listDetail.promise
    // console.log(body)
    if (body.code !== this.successCode) return this.getListDetail2(id, ++tryNum)
    if (body.req_1.code !== this.successCode) throw new Error('failed')

    const result = body.req_1.data
    const dirinfo = result.dirinfo
    return {
      list: this.filterListDetail(result.songlist),
      page: 1,
      limit: this.limit_song,
      total: result.total_song_num,
      source: 'tx',
      info: {
        name: dirinfo.title,
        img: dirinfo.picurl,
        desc: decodeName(dirinfo.desc ?? '').replace(/<br>/g, '\n'),
        author: dirinfo.host_nick,
        play_count: formatPlayCount(dirinfo.listennum),
      },
    }
  },
  // 获取歌曲列表内的音乐
  async getListDetail(id, tryNum = 0) {
    if (tryNum > 2) return Promise.reject(new Error('try max num'))

    // eslint-disable-next-line require-atomic-updates
    id = await this.getListId(id)

    const requestObj_listDetail = httpFetch(this.getListDetailUrl(id), {
      headers: {
        Origin: 'https://y.qq.com',
        Referer: `https://y.qq.com/n/yqq/playsquare/${id}.html`,
      },
    })
    const { body } = await requestObj_listDetail.promise

    // console.log(body)
    if (body.code !== this.successCode) return this.getListDetail(id, ++tryNum)
    // fcg_ucc 这条拿不到 cdlist 时（dir 型歌单如「我喜欢」就是这种情况），
    // 先走登录态的 CgiGetDiss（实测 disstid=tid + dirid=0 对 dir 型同样有效），
    // 最后才落到 legacy 的访客端点
    if (body.subcode !== this.successCode || !body.cdlist) {
      return this.getListDetailByCgi(id).catch(() => this.getListDetail2(id))
    }
    const cdlist = body.cdlist[0]
    return {
      list: this.filterListDetail(cdlist.songlist),
      page: 1,
      limit: cdlist.songlist.length + 1,
      total: cdlist.songlist.length,
      source: 'tx',
      info: {
        name: cdlist.dissname,
        img: cdlist.logo,
        desc: decodeName(cdlist.desc).replace(/<br>/g, '\n'),
        author: cdlist.nickname,
        play_count: formatPlayCount(cdlist.visitnum),
      },
    }
  },
  filterListDetail(rawList) {
    // console.log(rawList)
    return rawList.map(item => {
      return createSong(item)
    })
  },

  /**
   * 歌单详情的登录态取法：`music.srfDissInfo.DissInfo/CgiGetDiss`，
   * `disstid` 直接传歌单的 **tid**、`dirid` 传 0。
   *
   * 实测（2026-09-22）：`disstid=3802852742 & dirid=0` 能读到「我喜欢」
   * （`code 0` + `dirinfo.title` + `songlist`），而 legacy 的 `fcg_ucc_getcdinfo_byids_cp`
   * 与 `srfDissInfo.aiDissInfo` 对这类 dir 型歌单都取不到歌曲——所以它是回退链里
   * 让"点开自己的歌单"能用的那一环。普通歌单走它也正常。
   */
  async getListDetailByCgi(id, page = 1, num = 30) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.srfDissInfo.DissInfo',
      method: 'CgiGetDiss',
      param: {
        disstid: Number(id),
        dirid: 0,
        tag: true,
        song_begin: num * (page - 1),
        song_num: num,
        userinfo: true,
        orderlist: true,
        enc_host_uin: credential.encryptUin,
      },
    }, buildComm(credential)).promise
    const d = data?.data ?? {}
    const list = (d.songlist ?? []).map(createSong)
    if (!list.length) throw new Error('歌单为空或不可读')
    const dir = d.dirinfo ?? {}
    return {
      list,
      page,
      limit: num,
      total: Number(d.total ?? d.songlist_size ?? list.length),
      source: 'tx',
      info: {
        name: dir.title ?? '',
        img: dir.picurl ?? '',
        desc: dir.desc ?? null,
        author: '',
        play_count: '',
      },
    }
  },
  getTags() {
    return Promise.all([this.getTag(), this.getHotTag()]).then(([tags, hotTag]) => ({ tags, hotTag, source: 'tx' }))
  },

  async getDetailPageUrl(id) {
    id = await this.getListId(id)

    return `https://y.qq.com/n/ryqq/playlist/${id}`
  },

  search(text, page, limit = 20, retryNum = 0) {
    if (retryNum > 5) throw new Error('max retry')
    return httpFetch(`http://c.y.qq.com/soso/fcgi-bin/client_music_search_songlist?page_no=${page - 1}&num_per_page=${limit}&format=json&query=${encodeURIComponent(text)}&remoteplace=txt.yqq.playlist&inCharset=utf8&outCharset=utf-8`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
        Referer: 'http://y.qq.com/portal/search.html',
      },
    })
      .promise.then(({ body }) => {
        if (body.code != 0) return this.search(text, page, limit, ++retryNum)
        // console.log(body.data.list)
        return {
          list: body.data.list.map(item => {
            return {
              play_count: formatPlayCount(item.listennum),
              id: String(item.dissid),
              author: decodeName(item.creator.name),
              name: decodeName(item.dissname),
              time: dateFormat(item.createtime, 'Y-M-D'),
              img: item.imgurl,
              // grade: item.favorcnt / 10,
              total: item.song_count,
              desc: decodeName(decodeName(item.introduction)).replace(/<br>/g, '\n'),
              source: 'tx',
            }
          }),
          limit,
          total: body.data.sum,
          source: 'tx',
        }
      })
  },

  // ── 我的歌单写操作（M6）──────────────────────────────────────────────
  //
  // 端点对照 QQMusicApi `modules/songlist.py:79-229`。都是登录态接口，凭证与 comm
  // 走 tx/utils/request（`authst` 注入在 buildComm 里）。返回 code 语义：
  // retCode 0 = 成功；80092 = 歌单里没有这首歌（删除时视为已达目标状态，不算失败）。

  /**
   * 创建歌单。重名不会失败（服务端自行加时间戳）。
   * 返回 `{ dirId, tid, name }`——**实测**新歌单的 dirId/tid 在 `data.result` 里，
   * 不在 `data.dirId`（那是删除接口的回显字段）。加歌/移歌要用返回的 `tid`。
   */
  async createList(dirName) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.musicasset.PlaylistBaseWrite',
      method: 'AddPlaylist',
      param: { dirName: String(dirName ?? '') },
    }, buildComm(credential)).promise
    const result = data?.data?.result ?? data?.result ?? {}
    const dirId = Number(result.dirId ?? 0)
    if (!dirId) throw new Error('创建歌单失败')
    return { dirId, tid: Number(result.tid ?? 0), name: result.dirName ?? String(dirName ?? '') }
  },

  /** 删除自建歌单。成功时 `result.dirId` 回显被删的 dirId；删不存在的歌单返回 0。 */
  async removeList(dirId) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.musicasset.PlaylistBaseWrite',
      method: 'DelPlaylist',
      param: { dirId: Number(dirId) },
    }, buildComm(credential)).promise
    const result = data?.data?.result ?? data?.result ?? {}
    return Number(result.dirId ?? 0) !== 0
  },

  /**
   * 往自建歌单里加歌。
   * `songs` 每项要 `{ songId, songType }`——`songType` 是 QQ 的原始 `type`，
   * 工厂（utils/song.js）已把它放在歌曲对象上，直接传 `musicInfo.songId/songType` 即可。
   */
  async addSongToList(dirId, songs, tid = 0) {
    return this._writeSongList('AddSonglist', dirId, songs, tid)
  },

  /** 从自建歌单里移除歌曲。参数同 addSongToList。 */
  async removeSongFromList(dirId, songs, tid = 0) {
    return this._writeSongList('DelSonglist', dirId, songs, tid)
  },

  /** 增删歌曲的公共实现（两者只差 method）。 */
  async _writeSongList(method, dirId, songs, tid = 0) {
    const credential = await requireCredential()
    const v_songInfo = (songs ?? []).map(song => ({
      songId: Number(song.songId),
      songType: Number(song.songType ?? 0),
    }))
    if (!v_songInfo.length) throw new Error('未选择歌曲')
    const data = await txCgi({
      module: 'music.musicasset.PlaylistDetailWrite',
      method,
      param: {
        dirId: Number(dirId),
        tid: Number(tid),
        bFmtUtf8: true,
        v_songInfo,
      },
    }, buildComm(credential)).promise
    const retCode = data?.data?.retCode ?? data?.retCode
    return retCode === 0 || retCode === 80092
  },
}

// getList
// getTags
// getListDetail
