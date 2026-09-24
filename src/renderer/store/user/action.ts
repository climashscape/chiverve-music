import { markRawList } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'
import {
  cloudListSongs, createdLists, favAlbumIds, favAlbums, favLists, favPlaylistIds, favSongIds, favSongIdsLoaded, favSongs, followSingers, isInited, isLoading, labels,
  musicGene, pagers, CLOUD_LIST_PAGE_SIZE, PAGE_SIZE, profile, vip, type PlaylistCard,
} from './state'

/**
 * 账号中心（我的音乐，M4）的取数逻辑。
 *
 * 三个约定：
 *   1. 账号接口是**弱依赖**——失败只写 `noItemLabel` 文案（§2.11 三段式），不抛给视图，
 *      否则一个接口挂掉会让整页白屏。
 *   2. 列表写回用 `splice(0, len, ...)`（保持 shallowReactive 数组引用不变），
 *      歌曲列表额外过 `markRawList` 防深度代理。
 *   3. 未登录时不发请求：`getUser` 会抛错，这里统一落"请先登录 QQ 音乐"文案。
 */

const t = (key: string) => window.i18n.t(key as any)

const setList = (target: any[], list: any[], raw = false) => {
  const next = raw ? markRawList(list) : list
  target.splice(0, target.length, ...next)
}

const appendList = (target: any[], list: any[]) => {
  target.push(...markRawList(list))
}

/**
 * 歌曲列表写回：`tx/user.js` 给的是**老式歌曲对象**（musicSdk 内部形状），而 UI/store 用的是
 * 新式（平台字段进 `meta`，列表组件会读 `meta._qualitys`）——中间必须过 `toNewMusicInfo`
 * （写法对齐 store/leaderboard/action.ts:57）。
 *
 * 并且**原地**替换内容（splice），不能整体赋值：在线列表组件的双击播放（`OnlineList/usePlay`）
 * 捕获的是数组引用，整体赋值会让它后续播到 undefined。
 */
const toOnlineList = (list: any[]): LX.Music.MusicInfoOnline[] =>
  markRawList(deduplicationList(list.map(item => toNewMusicInfo(item)) as LX.Music.MusicInfoOnline[]))

const setSongs = (target: LX.Music.MusicInfoOnline[], list: any[]) => {
  target.splice(0, target.length, ...toOnlineList(list))
}

const appendSongs = (target: LX.Music.MusicInfoOnline[], list: any[]) => {
  target.push(...toOnlineList(list))
}

/** 统一收口：loading → 取数 → 成功清文案 / 失败落失败文案（不抛）。 */
const load = async(key: keyof typeof labels, task: () => Promise<void>) => {
  labels[key] = t('list__loading')
  try {
    await task()
    labels[key] = ''
  } catch (err: any) {
    console.log('[user]', key, err)
    labels[key] = err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')
  }
}

const user = () => music.tx.user

/** 首屏：主页概览 + 各列表。已初始化过就直接返回（视图切回来不必重拉）。 */
export const initUserCenter = async(force = false): Promise<void> => {
  if (isLoading.value) return
  if (isInited.value && !force) return
  isLoading.value = true
  await Promise.all([
    load('profile', async() => {
      Object.assign(profile, await user().getHomepage())
    }),
    load('musicGene', async() => {
      Object.assign(musicGene, await user().getMusicGene())
    }),
    load('favSongs', async() => {
      const res = await user().getFavSong(1, favSongs.limit)
      setSongs(favSongs.list, res.list)
      favSongs.total = res.total
      favSongs.page = 1
    }),
    load('createdLists', async() => {
      const res = await user().getCreatedSonglist()
      setList(createdLists, res.list as any)
    }),
    load('favLists', async() => {
      const res = await user().getFavSonglist(1, PAGE_SIZE)
      setList(favLists, res.list as any)
      pagers.favLists = { page: 1, hasMore: res.hasMore === true }
    }),
    load('favAlbums', async() => {
      const res = await user().getFavAlbum(1, PAGE_SIZE)
      setList(favAlbums, res.list as any)
      pagers.favAlbums = { page: 1, hasMore: res.hasMore === true }
    }),
    load('followSingers', async() => {
      const res = await user().getFollowSingers(1, PAGE_SIZE)
      setList(followSingers, res.list as any)
      pagers.followSingers = { page: 1, hasMore: res.hasMore === true }
    }),
  ])
  // VIP 单独拉：失败不影响其它区块
  try {
    Object.assign(vip, await user().getVipInfo())
  } catch (err) {
    console.log('[user] vip', err)
  }
  isLoading.value = false
  isInited.value = true
}

