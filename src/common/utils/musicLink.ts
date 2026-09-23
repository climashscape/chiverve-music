/**
 * 歌曲跳转能力的共用判定与歌手解析（ui-polish 工单 02）。
 *
 * 「点歌手名进歌手页、点专辑名进专辑页」这件事在多个界面都要成立（在线歌曲表 / 本地列表歌曲表 /
 * 播放详情页 / 歌曲详情页 / MV 弹窗），判定与取数只能有一份，所以放在主/渲共用层。
 *
 * 三条别改回去的事实：
 * 1. 新式歌曲对象里 **`meta.songId` 存的才是 songmid**（`tools.ts:5` 的 toNewMusicInfo 映射），
 *    `meta.id` 是数字 songId；**本地源没有 mid**（本地对象的 `meta.songId` 是文件路径），所以判定要排除 local。
 * 2. **歌手 mid 不在歌曲对象里**：上游 `createSong` 把 `singer[]` 拍平成展示用字符串。
 *    要 mid 只能按需取歌曲详情（它的 `track_info.singer[]` 每位都带 mid 与 name）。
 * 3. 专辑 mid 在 `meta.albumMid` 上，**不需要请求**。
 */
export interface JumpSinger {
  mid: string
  name: string
}

/** 歌曲的 songmid（本地源返回空串——本地文件没有在线 mid） */
export const getSongMid = (minfo: LX.Music.MusicInfo | null | undefined): string => {
  if (!minfo || minfo.source == 'local') return ''
  const mid = (minfo.meta as Record<string, any> | undefined)?.songId
  return mid == null ? '' : String(mid)
}

/** 歌曲所属专辑的 albumMid（本地源返回空串） */
export const getAlbumMid = (minfo: LX.Music.MusicInfo | null | undefined): string => {
  if (!minfo || minfo.source == 'local') return ''
  const mid = (minfo.meta as Record<string, any> | undefined)?.albumMid
  return mid == null ? '' : String(mid)
}

export const canJumpToSinger = (minfo: LX.Music.MusicInfo | null | undefined): boolean => !!getSongMid(minfo)
export const canJumpToAlbum = (minfo: LX.Music.MusicInfo | null | undefined): boolean => !!getAlbumMid(minfo)
/** 复制链接 / 在 QQ 音乐打开：都要在线 mid */
export const canShareMusic = (minfo: LX.Music.MusicInfo | null | undefined): boolean => !!getSongMid(minfo)

/** 详情接口回来的 `singer[]` 形状不保证（可能有空项），统一成 `{mid, name}` 并丢掉没有 mid 的 */
export const normalizeSingers = (singers: any): JumpSinger[] => {
  if (!Array.isArray(singers)) return []
  return singers
    .map(singer => ({
      mid: singer?.mid == null ? '' : String(singer.mid),
      name: singer?.name == null ? '' : String(singer.name),
    }))
    .filter(singer => singer.mid)
}

// 同一位歌手的 mid 在一次会话里不会变，缓存住；失败不留缓存（网络恢复后用户再点一次就能成功）
const singerCache = new Map<string, Promise<JumpSinger[]>>()

/**
 * 取这首歌的歌手列表（每位带 mid 与 name）。
 *
 * `fetchSingers` 由调用方注入（渲染侧注入 `musicSdk.tx.songDetail.getDetail` 的适配器）——
 * 这样这个模块是纯的、能在 node 环境单测，不必把请求层拖进来。
 *
 * 约定：**取不到时返回空数组、不抛异常**（调用方据此提示「没能拿到歌手信息」而不是静默或跳错人）。
 */
export const resolveSingers = async(
  minfo: LX.Music.MusicInfo | null | undefined,
  fetchSingers: (mid: string, minfo: LX.Music.MusicInfo) => Promise<any>,
): Promise<JumpSinger[]> => {
  if (!minfo) return []

  // 对象里已经带了歌手 mid 就直接用（当前没有源这么写，留这条路径：将来加源时可省一次请求）
  const inline = (minfo.meta as Record<string, any> | undefined)?.singers
  if (Array.isArray(inline) && inline.some(singer => singer?.mid != null)) return normalizeSingers(inline)

  const mid = getSongMid(minfo)
  if (!mid) return []

  let task = singerCache.get(mid)
  if (!task) {
    task = (async() => {
      try {
        return normalizeSingers(await fetchSingers(mid, minfo))
      } catch (err) {
        console.log('resolve singers failed', err)
        return []
      }
    })()
    singerCache.set(mid, task)
  }
  const singers = await task
  if (!singers.length) singerCache.delete(mid)
  return singers
}

/** 仅供测试：清掉歌手缓存 */
export const clearSingerCache = () => { singerCache.clear() }
