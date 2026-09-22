import { markRawList } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'
import {
  createdLists, favAlbums, favLists, favSongs, followSingers, isInited, isLoading, labels, musicGene, pagers, PAGE_SIZE, profile, vip,
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
