/**
 * 「失效曲」连播跳过的计数上限（工单 01）。
 *
 * 连播推进到一首失效曲（无版权 / 已下架）时**跳过它**——用户要的是「播不了的别占位置」。
 * 但跳过不能没有上限：整队列都失效时（例如一份老歌单大面积下架），一路跳下去既是死循环
 * 观感，也在**白刷接口**——每次跳过都要走一轮 tx 取流（4 个档位），而探针实测批量取流会被
 * 服务端按 IP 限流（`code=104009`，见 `core/music/unavailable.ts` 的说明）。
 *
 * 所以计数按「连续」算：只要有一首真的取到流就归零（`core/player/action.ts` 里在
 * `setResource` 成功那一步 reset），跳满 `MAX_CONSECUTIVE_UNAVAILABLE_SKIP` 首就停下并提示，
 * 等用户下一次手动起播再继续。
 *
 * 判据与计数分开写成纯函数（`createUnavailableSkipGuard`），上限行为由单测钉住。
 */
export const MAX_CONSECUTIVE_UNAVAILABLE_SKIP = 5

export const createUnavailableSkipGuard = (max: number = MAX_CONSECUTIVE_UNAVAILABLE_SKIP) => {
  let consecutive = 0
  return {
    /**
     * 问一次「这首还跳不跳」：`true` = 跳过它；`false` = 连着跳满上限了，**别再跳**。
     * 调用方只在真的决定跳过时才调它（它自己会记数）。
     */
    take(): boolean {
      if (consecutive >= max) return false
      consecutive++
      return true
    },
    /** 有歌真取到流 / 用户手动起了新队列 → 连续计数归零 */
    reset() {
      consecutive = 0
    },
  }
}

/** 播放链路共用的那一份（每首「取到流」的歌都会把它归零，见 `core/player/action.ts`） */
export const unavailableSkipGuard = createUnavailableSkipGuard()
