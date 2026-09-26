import type { WySongInfo } from './api'

/**
 * 在网易云搜索结果里挑出「就是这首歌」的候选 —— **只管最严的那一层**。
 *
 * 规则从 `musicSdk/index.js` 的 `findMusic` 搬过来（`sortSingle` / `filterStr` / `getIntv` 与它的
 * 第一层判定逐字同义），刻意**不抄**它的后两层放宽（只按歌名 / 只按歌手 / 只按专辑）：用户
 * 2026-09-26 拍板「宁可不播，不放错歌」——兜底是静默的，用户不会去核对放的是哪一版，所以宁可
 * 什么都不放。
 *
 * 三层判定缺一不可：
 * 1. **时长**：`|差| <= 5s`。任一侧为 0（未知）视为放行——与 findMusic 的
 *    `Math.abs((a || b) - (b || a))` 同义；
 * 2. **歌名**：规范化（去空白与标点、转小写）后**完全相等**。精确相等天然排掉了「晴天」vs
 *    「晴天(深情版)」这类版本差异，所以不必再逐个比 `versionChars`（那是为放宽层准备的）；
 * 3. **歌手**：任一侧包含另一侧即可（多歌手先经 `sortSingle` 归一顺序）。
 */

const singersRxp = /、|&|;|；|\/|,|，|\|/

/** 多歌手按分隔符拆开排序后拼回 —— 顺序不同的同一组歌手要能判等（同 `musicSdk/index.js`） */
export const sortSingle = (singer: string): string => {
  if (typeof singer != 'string') return ''
  return singersRxp.test(singer)
    ? singer.split(singersRxp).sort((a, b) => a.localeCompare(b)).join('、')
    : singer
}

/** 去空白与标点、转小写，只留「字」用于比对（字符集与 `musicSdk/index.js` 逐字一致） */
export const filterStr = (str: unknown): string => {
  if (typeof str != 'string') return ''
  return str.replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '').toLowerCase()
}

/** `mm:ss` / `hh:mm:ss` → 秒；空值给 0（= 未知） */
export const parseInterval = (interval?: string): number => {
  if (typeof interval != 'string' || !interval) return 0
  const arr = interval.split(':')
  let sec = 0
  let unit = 1
  while (arr.length) {
    const n = parseInt(arr.pop()!)
    if (Number.isNaN(n)) return 0
    sec += n * unit
    unit *= 60
  }
  return sec
}

/** 任一侧为 0（未知）时差为 0 = 放行，与 `musicSdk/index.js` 的写法同义 */
const isEqualsInterval = (targetSec: number, candidateSec: number): boolean =>
  Math.abs((targetSec || candidateSec) - (candidateSec || targetSec)) <= 5

export interface WyMatchTarget {
  name: string
  singer: string
  /** `mm:ss`；缺省 = 时长未知 */
  interval?: string
}

/**
 * 按搜索返回顺序挑出严格匹配的候选，最多 `limit` 个。
 *
 * 多个候选都严格匹配是正常的（同一首歌在不同专辑各有一版），取流时按顺序逐个试——这不算放宽，
 * 每一版都过了上面三层判定。
 */
export const pickStrictMatches = (target: WyMatchTarget, candidates: WySongInfo[], limit = 3): WySongInfo[] => {
  const fName = filterStr(target.name)
  if (!fName || !Array.isArray(candidates)) return []

  const targetSec = parseInterval(target.interval)
  const fSinger = filterStr(sortSingle(target.singer))

  return candidates.filter(song => {
    if (filterStr(song.name) != fName) return false
    if (!isEqualsInterval(targetSec, song.duration)) return false
    if (!fSinger) return true
    const fCandidateSinger = filterStr(sortSingle(song.singer))
    return fSinger.includes(fCandidateSinger) || fCandidateSinger.includes(fSinger)
  }).slice(0, limit)
}