/** 我喜欢 —— 加载更多（追加）。 */
export const loadMoreFavSongs = async(): Promise<void> => {
  if (favSongs.list.length >= favSongs.total) return
  labels.favSongs = t('list__loading')
  try {
    const next = favSongs.page + 1
    const res = await user().getFavSong(next, favSongs.limit)
    appendSongs(favSongs.list, res.list)
    favSongs.page = next
    favSongs.total = res.total
    labels.favSongs = ''
  } catch (err) {
    console.log('[user] more favSongs', err)
    labels.favSongs = t('list__load_failed')
  }
}

/**
 * 我喜欢 —— 拉第一页并覆盖。
 *
 * 与 `initUserCenter` 里那份的区别：那个被 `isInited` 挡着、一个会话只跑一次；
 * 这个要能**重复调用**（「我的收藏」页每次进入都自动加载一次 QQ 的我喜欢，见需求 1），
 * 以及写入云端后用来把新歌刷出来。失败只落文案（与其它账号接口同一档，§2.11）。
 */
export const loadFavSongs = async(): Promise<void> => {
  labels.favSongs = t('list__loading')
  try {
    const res = await user().getFavSong(1, favSongs.limit)
    setSongs(favSongs.list, res.list)
    favSongs.total = res.total
    favSongs.page = 1
    labels.favSongs = ''
  } catch (err: any) {
    console.log('[user] favSongs', err)
    labels.favSongs = err?.message === 'QQ 音乐未登录' ? t('user_center__need_login') : t('list__load_failed')
  }
}

/**
 * 我喜欢 —— **写入云端**（QQ 的 dirId=201 目录）。
 *
 * 与上面那批只读接口不同，写操作**失败必须抛给调用方**（由弹窗用 `dialog` 明确报错，
 * §2.11）——收藏这种用户主动发起的动作，静默失败会让人以为已经加进去了。
 * 这条路径（dirId=201 的写）尚未真机验证过（见 tx/songList.js 的 likeSong 注释）。
 *
 * @param musicInfo 新式在线歌曲对象；QQ 的 songId/songType 在 `meta.id` / `meta.songType`
 *   （见 common/utils/tools.ts 的 toNewMusicInfo）。
 */
export const addFavSongToCloud = async(musicInfo: LX.Music.MusicInfoOnline): Promise<void> => {
  const songId = Number(musicInfo?.meta?.id ?? 0)
  if (!songId) throw new Error(t('list_add__cloud_no_song_id'))
  const ok = await music.tx.songList.likeSong([
    { songId, songType: Number(musicInfo.meta.songType ?? 0) },
  ])
  if (!ok) throw new Error(t('list_add__cloud_failed'))
  // 收藏态集合已加载过就地补上：不补的话这次收藏要等下次重拉才认，
  // 那之前各处按钮仍显示「没收藏」（点第二次又走一遍收藏）
  if (favSongIdsLoaded.value && !favSongIds.includes(String(songId))) favSongIds.unshift(String(songId))
  // 列表已经加载过才刷新（没加载过的话，进「我的收藏」页时自然会是最新的，不必多打一次请求）
  if (favSongs.total > 0) await loadFavSongs()
}

