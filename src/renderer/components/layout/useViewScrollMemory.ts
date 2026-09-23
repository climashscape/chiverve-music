import { type Ref, nextTick, onBeforeUnmount, watch } from '@common/utils/vueTools'
import { useRoute } from '@common/utils/vueRouter'
import { throttle } from '@common/utils/common'

/**
 * 路由页滚动位置记忆（工单 03）：`View.vue` 专用。
 *
 * 为什么在 layout 层做：页面组件切走即卸载（`View.vue` 没有 keep-alive），而滚动容器是**各页自己挂的**——
 * 要么是页面根的全局类 `.scroll`（`assets/styles/index.less:425`），要么是 `VirtualizedList` 内联
 * `overflow-y:auto` 的自建容器（`components/base/VirtualizedList.vue:7`）。所以这里只按「能滚 + `overflow-y`
 * 是 `auto|scroll`」去找容器，不要求页面改任何东西，也**不碰** `useListScroll` / `VirtualizedList`。
 *
 * 语义边界（与既有两套「位置」机制并存，别混）：
 * - 位置只存**内存**（`Map<fullPath, scrollTop>`），关掉应用即忘；落盘是 `useListScroll` 的事
 *   （受设置 `list.isSaveScrollLocation` 控制），两种语义各管各的。
 * - key 用 `route.fullPath`：Tab 页把选中态写在 query 上（`/discover?tab=…`、`/musicHall?tab=…`、
 *   `/favorites?tab=…`）——所以**每个 Tab 各自记一份位置是预期行为**，切回该 Tab 会回到上次的位置。
 *
 * ⚠️ 时序约束（**改之前先读这段**）：真容器常常**晚于首帧**才出现，且首帧不一定没有候选——
 * 例：我的收藏 → 歌曲，真列表在 `ListMusicTable/index.vue:27` 的 `v-show="list.length"` 后面（数据没到时
 * 没有盒子），此刻页内唯一带 `overflow` 样式且有盒子的元素是左栏 `.rail`（`Favorites/components/SongsPanel.vue:4`），
 * 它其实滚不动。所以：
 *   - 选容器时**不能把「第一个拿到的」当终态**：拿到不能滚的容器（`scrollHeight <= clientHeight + 4`），
 *     或页内还有「带 overflow 样式但没盒子」的元素（说明真容器被挡着），都要继续等；
 *   - 等待是**有界**的补判序列（`RECHECK_DELAYS`，首帧后再看几次，总共约 2.5s），每判一次都重新选一遍，
 *     真容器一出现就切过去；跑完就停，不做常驻观察（滚动期间不重复扫描）。
 *
 * ⚠️ 两条豁免（删了会咬人）：
 * 1. `route.query.scrollIndex` 存在时**不恢复**：那是点播放栏进度区带来的「定位到正在播放的那首」深链，
 *    由 `useListScroll` 消费（它随后 `router.replace` 清参），必须让它优先。
 *    ⚠️ 光看 query 拦不住——清参那一步比本机制更早，所以还有一条时序上的补充判据（见 `skipRestoreOnce`）。
 * 2. 恢复时容器 `scrollTop` 已经非 0 就**跳过**：同一 `fullPath` 下页面自己可能已经恢复过位置
 *    （`useListScroll` 的落盘位置）——用这个最小判据让开，不去读它的内部状态。它同时让「补判时重复摆位置」
 *    变成幂等操作（摆成功过的容器 `scrollTop` 非 0，后续几次补判不会再动它）。
 */

/** key = `route.fullPath`。模块级：View 重挂（HMR / 未来换布局）也不丢。 */
const positions = new Map<string, number>()

/** 判定「确实能滚」的容差：小数高度、系统缩放会让 scrollHeight 比 clientHeight 大 1~2px。 */
const OVERFLOW_TOLERANCE = 4
/** 有界补判序列（ms）：首帧之后容器才长出来的页面靠它纠正（见文件头「时序约束」）。跑完即停。 */
const RECHECK_DELAYS = [150, 400, 900, 1600, 2500]
/** 补偿时延：内容异步加载时，先设的 scrollTop 会被浏览器夹小，到点再补一次。 */
const RESTORE_RETRY_DELAY = 150
/** 补偿判据：离目标还差这么多像素才算没到位（差几个像素就别再动，免得抖动）。 */
const RESTORE_SHORTFALL = 8
/** 滚动位置写内存的节流间隔。 */
const SAVE_THROTTLE_DELAY = 200
/** `skipRestoreOnce` 的有效时长（见其注释）。 */
const SKIP_RESTORE_TTL = 500

