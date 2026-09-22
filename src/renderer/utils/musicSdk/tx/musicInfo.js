import { httpFetch } from '../../request'
import { createSong } from './utils/song'

/**
 * 按 songmid 查歌曲的完整信息（`music.pf_song_detail_svr`）。
 *
 * 被 `lyric.js` 与 `comment.js` 用来补数字 songId / 完整字段；字段映射统一走
 * `utils/song.js` 的工厂（别再手写一遍）。
 */
export default (songmid) => {
  const requestObj = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'post',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
    },
    body: {
      comm: {
        ct: '19',
        cv: '1859',
        uin: '0',
      },
      req: {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail_yqq',
        param: {
          song_type: 0,
          song_mid: songmid,
        },
      },
    },
  })
  return requestObj.promise.then(({ body }) => {
    if (body.code != 0 || body.req.code != 0) return Promise.reject(new Error('获取歌曲信息失败'))
    const item = body.req.data.track_info
    if (!item.file?.media_mid) return null

    return createSong(item)
  })
}
