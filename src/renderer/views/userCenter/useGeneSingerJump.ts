import { reactive } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import music from '@renderer/utils/musicSdk'
import type { GeneItem } from '@renderer/store/user/state'

/**
 * 偏好歌手跳转（决策 D9）。
 *
 * 背景：基因给的歌手只有**数字 singer_id**（`Base.Id`），而歌手页要 mid（`/singer?mid=`，
 * `views/Singer/index.vue:155`），中间没有直通端点（spec 事实 C 实测）。可行路径 =
 * 「名字 → 搜歌手档 → 取 `singerID` 与基因 id 相同的那条 → 拿它的 mid」，
 * 网络部分在 `music.tx.user.resolveSingerMid`，判据在 `tx/utils/gene.js` 的 `pickGeneSingerMid`。
 *
 * 三条约束（都不建议改）：
 *   1. **结果进模块级 Map 缓存**（含「确认跳不了」的空串）：同一次会话里反复点同一个歌手
 *      不重复搜；缓存活过页面重建（路由页没有 keep-alive，切走再回来组件会重建）。
 *   2. **未命中不静默**：条目变成不可点 + `title` 给出可读原因（工单验收项）。
 *   3. **失败与未命中分开**：请求失败（网络抖）不写缓存，下次点还能重试；只有「搜到了但
 *      没有 id 相同的条目」才算确认跳不了。
 */

type JumpStatus = 'loading' | 'failed' | ''

const t = (key: string, params?: Record<string, string | number | boolean>) => window.i18n.t(key as any, params)

/** 已解析结果：`Map<基因歌手 id, mid>`；`''` 表示**确认跳不了**（搜过但没有 id 相同的条目）。 */
const resolved = new Map<string, string>()

export default () => {
  const router = useRouter()
  /** 只放反应式状态（UI 依赖它重渲染）；长期缓存走上面的 Map。 */
  const status = reactive<Record<string, JumpStatus>>({})

  /** 确认跳不了（已搜过且未命中，或本次请求失败）。 */
  const isFailed = (item: GeneItem) => status[item.id] === 'failed' || resolved.get(item.id) === ''
  /** 正在搜（点击后的即时反馈，避免用户以为没反应而连点）。 */
  const isJumping = (item: GeneItem) => status[item.id] === 'loading'

  const jump = async(item: GeneItem): Promise<void> => {
    const cached = resolved.get(item.id)
    if (cached) {
      void router.push({ path: '/singer', query: { mid: cached } })
      return
    }
    if (cached === '' || status[item.id] === 'loading') return
    status[item.id] = 'loading'
    try {
      const mid = await music.tx.user.resolveSingerMid(item.name, item.id)
      resolved.set(item.id, mid || '')
      status[item.id] = mid ? '' : 'failed'
      if (mid) void router.push({ path: '/singer', query: { mid } })
      else console.log('[userCenter] 基因歌手未命中搜索', item.name, item.id)
    } catch (err) {
      console.log('[userCenter] 基因歌手跳转失败', item)
      status[item.id] = 'failed'
    }
  }

  /** 悬停说明：能跳的用接口给的 slogan（没有则提示可点），跳不了的给出可读原因。 */
  const titleOf = (item: GeneItem) => isFailed(item)
    ? t('user_center__gene_singer_jump_failed')
    : (item.slogan || t('user_center__gene_singer_jump'))

  return {
    jump,
    titleOf,
    isFailed,
    isJumping,
  }
}
