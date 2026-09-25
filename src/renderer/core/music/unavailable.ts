import { reactive } from '@common/utils/vueTools'
import { requestMsg } from '@renderer/utils/message'
import { setAllStatus } from '@renderer/store/player/action'

/**
 * 会话级「失效曲」登记表（工单 01：无版权 / 已下架的曲目置灰 + 点不动 + 连播跳过）。
 *
 * ## 判据：**只在用户真的播到这首、且取流结论是「不可播」时**才登记
 *
 * 列表响应里**没有**可用的失效标记——2026-09-25 的探针（`scripts/verify/artifacts/2026-09-25-qq-probe/NOTES.md`）
 * 把 4 个列表 1146 首的字段集做了差分：**0 个 differential 字段**（顶层 42 字段、嵌套
 * `file`/`pay`/`action` 全齐，空 `mid`、无 `file`、占位歌名都 0 例）。值层面的启发式
 * （`pay.pay_month == 0 && pay_down == 0 && price_track == 0`）实测 precision 只有 0.68，
 * 拿来禁用会**误灰三分之一能播的歌**，故一律不采用（`file.size_320 == 0` 只说明该档缺失，同理）。
 *
 * 唯一可靠判据是真的取流（`purl` 为空）。⚠️ **不做列表级批量取流预取**：探针实测约 150 次
 * 批量 vkey 后服务端按 IP 回 `code=104009 invalidq`（静置 5 分钟未恢复），会连带影响应用自己的
 * 取流——所以这里只登记「已经真的播到过、并且真拿不到地址」的歌。
 *
 * ## 为什么是会话级、不落盘、不进列表 meta
 *
 * 取流失败里混着网络抖动、限流、未登录这些**与歌无关**的原因，落盘等于把一次网络波动永久
 * 记成「失效」。所以：只在 `isUnavailableError` 认下的那种失败上登记，且只活在本次会话里
 * （重启就重来；真播成功过也会撤销，见 `clearUnavailable`）。
 */

/** 失效原因（当前只有一种；分档是为了将来真机确认出其它形态时能直接加，不必改调用方） */
export type UnavailableReason = 'noPlayableUrl'

/** id（`tx_<songmid>`）→ 原因。用可响应的普通对象：模板里 `isUnavailable(id)` 直接就能追踪 */
const unavailable = reactive<Record<string, UnavailableReason>>({})

type Listener = (id: string, reason: UnavailableReason | null) => void
/** 非 Vue 消费方的订阅口（Vue 组件直接读上面的响应式表即可，不必订阅） */
const listeners = new Set<Listener>()

const emit = (id: string, reason: UnavailableReason | null) => {
  for (const listener of [...listeners]) listener(id, reason)
}

/**
 * 登记一首「不可播」的歌（同一首重复登记是幂等的，不会重复通知）。
 * @param reason 默认 `noPlayableUrl`：所有档位都问过、服务端一个直链都没给
 */
export const markUnavailable = (id: string, reason: UnavailableReason = 'noPlayableUrl') => {
  if (!id || unavailable[id] === reason) return
  unavailable[id] = reason
  emit(id, reason)
}

/**
 * 撤销登记（真取到流时调）。
 *
 * 存在的意义：登记只对「那一刻」成立，服务端恢复（或判据将来放宽）后不该一直灰着——
 * 播成了就把它从表里摘掉，界面随之恢复可点。
 */
export const clearUnavailable = (id?: string | null) => {
  if (!id || unavailable[id] == null) return
  // 动态键删除：键是歌曲 id，不是固定字段（同 utils/data.ts 的 listPosition 写法）
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete unavailable[id]
  emit(id, null)
}

export const isUnavailable = (id?: string | null): boolean => !!id && unavailable[id] != null

export const getUnavailableReason = (id?: string | null): UnavailableReason | null =>
  (id ? unavailable[id] ?? null : null)

/**
 * 音乐对象版的判定（界面与播放链路共用这一处，免得各写一遍 source 判断）：
 * - 本地文件（`source == 'local'`）永远不算失效：它读磁盘，不走 tx 取流；
 * - 下载任务对象（带 `progress`）不是歌曲 id 空间，同样不认。
 */
export const isUnavailableMusic = (musicInfo: LX.Music.MusicInfo | LX.Download.ListItem | null | undefined): boolean => {
  if (!musicInfo || 'progress' in musicInfo) return false
  if (musicInfo.source == 'local') return false
  return isUnavailable(musicInfo.id)
}

/** 订阅登记变化（返回取消订阅的函数）。返回值只有非 Vue 场景用得上。 */
export const onChange = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 失效曲的那句提示（点不动时、连播跳过时都用它，只有一处措辞）。
 *
 * 仓库没有 toast（AGENTS §2.11），短提示沿用既有机制：播放栏的状态文本
 * （`store/player/action.ts` 的 `setAllStatus`，与「歌曲链接获取中…」同一处显示）。
 * 文案 key 与行内悬停说明共用 `list__unavailable_song`，四处语言同步。
 */
export const hintUnavailableMusic = () => {
  setAllStatus(window.i18n.t('list__unavailable_song'))
}

/**
 * 「取流失败」里哪些算「这首歌不可播」（工单 01 的判据，**白名单**）：
 *
 * 只认 tx 取流层在「所有档位都问过、码 0、响应形状正常、就是没有直链」时抛出的那条错误
 * （`utils/musicSdk/tx/musicUrl.js` 挂了 `txNoPlayableUrl` 标记）。其余一律**不算**：
 * - 网络错误（`请求超时` / `无法连接到服务器` / `ECONNREFUSED`…）：可能只是一次抖动；
 * - 限流（`服务器繁忙` = vkey 的 `code=104009`）：与歌无关，换个时间就能播；
 * - 未登录（`QQ 音乐未登录`）：登录后就能播；
 * - 无权限（`QQ 音乐没有该歌曲的播放权限…` = `result=104003`）：需要会员 / 购买，不是失效；
 * - 取消（`取消http请求`）：用户切歌 / 停止导致的，不代表歌播不了。
 *
 * 兜底也认消息文本：错误对象可能在别处被重新包装（标记丢了但文案还在）。
 */
export const isUnavailableError = (err: unknown): boolean => {
  const e = err as { txNoPlayableUrl?: boolean, message?: string } | null | undefined
  if (e?.txNoPlayableUrl === true) return true
  return e?.message === requestMsg.noPlayableUrl
}
