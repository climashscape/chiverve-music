import { txCgi, buildComm, requireCredential } from './utils/request'
import { createSong } from './utils/song'

/**
 * 歌曲详情与关联能力（工单 09）。
 *
 * 五个端点在 2026-09-23 用本仓的请求形状（comm + loginUin 字符串）逐个实测 `code = 0`，
 * 字段名照响应抄（不猜），记录在 `docs/agents/qq-music-native.md` §5.10：
 *
 *   1. 歌曲详情 `music.pf_song_detail_svr/get_song_detail_yqq`：`song_mid` 与 `song_id` 都收
 *   2. 相似歌曲 `music.recommend.TrackRelationServer/GetSimilarSongs`：`{ songid, songtype }` → `vecSong[].track`（标准歌曲对象）
 *   3. 相关歌单 `music.recommend.TrackRelationServer/GetRelatedPlaylist`：同上 → `vecPlaylist[]`
 *   4. 相关 MV `MvService.MvInfoProServer/GetSongRelatedMv`：
 *      ⚠️ `songid` 必须**字符串**、`songtype` 必须 **1**——用数字 songid + songtype 0 会得到
 *      `code=0` 但 `list` 恒空（看着像「这首歌没有 MV」，其实是参数错，本轮踩过一次）
 *   5. 其他版本 `music.musichallSong.OtherVersionServer/GetOtherVersionSongs`：
 *      `{ songmid, songtype }` → `versionList[]`（标准歌曲对象，直接喂 createSong）
 *
 * 关联能力的入参是**数字 songId + songType**（详情接口的 `track_info.id` / `.type` 就是它们）。
 */

const webComm = credential => buildComm(credential)

/** 简介等字段带 `\n` 与 HTML 残留，清一下（详情页只做纯文本展示）。 */
const cleanText = value => String(value ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()

export default {
  /**
   * 歌曲详情。入参一律是 **songmid**（新式歌曲对象里叫 `meta.songId`，见 tools.ts 的映射，
   * 别拿 `meta.id` 当 mid——那是数字 id）。返回 `{ track, trackRaw, info, desc, extras }`：
   * track 是老式歌曲对象，info 是发行公司/流派/时间/语言。
   */
  async getDetail(mid) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      // 两种参数端点都收（实测），这里固定用 song_mid：调用方手里只有 mid，且 mid 可能全是数字
      // （形状像 song_id，用推断会传错）
      param: { song_mid: String(mid), song_type: 0 },
    }, webComm(credential)).promise
    const d = data?.data ?? {}
    const track = d.track_info
    if (!track) throw new Error('歌曲详情为空')
    const pick = key => cleanText(d.info?.[key]?.content?.map(item => item.value).filter(Boolean).join('、'))
    return {
      track: createSong(track),
      trackRaw: track,
      info: {
        company: pick('company'),
        genre: pick('genre'),
        lan: pick('lan'),
        pubTime: pick('pub_time'),
      },
      desc: cleanText(d.info?.intro?.content?.map(item => item.value).join('\n')),
      extras: {
        name: cleanText(d.extras?.name),
        transName: cleanText(d.extras?.transname),
        wikiUrl: d.extras?.wikiurl ?? '',
      },
    }
  },

  /** 相似歌曲：`vecSong[].track` 是标准歌曲对象。 */
  async getSimilarSongs(songId, songType = 0) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.recommend.TrackRelationServer',
      method: 'GetSimilarSongs',
      param: { songid: Number(songId), songtype: Number(songType) },
    }, webComm(credential)).promise
    return (data?.data?.vecSong ?? [])
      .map(item => item?.track)
      .filter(Boolean)
      .map(createSong)
  },

  /** 相关歌单（他人歌单，跳本仓的歌单详情页）。 */
  async getRelatedPlaylists(songId, songType = 0) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.recommend.TrackRelationServer',
      method: 'GetRelatedPlaylist',
      param: { songid: Number(songId), songtype: Number(songType) },
    }, webComm(credential)).promise
    return (data?.data?.vecPlaylist ?? []).map(item => ({
      id: String(item.tid ?? ''),
      name: cleanText(item.title),
      img: item.cover ?? '',
      author: cleanText(item.creator),
      total: Number(item.songNum ?? 0),
      playCount: item.playCnt ?? '',
      source: 'tx',
    }))
  },

  /** 相关 MV（字段就这几个：mvid/picurl/playcnt/singers/title/vid）。 */
  async getRelatedMv(songId) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'MvService.MvInfoProServer',
      method: 'GetSongRelatedMv',
      // ⚠️ songid 字符串 + songtype 1，别改成数字/0（见文件头第 4 条）
      param: { songid: String(songId), songtype: 1, lastmvid: 0 },
    }, webComm(credential)).promise
    return (data?.data?.list ?? []).map(item => ({
      id: String(item.vid ?? item.mvid ?? ''),
      vid: String(item.vid ?? ''),
      name: cleanText(item.title),
      img: item.picurl ?? '',
      singer: (item.singers ?? []).map(s => cleanText(s.name)).join('、'),
      playCount: Number(item.playcnt ?? 0),
      interval: null,
      duration: 0,
      source: 'tx',
    }))
  },

  /** 其他版本：`versionList[]` 是标准歌曲对象。 */
  async getOtherVersions(songMid, songType = 0) {
    const credential = await requireCredential()
    const data = await txCgi({
      module: 'music.musichallSong.OtherVersionServer',
      method: 'GetOtherVersionSongs',
      param: { songmid: songMid, songtype: Number(songType) },
    }, webComm(credential)).promise
    return (data?.data?.versionList ?? []).filter(Boolean).map(createSong)
  },
}