/** 取消喜欢：从 QQ「我喜欢」移除。失败抛错，由调用方提示。 */
export const removeFavSongFromCloud = async(musicInfo: LX.Music.MusicInfoOnline): Promise<void> => {
  const songId = Number(musicInfo?.meta?.id ?? 0)
  if (!songId) throw new Error(t('list_add__cloud_no_song_id'))
  const ok = await music.tx.songList.unlikeSong([
    { songId, songType: Number(musicInfo.meta.songType ?? 0) },
  ])
  if (!ok) throw new Error(t('list_unlove__failed'))
  if (favSongIdsLoaded.value) {
    const index = favSongIds.indexOf(String(songId))
    if (index > -1) favSongIds.splice(index, 1)
  }
  if (favSongs.total > 0) await loadFavSongs()
}

// ── 收藏态（「这一首喜欢了没」）────────────────────────────────────────────
// 本地收藏取消后（2026-09-24），各处的收藏按钮只能问云端。读接口没有按 id 单查的形态，
// 所以照 favAlbumIds / favPlaylistIds 的做法（工单 08）拉一份全量 id 集合缓存住。

/** 拉我喜欢的全量 id 集合（已加载过直接返回，`force` 重拉）。失败抛给调用方。 */
export const loadFavSongIds = async(force = false): Promise<void> => {
  if (favSongIdsLoaded.value && !force) return
  setList(favSongIds, await user().getFavSongIds())
  favSongIdsLoaded.value = true
}

/** 这一首在 QQ「我喜欢」里吗（先 `loadFavSongIds` 才有准确答案）。 */
export const isFavSongInCloud = (musicInfo: LX.Music.MusicInfoOnline | null | undefined): boolean => {
  const id = String(musicInfo?.meta?.id ?? '')
  return !!id && favSongIds.includes(id)
}

/**
 * 收藏类写操作的失败文案：写接口抛的是内部串 `QQ 音乐未登录`（`requireCredential`），
 * 界面上要说人话；其它错误原样透出，兜底用 `list_add__cloud_failed`。
 * 四个入口（收藏弹窗 / 雷达 / 快捷键与托盘 / 任务栏）共用，别各写一份。
 */
export const favErrorText = (err: any): string =>
  err?.message == 'QQ 音乐未登录' ? t('user_center__need_login') : (err?.message || t('list_add__cloud_failed'))

export const loadMoreFavLists = async(): Promise<void> => {
  if (!pagers.favLists.hasMore) return
  const next = pagers.favLists.page + 1
  const res = await user().getFavSonglist(next, PAGE_SIZE)
  appendList(favLists, res.list as any)
  pagers.favLists = { page: next, hasMore: res.hasMore === true }
}

export const loadMoreFavAlbums = async(): Promise<void> => {
  if (!pagers.favAlbums.hasMore) return
  const next = pagers.favAlbums.page + 1
  const res = await user().getFavAlbum(next, PAGE_SIZE)
  appendList(favAlbums, res.list as any)
  pagers.favAlbums = { page: next, hasMore: res.hasMore === true }
}

export const loadMoreFollowSingers = async(): Promise<void> => {
  if (!pagers.followSingers.hasMore) return
  const next = pagers.followSingers.page + 1
  const res = await user().getFollowSingers(next, PAGE_SIZE)
  appendList(followSingers, res.list as any)
  pagers.followSingers = { page: next, hasMore: res.hasMore === true }
}

// ── 云端自建歌单的读与写（工单 06）─────────────────────────────────────────
// 读走 `songList.getListDetailByCgi`（disstid = tid、dirid = 0，dir 型歌单也能读，
// 见 `tx/songList.js` 的注释）；写走 `createList / removeList / addSongToList / removeSongFromList`。
// 写操作**失败必须抛给调用方**（用户主动发起的动作，静默失败会让人以为已经生效）。

