import { log } from '@common/utils'
import { getMusicUrl as getWyMusicUrl, searchMusic, type WySongInfo } from './api'
import { pickStrictMatches } from './match'

/**
 * 「主源取不到流时，静默用网易云的同一首歌顶替」的编排层。
 *
 * ## 为什么不是一个「音乐源」
 *
 * 这个功能**不注册**进 `musicSdk` 的源清单（`musicSdk/index.js` 是唯一源清单）：注册了意味着
 * 网易云会出现在搜索、榜单、换源、跨源匹配里，还要动 `LX.OnlineSource` 类型与四份 i18n——
 * 那是「加一个源」，与用户要的「悄悄顶一段播放」不是一件事。这里只借它一条取流，界面上一切照旧：
 * 歌曲对象不变（来源标签、歌词、封面仍来自 QQ），变的只有喂给播放器的那个 URL。
 *
 * ## 拿不到就返回 null
 *
 * 所有失败（搜不到、匹配不上、VIP/下架、网络抖动）都收敛成 `null`，调用方据此**抛原错误**，
 * 于是上层照旧提示 / 登记失效曲——「有没有这个兜底」对原有失败路径是透明的。
 *
 * 匹配策略（严格、宁可不播）见 `./match.ts`；匿名只覆盖非 VIP 曲目见 `./api.ts`。
 */

/** 会话内缓存上限：超了整表清空（同 `core/music/utils.ts` 的 otherSourceCache 做法） */
const MATCH_CACHE_MAX = 50

/** `tx_<songmid>` → 严格匹配到的候选（按搜索顺序） */
const matchCache = new Map<string, WySongInfo[]>()
/** 同一首歌的并行兜底合并成一次搜索（预加载与播放会同时问到同一首） */
const inflight = new Map<string, Promise<WySongInfo[]>>()

/** 网易云兜底只取 128k（匿名能拿到的那一档）——上报给 URL 缓存时必须如实（§2.6 硬约束 2） */
export const WY_FALLBACK_QUALITY: LX.Quality = '128k'

const songKeyOf = (musicInfo: LX.Music.MusicInfoOnline): string => `${musicInfo.source}_${musicInfo.id}`

const findCandidates = async(musicInfo: LX.Music.MusicInfoOnline, key: string): Promise<WySongInfo[]> => {
  const cached = matchCache.get(key)
  if (cached) return cached

  let pending = inflight.get(key)
  if (!pending) {
    pending = searchMusic(`${musicInfo.name} ${musicInfo.singer || ''}`.trim())
      .then(songs => pickStrictMatches({
        name: musicInfo.name,
        singer: musicInfo.singer,
        // `interval` 在类型上是 `string | null`，匹配层只认 `string | undefined`
        interval: musicInfo.interval ?? undefined,
      }, songs))
      .finally(() => { inflight.delete(key) })
    inflight.set(key, pending)
  }
  const candidates = await pending

  // 空结果也缓存：同一首歌反复失败是常态（VIP / 独家），不缓存等于每次重试都多打一次搜索
  if (matchCache.size > MATCH_CACHE_MAX) matchCache.clear()
  matchCache.set(key, candidates)
  // 走 electron-log（写 `<userData>/logs/main.log`）：真机验证「有没有兜底、兜到几个候选」不用开 devtools
  log.info(`[wy-fallback] ${key}「${musicInfo.name}」严格匹配到 ${candidates.length} 个候选`)
  return candidates
}

/**
 * 取「这首歌在网易云的替身直链」。调用方必须容忍它返回 `null`（这是常态，不是异常）。
 *
 * 逐候选试到第一个能出直链的为止：多个严格匹配是同曲的不同专辑版本，试下一个不算放宽标准。
 * **只缓存匹配结果、不缓存直链**——网易直链带时效签名（`vuutv`），存下来很快就打不开。
 */
export const getFallbackMusicUrl = async(musicInfo: LX.Music.MusicInfoOnline): Promise<string | null> => {
  const key = songKeyOf(musicInfo)
  const candidates = await findCandidates(musicInfo, key)

  for (const song of candidates) {
    const url = await getWyMusicUrl(song.id)
    if (url) {
      log.info(`[wy-fallback] ${key} 已用网易云 #${song.id}「${song.name}」顶替`)
      return url
    }
  }
  return null
}
