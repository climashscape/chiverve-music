import { computed, reactive, ref, unref, watch, type ComputedRef, type Ref } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { getQQCredential } from '@renderer/utils/ipc'
import { openLoginModal } from '@renderer/store/qqAuth/action'
import { status } from '@renderer/store/qqAuth/state'

/**
 * 「关注 / 取消关注歌手」的**界面侧唯一入口**（票 03/04）——数据层是 `tx/singer.js` 的
 * `getFollowState` / `setFollowSinger`，这里只做「谁都能引用的那一层」。
 *
 * 为什么要有这个文件（而不是每处各写一遍）：
 *
 *   1. **关注态全应用共用一份**（`states` 表）：同一个歌手在歌手页与 MV 弹窗上同时出现时，
 *      一处写成功后另一处立刻跟着变——各自持有一份 `ref` 就会出现「同一歌手两处状态不同」的窗口期。
 *   2. **三态契约不许各处重判**：`true`=已关注 / `false`=未关注 / **`null`=取不到**（未登录、请求失败；
 *      界面整块不渲染，**不许退化成 `false`**）。判断只写在这里。
 *   3. **失败面按原因给不同引导**（`LX.FollowSinger.WriteFailReason`）：未登录 → 登录引导；
 *      没有网页会话 / 会话过期 → 「需要重新扫码以启用关注」+ 就地发起既有扫码流程（ADR-0010）；
 *      频控 / 网络 / 未知 → 显示服务端原文，保持原态。不混成一句「操作失败」。
 *
 * 纪律：**服务端确认后才翻转**（不许乐观更新、不许「闪一下变回去」）；写请求在途时 `isWriting` 为 true；
 * 失败**保持原态**并把原因写进 `errorMessage`（由调用方决定常驻文案行还是按钮 title，但不许静默）。
 *
 * 登录判据与写通道一致（`setFollowSinger` 里就是 `getQQCredential() == null → not-logged-in`）：
 * ⚠️ **不能读 `store/qqAuth` 的 `status.isLogin`** 来判「未登录」——那个状态只有设置页 / 登录轮询
 * 才会初始化，直接读会把已登录的用户画成未登录（`useFollowFeed.ts` 里记着同一条坑）。
 */

const t = (key: string) => window.i18n.t(key as any)

/**
 * 关注态（mid → `true`/`false`）。**不在表里 = 取不到**，不是「未关注」：
 * 只有读回来 `true`/`false` 才落表（三态契约）。
 *
 * ⚠️ 已知边界（不在这层能修的范围内）：表按 mid 存，**不带账号维度**；同一会话里换号后
 * 它靠「`status.isLogin` 变化 → 作废整份表」兜（见下面的 watch）。真要在**没有任何引用点挂载**
 * 的时候换号，表会留到下一次挂载——而那时数据层自己的关注列表缓存（`tx/singer.js` 的
 * `followedSingers`）也还是旧账号的，判态本来就不准。要根治得让数据层在登录 / 登出时
 * 作废那份缓存（本票不许改数据层）。
 */
const states = reactive(new Map<string, boolean>())
/** 正在读的 mid。用 reactive Set 是为了「读还没回来」也能被界面跟踪（同一屏多张卡片只读一次）。 */
const reading = reactive(new Set<string>())
/**
 * 正在写的 mid（同样共享）：同一歌手在一屏里有两颗键时（歌手页背后的页头 + MV 弹窗里的歌手名），
 * 一颗在写、另一颗也禁用——否则两边同时点会发两次写请求。
 */
const writing = reactive(new Set<string>())
/**
 * 在途的登录态探针。**只做并发合并、不缓存结论**：一屏十几张卡片挂载时共享一次 IPC，
 * 但下一次挂载会重新问——凭证可能在任何时刻变化（扫码登录 / 退出登录）。
 */
let loginProbe: Promise<boolean> | null = null

const probeLogin = async(): Promise<boolean> => {
  if (loginProbe == null) {
    loginProbe = getQQCredential().then(
      credential => credential != null,
      err => {
        // 取不到凭证就当未登录（与 `useFollowFeed` 同款口径）：界面给引导，不弹错
        console.log('[followSinger] credential', err)
        return false
      },
    ).finally(() => { loginProbe = null })
  }
  return loginProbe
}

/** 读一位歌手的关注态并落到共享表；`null`（取不到）**不落表**。 */
const readState = async(mid: string) => {
  if (!mid || reading.has(mid)) return
  reading.add(mid)
  try {
    const value = await music.tx.singer.getFollowState(mid)
    if (value === true || value === false) states.set(mid, value)
  } catch (err) {
    // 数据层自己会把失败吞成 null，这里只兜「意料之外」的抛错，不动表（保持「不知道」）
    console.log('[followSinger] read', err)
  } finally {
    reading.delete(mid)
  }
}

export type FollowSingerMid = string | Ref<string> | (() => string)