/** 重新拉云端自建歌单列表（建/删歌单之后刷新）。 */
export const refreshCreatedLists = async(): Promise<void> => {
  const res = await user().getCreatedSonglist()
  setList(createdLists, res.list as any)
}

/**
 * 读某个云端歌单的歌曲。
 * @param id 歌单的 tid（`createdLists` 里卡片的 `id` 就是它）
 * @param more true = 追加下一页
 */
export const loadCloudListSongs = async(id: string, page = 1, more = false): Promise<void> => {
  cloudListSongs.noItemLabel = more ? cloudListSongs.noItemLabel : t('list__loading')
  if (!more) cloudListSongs.listTid = id
  try {
    const res = await music.tx.songList.getListDetailByCgi(id, page, CLOUD_LIST_PAGE_SIZE)
    // 迟到的响应丢掉：期间用户可能已经切到别的歌单
    if (cloudListSongs.listTid !== id) return
    const list = toOnlineList(res.list ?? [])
    if (more) cloudListSongs.list.push(...list)
    else cloudListSongs.list.splice(0, cloudListSongs.list.length, ...list)
    cloudListSongs.total = Number(res.total ?? cloudListSongs.list.length)
    cloudListSongs.page = page
    cloudListSongs.noItemLabel = cloudListSongs.list.length ? '' : t('no_item')
  } catch (err: any) {
    if (cloudListSongs.listTid !== id) return
    console.log('[user] cloudListSongs', err)
    if (!more) cloudListSongs.list.splice(0, cloudListSongs.list.length)
    cloudListSongs.total = more ? cloudListSongs.total : 0
    cloudListSongs.noItemLabel = err?.message === 'QQ 音乐未登录'
      ? t('user_center__need_login')
      // 空歌单不是失败：新建出来的歌单服务端会抛「歌单为空或不可读」，
      // 真机上它被显示成一句像报错的话（实测），这里落空态
      : (err?.message === '歌单为空或不可读'
          ? t('no_item')
          : (more ? t('list__load_failed') : (err?.message || t('list__load_failed'))))
  }
}

/** 新建云端歌单（返回服务端给的 dirId/tid）。 */
export const createCloudList = async(name: string): Promise<{ dirId: number, tid: number }> => {
  const res = await music.tx.songList.createList(name)
  await refreshCreatedLists()
  return res
}

/** 删除云端歌单（传卡片：dirId 给接口，id=tid 用于比对当前正在看的歌单）。 */
export const removeCloudList = async(card: PlaylistCard): Promise<void> => {
  const ok = await music.tx.songList.removeList(Number(card.dirId))
  if (!ok) throw new Error(t('playlists__cloud_remove_failed'))
  // 当前正在看这个歌单的话，把歌曲也清掉（避免停在已删歌单的内容上）
  if (String(card.id) === cloudListSongs.listTid) {
    cloudListSongs.listTid = ''
    cloudListSongs.list.splice(0, cloudListSongs.list.length)
    cloudListSongs.total = 0
  }
  await refreshCreatedLists()
}

/** 新式歌曲对象 → 写接口要的 `{ songId, songType }`（songId 在 `meta.id`，见 tools.ts 的映射）。 */
const toWriteSongs = (list: LX.Music.MusicInfoOnline[]) => list.map(m => {
  const songId = Number(m?.meta?.id ?? 0)
  if (!songId) throw new Error(t('list_add__cloud_no_song_id'))
  return { songId, songType: Number(m.meta.songType ?? 0) }
})

/** 往云端歌单加歌（多首）。`card` 是 `createdLists` 里的卡片（dirId 写、id=tid 写）。 */
export const addSongsToCloudList = async(card: PlaylistCard, songs: LX.Music.MusicInfoOnline[]): Promise<void> => {
  const ok = await music.tx.songList.addSongToList(Number(card.dirId), toWriteSongs(songs), Number(card.id))
  if (!ok) throw new Error(t('playlists__cloud_add_failed'))
  // 正在看这个歌单就刷新一下，让新歌立刻出现
  if (String(card.id) === cloudListSongs.listTid) await loadCloudListSongs(String(card.id), 1, false)
}