export default ({ dom_view }: { dom_view: Ref<HTMLElement | undefined> }) => {
  const route = useRoute()

  /** 当前挂着的滚动容器与它的 key（一次跳转只会有一个），离开前用它补记一次 */
  let currentEl: HTMLElement | null = null
  let currentKey = ''
  let currentHandler: (() => void) | null = null
  // 跳转序号：nextTick / rAF / 定时器都是异步的，快速连跳时靠它丢弃过期任务
  let navId = 0
  /** 补判定时器（`RECHECK_DELAYS`）与恢复补偿定时器，两者可以同时在跑，所以分开存 */
  let ladderTimer: ReturnType<typeof setTimeout> | null = null
  let compensateTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 豁免 1 的补充判据（实测时序需要）：`useListScroll` 在 `onMounted` 里 **同步** `router.replace` 清掉
   * `scrollIndex`，那一步比本机制的 `nextTick` + rAF 更早——等到恢复那一趟跑起来时 query 里已经没有
   * `scrollIndex`，光看 query 拦不住。而清参后的 URL（带 `updated=true`）如果以前被访问过（同一首歌
   * 点第二次播放栏进度区），记忆位置就会把刚定位好的列表抢走。所以在**带 scrollIndex 的那次跳转**上记一笔，
   * 紧接着的一次跳转只挂监听、不恢复。
   * 注意两条尾巴：① 只在 `SKIP_RESTORE_TTL` 内有效——用户**已经在该列表页**时 `/list` 只是 redirect，
   * 组件不重建、`useListScroll` 的 onMounted 不会再跑，那次清参的 replace 根本不发生，这个 true 会一直留着
   * 吞掉下一次导航的恢复，所以要自动过期；② 有效期内在「没有 scrollIndex 的第一趟」消费一次即清。
   */
  let skipRestoreOnce = false
  let skipRestoreTimer: ReturnType<typeof setTimeout> | null = null

  // 位置在 scroll 回调里**当场读好**再进来：throttle 是「延迟到点、用最后一次入参」的实现，
  // 若把元素传进来、到点再读 scrollTop，容器那时可能已被卸载（脱了文档就没有 box，读回 0）把好值覆盖掉
  const saveSoon = throttle((key: string, top: number) => {
    positions.set(key, top)
  }, SAVE_THROTTLE_DELAY)

  const isScrollBox = (el: HTMLElement) => {
    const overflowY = getComputedStyle(el).overflowY
    return overflowY === 'auto' || overflowY === 'scroll'
  }

  /**
   * 在 `#view` 内挑滚动容器。一次遍历同时收三样东西（页面 DOM 可能上千节点，所以每样都先做几何判定、
   * 只在必要时才算 `getComputedStyle`）：
   * - `el`：能滚的里面积最大的；一个能滚的都没有时，退一步给「有盒子 + 带 overflow 样式」的最大者，
   *   先挂上监听（内容到了它就能滚），但它**不算终态**（`canScroll` 仍是 false）；
   * - `canScroll`：上面那个是不是真的能滚（`scrollHeight` 超出）；
   * - `hidden`：页内有没有「带 overflow 样式但没有盒子」的元素（`v-show` 挡着的真容器）——有就说明
   *   这一页还没长开，别停手。
   */
  const pickContainer = () => {
    const root = dom_view.value
    if (root == null) return { el: null as HTMLElement | null, canScroll: false, hidden: false }
    const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    let scrollable: HTMLElement | null = null
    let scrollableArea = 0
    let idle: HTMLElement | null = null
    let idleArea = 0
    let hidden = false
    for (const node of nodes) {
      const area = node.clientWidth * node.clientHeight
      if (area === 0) {
        // 没有盒子：绝大多数是 span/svg/img 这类无关元素，只有**带 overflow 样式**的才算「被挡着的容器」
        if (isScrollBox(node)) hidden = true
        continue
      }
      // 已经选到能滚的容器时，面积更小的元素当不上候选（能滚的优先），不必再为它算样式
      if (scrollable != null && area <= scrollableArea) continue
      if (!isScrollBox(node)) continue
      if (node.scrollHeight > node.clientHeight + OVERFLOW_TOLERANCE) {
        scrollable = node
        scrollableArea = area
      } else if (area > idleArea) {
        idle = node
        idleArea = area
      }
    }
    return { el: scrollable ?? idle, canScroll: scrollable != null, hidden }
  }

  const detach = () => {
    if (currentEl != null && currentHandler != null) currentEl.removeEventListener('scroll', currentHandler)
    currentEl = null
    currentKey = ''
    currentHandler = null
  }

  const attach = (key: string, el: HTMLElement) => {
    // passive：只读 scrollTop，不阻断滚动
    const handler = () => {
      saveSoon(key, el.scrollTop)
    }
    el.addEventListener('scroll', handler, { passive: true })
    currentEl = el
    currentKey = key
    currentHandler = handler
  }

  /** 离开前补记一次：scroll 事件跟着帧走，最后一次滚动可能还没派发就开始跳转了 */
  const saveBeforeLeave = () => {
    if (currentEl == null) return
    const top = currentEl.scrollTop
    // 容器已被摘出文档时 scrollTop 读回 0（没有 box 就没有滚动位置），不能拿它覆盖已存的位置
    if (top === 0 && positions.has(currentKey)) return
    positions.set(currentKey, top)
  }

  const markSkipRestoreOnce = () => {
    skipRestoreOnce = true
    if (skipRestoreTimer != null) clearTimeout(skipRestoreTimer)
    skipRestoreTimer = setTimeout(() => {
      skipRestoreTimer = null
      skipRestoreOnce = false
    }, SKIP_RESTORE_TTL)
  }

  const consumeSkipRestoreOnce = () => {
    if (!skipRestoreOnce) return false
    skipRestoreOnce = false
    if (skipRestoreTimer != null) {
      clearTimeout(skipRestoreTimer)
      skipRestoreTimer = null
    }
    return true
  }

  /** 把记忆里的位置摆到 `el` 上。幂等：摆成功过的容器 scrollTop 非 0，后续补判会被豁免 2 让开。 */
  const restoreInto = (id: number, el: HTMLElement) => {
    // 豁免 1：深链定位优先（见文件头注释）
    if (route.query.scrollIndex != null) return
    // 豁免 1 的补充判据（见 skipRestoreOnce 注释）
    if (consumeSkipRestoreOnce()) return
    const target = positions.get(route.fullPath) ?? 0
    // 目标 0 不做事：反正就在顶部
    if (target === 0) return
    // 豁免 2：页面自己已经恢复过（scrollTop 被摆到非 0）就别覆盖
    if (el.scrollTop !== 0) return
    el.scrollTop = target
    const landed = el.scrollTop
    if (compensateTimer != null) clearTimeout(compensateTimer)
    compensateTimer = setTimeout(() => {
      // 只在没人动过容器（还停在我们设的值）时才补：用户自己滚了就别抢
      if (id !== navId || el !== currentEl || el.scrollTop !== landed) return
      // 内容异步加载、容器高度不足时刚设的位置会被夹小 → 补一次
      if (el.scrollTop < target - RESTORE_SHORTFALL) el.scrollTop = target
    }, RESTORE_RETRY_DELAY)
  }

  const run = (id: number, step = 0) => {
    if (id !== navId) return
    const key = route.fullPath
    const picked = pickContainer()
    const el = picked.el
    if (el != null && (el !== currentEl || key !== currentKey)) {
      // 换了页、换了 key（如 useListScroll 消费 scrollIndex 后的 replace），或补判期里真容器才冒出来：
      // 先补记旧 key 的一次，再改挂新容器
      saveBeforeLeave()
      detach()
      attach(key, el)
    }
    if (el != null) restoreInto(id, el)
    // 还没拿到能滚的容器（`el == null` / `canScroll == false`）、或页内还有被挡着的候选 → 到点再判一次。
    // 这几次里真容器一出现就会被上面那行切过去；序列跑完就停（不做常驻观察）。
    if (step < RECHECK_DELAYS.length && (el == null || !picked.canScroll || picked.hidden)) {
      ladderTimer = setTimeout(() => {
        run(id, step + 1)
      }, RECHECK_DELAYS[step])
    }
  }

  const handleRouteChange = () => {
    const id = ++navId
    if (ladderTimer != null) {
      clearTimeout(ladderTimer)
      ladderTimer = null
    }
    // 在**跳转发生的这一刻**看 query，不能等恢复那趟再看（那时它多半已被 replace 清掉，见 skipRestoreOnce 注释）
    if (route.query.scrollIndex != null) markSkipRestoreOnce()
    saveBeforeLeave()
    void nextTick(() => {
      requestAnimationFrame(() => {
        run(id)
      })
    })
  }

  watch(() => route.fullPath, handleRouteChange, { immediate: true })

  onBeforeUnmount(() => {
    // 递增序号：挂起中的 rAF / 定时器回来后会自行退出
    navId++
    if (ladderTimer != null) {
      clearTimeout(ladderTimer)
      ladderTimer = null
    }
    if (compensateTimer != null) {
      clearTimeout(compensateTimer)
      compensateTimer = null
    }
    if (skipRestoreTimer != null) {
      clearTimeout(skipRestoreTimer)
      skipRestoreTimer = null
    }
    detach()
  })
}