export interface FollowSingerKey {
  /** `true`=已关注 / `false`=未关注 / `null`=取不到（界面不许画成「未关注」） */
  state: ComputedRef<boolean | null>
  /** 读关注态还在路上（首帧）；`state` 为 null 时界面本来就不画，这个给需要区分「在读」的调用方 */
  isReading: ComputedRef<boolean>
  /** 写请求在途（按钮 loading + 禁用）；同一歌手的所有引用点共用这一个在途标记 */
  isWriting: ComputedRef<boolean>
  /** 该显示哪条引导：`login`=先登录 QQ 音乐 / `rescan`=需要重新扫码 / `null`=正常关注键 */
  guide: ComputedRef<'login' | 'rescan' | null>
  /** 常驻失败原因（空串 = 没有）；频控 / 网络 / 未知的原文都落这里 */
  errorMessage: Ref<string>
  /** 点一下关注键：`true`=写成功后已关注 / `false`=写成功后未关注 / `null`=没写（未登录、失败） */
  toggle: () => Promise<boolean | null>
  /** 就地发起既有扫码流程（未登录 / 无网页会话两条引导共用） */
  startLogin: () => Promise<void>
}

export const useFollowSinger = (mid: FollowSingerMid): FollowSingerKey => {
  const currentMid = () => {
    const value = typeof mid === 'function' ? mid() : unref(mid)
    return String(value ?? '').trim()
  }

  const id = computed(currentMid)
  const errorMessage = ref('')
  /** 探针结论；`null` = 还没问出来（这时什么都不引导，免得闪一下「先登录」又消失） */
  const isLogin = ref<boolean | null>(null)
  /** 写通道回「没有网页会话 / 会话已过期」→ 引导重新扫码（ADR-0010 的代价） */
  const needRescan = ref(false)

  const state = computed<boolean | null>(() => states.get(id.value) ?? null)
  const isReading = computed(() => reading.has(id.value))
  const isWriting = computed(() => writing.has(id.value))
  const guide = computed<'login' | 'rescan' | null>(() => {
    if (needRescan.value) return 'rescan'
    if (isLogin.value === false) return 'login'
    return null
  })

  /**
   * 走一遍「问登录态 → 读关注态」。`force` = 重新读（登录 / 登出后共享表已作废）。
   *
   * 未登录时**不读**：读侧必然取不到（数据层返回 `null`），直接给登录引导——
   * 既省一次必然失败/被拒的请求，也避免「未登录」被画成「取不到所以整块不渲染」。
   */
  const load = async(force = false) => {
    const value = id.value
    if (!value) return
    if (!force && states.has(value)) return
    // 已经知道关注态就不重复读；force 时先清掉这一位（读失败也不会留下旧值）
    if (force) states.delete(value)
    const loggedIn = await probeLogin()
    isLogin.value = loggedIn
    if (!loggedIn) return
    await readState(value)
  }

  const startLogin = async(): Promise<void> => {
    // 登录成功后**不自动重放**写请求（避免误写）：下面的 watch 只把引导撤掉并重读一次，
    // 用户再点一次关注键才会真的写
    await openLoginModal()
  }

  const toggle = async(): Promise<boolean | null> => {
    const value = id.value
    if (!value || isWriting.value) return null
    errorMessage.value = ''
    // 未登录：只开登录引导，**不发写请求**（写侧也会回 not-logged-in，但别走到那一步）
    if (isLogin.value === false) {
      void startLogin()
      return null
    }
    // 目标态由「当前已知态」推：表里是 true → 取关，否则 → 关注
    const follow = states.get(value) !== true
    writing.add(value)
    try {
      const result = await music.tx.singer.setFollowSinger(value, follow)
      if (result.ok) {
        // **服务端确认后**才翻转（同一份表 → 所有引用点一起变）
        states.set(value, follow)
        needRescan.value = false
        return follow
      }
      if (result.reason === 'not-logged-in') {
        isLogin.value = false
        // 写侧回未登录时**不再自动弹窗**（用户可能刚从别处登出）：引导文案摆在那儿，点一下才开
        errorMessage.value = t('user_center__need_login')
        return null
      }
      if (result.reason === 'no-web-session' || result.reason === 'web-session-expired') {
        needRescan.value = true
        return null
      }
      // 频控 / 网络 / 未知：保持原态，把服务端原文交给调用方显示（空串时兜一句通用失败）
      errorMessage.value = result.message || t('list__load_failed')
      return null
    } catch (err: any) {
      console.log('[followSinger] write', err)
      errorMessage.value = err?.message ?? t('list__load_failed')
      return null
    } finally {
      writing.delete(value)
    }
  }

  // 换歌手（歌手页是同组件复用路由）时这一位的错误与引导都作废，重新走「探针 + 读」
  watch(id, () => {
    errorMessage.value = ''
    needRescan.value = false
    isLogin.value = null
    void load()
  }, { immediate: true })

  // 登录成功 / 登出 / 换号：整份关注态都可能换人 → 作废共享表并重读这一位。
  // 登录成功后引导随之撤掉（`load` 里重问探针），但**不重放**写请求。
  watch(() => status.isLogin, () => {
    states.clear()
    isLogin.value = null
    needRescan.value = false
    errorMessage.value = ''
    void load(true)
  })

  return {
    state,
    isReading,
    isWriting,
    guide,
    errorMessage,
    toggle,
    startLogin,
  }
}
