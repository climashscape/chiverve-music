/**
 * 「切歌即跟随」的判定（ui-polish-3 工单 12）。用户 2026-09-24 的原话：
 * 「雷达页面我点上下曲记得左右自动滚动到播放的歌」。
 *
 * 轮播的「滚动」不是 `scrollLeft`，就是 `centerIndex`——deck 用 transform 摆位，游标即位置
 * （见 `components/RadarCarousel.vue`）。所以这件事的全部判定是「播放曲目变化时，游标该不该动、动到哪」。
 *
 * 抽成纯函数的理由：
 * 1. **判定与时机分开**：「什么时候跟随」留在组件里（只在播放曲目变化时调用），
 *    「要不要跟、跟到哪」在这里——后者边界多且都能断言。
 * 2. 这里是**唯一**可以安全放「不动」这条结论的地方：返回 `FOLLOW_STAY` 是显式的结论，
 *    不依赖「写回同一个值不触发副作用」那种隐式行为。
 *
 * 三道闸的顺序就是判定顺序：**队列身份 → 有没有在播 → 在不在本列表**，任何一道不过都返回
 * `FOLLOW_STAY`（不动）。队列身份由调用方算好传进来，口径与 `useRadar.appendToPlayQueue` 一字不差
 * （雷达队列一律灌进临时列表播，所以是 `playInfo.playerListId === LIST_IDS.TEMP`
 * **且** `tempListMeta.id === <本 tab 的队列 id>`）——两个 tab 的队列 id 不同，这是「另一个 tab
 * 在播的歌不会把本 tab 的游标带歪」的根据。
 */

/**
 * 「不动」的哨兵值。
 *
 * 用负数而不是「返回原游标」：写回同一个值是无声的（Vue 的 ref 同值不触发），
 * 那样「刚好在中央」和「判定为不该动」在测试里就分不出来了，而后者才是本函数主要的输出。
 * 负数与合法下标（>= 0）不重叠，调用方只认 `>= 0` 才写游标。
 */
export const FOLLOW_STAY = -1

/** 判定只用得上 `id`，所以取最小结构类型：测试里能直接喂普通对象，不必造完整的 MusicInfo。 */
export interface FollowSong {
  id: string
}

export interface FollowPlayingInput {
  /** 当前 tab 的歌单（`props.block.list`）。 */
  list: FollowSong[]
  /** 本列表此刻是不是「正在播的那个队列」（身份闸，口径见文件头）。 */
  isCurrentQueue: boolean
  /** 正在播的歌在**播放队列**里的下标（`playInfo.playIndex`），-1 = 没在播。 */
  playIndex: number
  /** 正在播的歌 id（`musicInfo.id`）；没在播时是 null。 */
  playingId?: string | null
  /** 当前游标（中央那一张在列表里的下标）。 */
  cursor: number
}

/**
 * 跟随后的新游标；`FOLLOW_STAY` 表示不动。
 *
 * **下标优先、id 兜底**，理由与 `utils/playingRowLocate.findPlayingRowIndex` 同：
 * 队列里的下标是「用户实际点播的那一次」的位置真相——同一首歌在列表里出现两次时（雷达翻页
 * 拿到重复推荐），只有它能分辨是哪一次。但这个下标**不保证与列表对齐**：临时队列是列表的
 * 快照（`playMusicList` 灌的是副本）+ 续页追加，而列表本身「换一批」时整串换掉（`useRadar.setSongs`）。
 * 所以下标指向的那一首的 id 必须与正在播放的一致才算数，否则按 id 全表找第一处。
 */
export const resolveFollowCursor = ({
  list,
  isCurrentQueue,
  playIndex,
  playingId,
  cursor,
}: FollowPlayingInput): number => {
  if (!isCurrentQueue) return FOLLOW_STAY
  if (playingId == null) return FOLLOW_STAY
  if (!list.length) return FOLLOW_STAY
  // id 用 `==` 比（同 `store/player/action.ts` 的 `getPlayIndex`）：本地/在线两侧的 id 类型不保证一致，
  // 这里要的是「同一首歌」而不是类型相等
  const index = playIndex >= 0 && playIndex < list.length && list[playIndex].id == playingId
    ? playIndex
    : list.findIndex(item => item.id == playingId)
  if (index < 0) return FOLLOW_STAY
  // 已经在中央：不动。这条必须有——否则「点中央键从当前这张开播」会白写一次游标
  // （不抖是观感问题，不写是纪律问题）
  if (index === cursor) return FOLLOW_STAY
  return index
}
