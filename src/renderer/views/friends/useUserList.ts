import { markRawList, reactive, watch } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { status } from '@renderer/store/qqAuth/state'

/**
 * 粉丝 / 关注 / 好友 三个 Tab 的取数（`views/friends`）。
 *
 * **三块共用一份实现**：数据层的三个方法在 SDK 里已经把差异抹平了（`hasMore` 都归一成布尔、
 * `total` 统一 `number | null`），取数流程（loading → 数据 → 失败/未登录文案）完全同构，
 * 差别只剩**调哪个方法**。所以这里按 `kind` 分派，别把同一段复制三份——真要分叉时再拆。
 *
 * 三条约定（照 §2.11 三段式与 `useDislikeSongs.ts` 的口径）：
 *   1. 失败不抛（弱依赖）：落 `noItemLabel` 文案；**未登录单独一档**（`needLogin`），
 *      面板据此给「去登录」引导而不是显示「加载失败」。
 *   2. 重拉期间**只在列表为空**时落 loading 文案，否则会把上一份数据整块藏起来。
 *   3. `noItemLabel` 兼作空态文案；有数据时必须为空串。
 */

export interface FriendUser {
  /** `EncUin`——**仅作列表 key/去重用**，实测没有可跳转的 id（见 `tx/user.js` 的 toUserInfo）。 */
  id: string
  name: string
  img: string
  desc: string
  fans: number
  /** 我关注了 TA。 */
  isFollow: boolean
  /** TA 关注了我。 */
  isFollowed: boolean
  source: LX.OnlineSource
}

export type UserListKind = 'follow' | 'fans' | 'friend'

export interface UserListState {
  list: FriendUser[]
  /** 服务端给的总数；**好友那口不给**（实测无 `Total` 字段）→ `null`。 */
  total: number | null
  page: number
  hasMore: boolean
  noItemLabel: string
  isLoading: boolean
  /** 未登录（`requireCredential` 抛的那句）——面板给登录引导。 */
  needLogin: boolean
}

const t = (key: string, params?: any) => window.i18n.t(key as any, params)

/**
 * 「共 N 位」的文案；`total == null`（好友那口服务端不给总数）时给空串——界面据此整行不渲染。
 * 三个面板共用：别在各自的面板里再写一遍「null 就不显示」的分支。
 */
export const totalTextOf = (state: UserListState): string =>
  state.total == null ? '' : t('friends__total', { num: state.total })

const FETCHERS: Record<UserListKind, (page: number) => Promise<any>> = {
  follow: page => music.tx.user.getFollowUsers(page),
  fans: page => music.tx.user.getFans(page),
  friend: page => music.tx.user.getFriends(page),
}

export const useUserList = (kind: UserListKind) => {
  const state = reactive<UserListState>({
    list: [],
    total: null,
    page: 1,
    hasMore: false,
    noItemLabel: '',
    isLoading: false,
    needLogin: false,
  })

  const clear = () => {
    state.list.splice(0, state.list.length)
    state.total = null
    state.hasMore = false
  }

  const load = async(more: boolean): Promise<void> => {
    if (state.isLoading) return
    if (more && !state.hasMore) return
    state.isLoading = true
    if (!more && !state.list.length) state.noItemLabel = t('list__loading')
    try {
      const page = more ? state.page + 1 : 1
      const res = await FETCHERS[kind](page)
      const next = markRawList((res?.list ?? []) as FriendUser[])
      if (more) state.list.push(...next)
      else state.list.splice(0, state.list.length, ...next)
      state.total = res?.total ?? null
      state.page = page
      state.hasMore = res?.hasMore === true
      state.noItemLabel = state.list.length ? '' : t('no_item')
      state.needLogin = false
    } catch (err: any) {
      console.log('[friends]', kind, err)
      if (err?.message === 'QQ 音乐未登录') {
        // 未登录不是失败：清空并落引导态（面板给「登录」按钮）
        clear()
        state.noItemLabel = ''
        state.needLogin = true
        return
      }
      // 加载更多失败时保留已加载的行，只把文案挂上去
      if (!more) clear()
      state.noItemLabel = t('list__load_failed')
    } finally {
      state.isLoading = false
    }
  }

  // 未登录时面板上有个「登录」按钮（开的是全局登录弹窗）。登录成功后自动把这块拉出来——
  // 不补这一下的话，用户登完还停在「请先登录 QQ 音乐」上，得切走再切回来才看到列表
  watch(() => status.isLogin, (isLogin) => {
    if (isLogin && state.needLogin) void load(false)
  })

  return {
    state,
    loadFirst: async() => { await load(false) },
    loadMore: async() => { await load(true) },
  }
}
