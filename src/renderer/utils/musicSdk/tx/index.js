import leaderboard from './leaderboard'
import lyric from './lyric'
import songList from './songList'
import musicSearch from './musicSearch'
import { apis } from '../api-source'
import hotSearch from './hotSearch'
import comment from './comment'
import user from './user'
import recommend from './recommend'
import album from './album'
import mv from './mv'
import singer from './singer'
import songDetail from './songDetail'
import tipSearch from './tipSearch'

const tx = {
  tipSearch,
  leaderboard,
  songList,
  musicSearch,
  hotSearch,
  comment,
  user,
  recommend,
  album,
  mv,
  singer,
  songDetail,

  getMusicUrl(songInfo, type) {
    return apis('tx').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    // let singer = songInfo.singer.indexOf('、') > -1 ? songInfo.singer.split('、')[0] : songInfo.singer
    return lyric.getLyric(songInfo)
  },
  async getPic(songInfo) {
    return `https://y.gtimg.cn/music/photo_new/T002R500x500M000${songInfo.albumId}.jpg`
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://y.qq.com/n/yqq/song/${songInfo.songmid}.html`
  },
  /**
   * 专辑的 QQ 网页链接（ui-polish 工单 02 补）。
   * 本仓原来只有歌曲 / 歌单 / 榜单三个生成器，专辑的链接在「复制专辑链接」「在 QQ 音乐打开」里要现拼；
   * 放在这里与上面那个同处一地，免得散在视图里。
   */
  getAlbumDetailPageUrl(albumMid) {
    return `https://y.qq.com/n/ryqq/albumDetail/${albumMid}`
  },
}

export default tx
