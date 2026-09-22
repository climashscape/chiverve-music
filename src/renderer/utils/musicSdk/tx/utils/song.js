// ⚠️ 相对路径按本文件位置算：`tx/utils/` 到 `renderer/utils/` 要走三层，
// 写成 `../../index` 会解析到 `musicSdk/index.js`（那里只有 default 导出），
// 拿到的会是 undefined —— webpack 只给 warning，运行期才抛错。
import { formatPlayTime, sizeFormate } from '../../../index'
import { formatSingerName } from '../../utils'

/**
 * QQ 音乐歌曲对象工厂。
 *
 * 老式歌曲对象（musicSdk 内部流通的那种平铺字段结构，见 AGENTS.md §2.6）原本在
 * `musicSearch` / `leaderboard` / `songList` / `musicInfo` / `singer` 五处各抄一遍，
 * 改一个字段要五处同步——这里收敛成一份。**新增取歌曲的接口时直接用 `createSong`**，
 * 不要再手写字段映射。
 *
 * 两个易错点（原五份实现互相不一致，这里统一）：
 *   1. `albumId` 必须是专辑 **mid**（`album.mid`），不是数字 `album.id`——
 *      tx 的封面 URL（`tx/index.js` 的 `getPic`）是拿 `albumId` 拼的，填数字会 404。
 *   2. 图片优先用专辑封面，专辑缺失（单曲）时退回歌手头像；判空看 album mid，
 *      别用专辑名（名称为「空」时也取不到封面）。
 */

/** QQ 的 file 字段 → 可用音质档位（非加密枚举，见 spec §4.7）。顺序即 UI 展示顺序。 */
const QUALITY_SIZE_KEYS = [
  ['128k', 'size_128mp3'],
  ['320k', 'size_320mp3'],
  ['flac', 'size_flac'],
  ['flac24bit', 'size_hires'],
]

const buildQualitys = file => {
  const types = []
  const _types = {}
  for (const [type, key] of QUALITY_SIZE_KEYS) {
    const size = file?.[key]
    if (size == null || size === 0) continue
    const formatted = sizeFormate(size)
    types.push({ type, size: formatted })
    _types[type] = { size: formatted }
  }
  return { types, _types }
}

const buildImg = (item, albumMid) => {
  if (albumMid && albumMid !== '空') return `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
  return item.singer?.length
    ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg`
    : ''
}

/**
 * @param {object} item QQ 返回的歌曲原始对象（搜索 / 榜单 / 歌单 / 歌手页 / 收藏通用）
 * @returns {object} musicSdk 内部流通的老式歌曲对象
 */
export const createSong = item => {
  const albumMid = item.album?.mid ?? ''
  const { types, _types } = buildQualitys(item.file)
  return {
    singer: formatSingerName(item.singer, 'name'),
    name: item.title,
    albumName: item.album?.name ?? '',
    albumId: albumMid,
    source: 'tx',
    // interval 在上游有的接口给秒数、有的不给；拿不到就留 null（列表里显示 '-'）
    interval: item.interval ? formatPlayTime(item.interval) : null,
    songId: item.id,
    // QQ 的原始 type（0 = 普通单曲）。歌单增删歌曲的写接口（PlaylistDetailWrite）要它，
    // 见 tx/songList.js 的 addSongToList/removeSongFromList。
    songType: item.type ?? 0,
    albumMid,
    strMediaMid: item.file?.media_mid ?? '',
    songmid: item.mid,
    img: buildImg(item, albumMid),
    lrc: null,
    otherSource: null,
    types,
    _types,
    typeUrl: {},
  }
}

export default createSong