/** 从云端歌单删歌（多首）。 */
export const removeSongsFromCloudList = async(card: PlaylistCard, songs: LX.Music.MusicInfoOnline[]): Promise<void> => {
  const ok = await music.tx.songList.removeSongFromList(Number(card.dirId), toWriteSongs(songs), Number(card.id))
  if (!ok) throw new Error(t('playlists__cloud_remove_song_failed'))
  if (String(card.id) === cloudListSongs.listTid) await loadCloudListSongs(String(card.id), 1, false)
}

// ── 收藏 / 取消收藏（专辑 · 歌单，工单 08）─────────────────────────────────
// 两个读接口没有单条查询，所以「收了没」靠**收藏全量 id 集合**在本地比对（拉一次缓存住）。
// 写操作**失败必须抛给调用方**：收藏是用户主动动作，静默失败会让人以为已经生效。

/** 收藏的全量专辑 mid（`force` 时重拉）。 */
export const loadFavAlbumIds = async(force = false): Promise<void> => {
  if (favAlbumIds.length && !force) return
  const ids = await user().getFavAlbumIds()
  setList(favAlbumIds, ids)
}

/** 收藏的全量歌单 tid。 */
export const loadFavSonglistIds = async(force = false): Promise<void> => {
  if (favPlaylistIds.length && !force) return
  const ids = await user().getFavSonglistIds()
  setList(favPlaylistIds, ids)
}

/**
 * 收藏 / 取消收藏专辑。
 * @param album 专辑页拿到的详情（要 `id` 数字 id 与 `mid`）
 */
export const setAlbumFav = async(album: { id: string, mid: string }, fav: boolean): Promise<void> => {
  const ok = await music.tx.album.setFavAlbum(album.id, fav)
  if (!ok) throw new Error(fav ? t('fav__add_failed') : t('fav__cancel_failed'))
  // 本地集合与列表都跟着改，按钮状态立刻正确（`user_center` 的收藏专辑列表若已加载也一并刷新）
  const ids = favAlbumIds.slice()
  const index = ids.indexOf(album.mid)
  if (fav && index < 0) ids.unshift(album.mid)
  if (!fav && index > -1) ids.splice(index, 1)
  setList(favAlbumIds, ids)
  if (favAlbums.length) void reloadFavAlbums()
}

/** 收藏 / 取消收藏歌单（入参是歌单的 tid）。 */
export const setPlaylistFav = async(tid: string, fav: boolean): Promise<void> => {
  const ok = await music.tx.songList.setFavPlaylist(tid, fav)
  if (!ok) throw new Error(fav ? t('fav__add_failed') : t('fav__cancel_failed'))
  const ids = favPlaylistIds.slice()
  const index = ids.indexOf(String(tid))
  if (fav && index < 0) ids.unshift(String(tid))
  if (!fav && index > -1) ids.splice(index, 1)
  setList(favPlaylistIds, ids)
  if (favLists.length) void reloadFavLists()
}

/** 重新拉收藏专辑列表第一页（写操作后让「我的收藏」页跟着变）。 */
const reloadFavAlbums = async(): Promise<void> => {
  try {
    const res = await user().getFavAlbum(1, PAGE_SIZE)
    setList(favAlbums, res.list as any)
    pagers.favAlbums = { page: 1, hasMore: res.hasMore === true }
  } catch (err) {
    console.log('[user] reload favAlbums', err)
  }
}

/** 重新拉收藏歌单列表第一页。 */
const reloadFavLists = async(): Promise<void> => {
  try {
    const res = await user().getFavSonglist(1, PAGE_SIZE)
    setList(favLists, res.list as any)
    pagers.favLists = { page: 1, hasMore: res.hasMore === true }
  } catch (err) {
    console.log('[user] reload favLists', err)
  }
}
