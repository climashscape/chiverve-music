import {
  queryMusicUrl,
  insertMusicUrl,
  deleteMusicUrl,
  clearMusicUrl,
  countMusicUrl,
  queryMusicUrlCacheRows,
} from './dbHelper'
import { MUSIC_URL_RECYCLE_BATCH_SIZE, selectMusicUrlRecycle } from './recycle'


/**
 * 获取歌曲url
 * @param id 歌曲id
 * @returns 歌曲url
 */
export const getMusicUrl = (id: string): string | null => {
  const url = queryMusicUrl(id)
  return url
}

/**
 * 保存歌曲url
 * @param urlInfos url信息
 */
export const musicUrlSave = (urlInfos: LX.Music.MusicUrlInfo[]) => {
  insertMusicUrl(urlInfos)
}

/**
 * 删除歌曲url（按 id 精确删，只删给到的这些行）
 *
 * 两个调用者：
 * 1. **回收**（本文件 `musicUrlRecycle`，分批删过期 / 超限的行）；
 * 2. **单条失效**（渲染侧刷新取流前先删旧行：`renderer/core/music/online.ts`，走 `remove_music_url` 通道）——
 *    先删再取，取流失败时表里不会留一条已知打不开的 URL 被下次命中。
 * @param ids 歌曲id（缓存 key，形如 `${歌曲id}_${音质}`）
 */
export const musicUrlRemove = (ids: string[]) => {
  deleteMusicUrl(ids)
}

/**
 * 清空歌曲url
 */
export const musicUrlClear = () => {
  clearMusicUrl()
}

/**
 * 统计歌曲url数量
 */
export const musicUrlCount = () => {
  return countMusicUrl()
}

/**
 * 按保留天数 / 容量上限回收歌曲url缓存（设置页重构票 08）。
 *
 * 只删 `music_url` 表里过期 / 超限的缓存行，别的一概不碰（口径与「0 = 不自动清」的约定见 `recycle.ts`）。
 * 删行不影响正在播放的音频：播放器手里是取流时拿到的 URL 字符串，表只是缓存。
 *
 * 两个阈值都是 0（默认）时**不读库直接返回** `skipped`：默认配置下这个调用是零开销，
 * 行为与改造前完全一致（缓存只增不减）。
 *
 * @param options 回收策略（两个阈值 + 正在播放那首歌的缓存 key 前缀 `keepIdPrefix`）
 * @returns 回收结果（删了几条、删前删后的近似占用；`skipped` 时占用为 `null`）
 */
export const musicUrlRecycle = (options: LX.Music.MusicUrlRecycleOptions): LX.Music.MusicUrlRecycleResult => {
  if (!(options.keepDays > 0) && !(options.maxSizeMB > 0)) {
    return { deleted: 0, bytesBefore: null, bytesAfter: null, skipped: true }
  }

  const { ids, bytesBefore, bytesAfter } = selectMusicUrlRecycle(queryMusicUrlCacheRows(), options)
  // 分批删：每批一次事务（`deleteMusicUrl` 内部已包事务），别让一条大语句把 worker 的消息循环占太久
  for (let index = 0; index < ids.length; index += MUSIC_URL_RECYCLE_BATCH_SIZE) {
    deleteMusicUrl(ids.slice(index, index + MUSIC_URL_RECYCLE_BATCH_SIZE))
  }

  return { deleted: ids.length, bytesBefore, bytesAfter, skipped: false }
}
