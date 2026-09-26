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
import dislike from './dislike'
import longAudio from './longAudio'
import upload from './upload'

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
  dislike,
  // 长音频（有声书 / 节目）的**专辑**浏览与搜索；单集与播放复用 album（见 longAudio.js 文件头）
  longAudio,
  // 图片直传 COS（目前只服务「建云端歌单带自定义封面」；链路与实测见 upload.js 文件头）
  upload,

  getMusicUrl(songInfo, type) {
    return apis('tx').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    // let singer = songInfo.singer.indexOf('、') > -1 ? songInfo.singer.split('、')[0] : songInfo.singer
    return lyric.getLyric(songInfo)
  },
  /**
   * 歌词词典（整首词条表；「点哪个词」由渲染侧本地匹配，见 `lyric.js` 的 `matchDictEntries`）。
   * 放在统一入口上（而不是让视图 deep import `tx/lyric.js`），与其它能力的取数口保持一致。
   */
  getLyricDict(songInfo) {
    return lyric.getLyricDict(songInfo)
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
