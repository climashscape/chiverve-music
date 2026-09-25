/**
 * 节内锚点目录（设置页重构票 02）：分组锚点的解析、点击滚动、滚动高亮、命中闪烁。
 *
 * 契约（票 02 立、票 03 接着守）：**分组锚点的 DOM id 就是元数据的 `group.id`**，形如
 * `h3#appearance_theme` / `dd#play_behavior` / `dt#data_backup`。本模块只认 id，不认文案、
 * 也不认旧仓那些 `h3#basic_theme` 这类名字——旧名到新 id 的对应是在各节组件里**改属性**完成的，
 * 不在这里维护第二张表。
 *
 * 取舍：用 `offsetTop` 类的**位置测量 + 滚动监听（100ms 节流）**，不上 `IntersectionObserver`——
 * 目录只有十几个锚点，而「滚到节尾时高亮最后一个分组」需要按位置算当前组（IO 只给相交状态，
 * 还得自己维护顺序），一次 `getBoundingClientRect` 换算就够，且能顺带解决内容高度后变（异步字体/
 * 设备列表）导致的偏移漂移：**偏移在每次滚动时现测**，只有锚点集合（DOM 结构级）缓存。
 *
 * ⚠️ 目录只列**内容区真实存在锚点**的分组（`collectGroupAnchors` 的返回）。票 03 归位前，
 * 一部分分组的内容还没在设置页里就位（新设置 key、只在浮层里的项），列出来就是点不动的死条目；
 * 内容一就位（票 03/05-09 落 `h3#<group.id>`）目录自动多出来，不需要改这里。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from '@common/utils/vueTools'
import type { Group, Section } from '@common/settingMetadata'

/**
 * 判定「滚到某锚点」的容差（px）：`h3` 自带 25px 上边距，不留容差时第一节永远高亮不到。
 * 也决定了点击滚动后目标分组能否立刻成为当前分组（滚动落点比锚点高 `ANCHOR_SCROLL_GAP`，
 * 只要 `ANCHOR_SCROLL_GAP <= 本值` 就成立）。
 */
const ACTIVE_ANCHOR_TOP_OFFSET = 24

/** 点击分组时锚点与内容区顶部的间距（px）：比上一条的容差小，落点必然被判为当前分组。 */
const ANCHOR_SCROLL_GAP = 8

/** 滚动高亮的节流间隔（工单要求 ~100ms）：10Hz 足够跟手，省掉每次 scroll 的测量与回流。 */
const SCROLL_THROTTLE_MS = 100

/** 默认闪烁时长（工单要求约 1.5s）。 */
const FLASH_DURATION_MS = 1500

export interface AnchorOffset {
  id: string
  offset: number
}

export interface ActiveAnchorOptions {
  /** 容差，见 `ACTIVE_ANCHOR_TOP_OFFSET`。 */
  topOffset?: number
  /** 内容区已滚到底：直接取最后一个锚点——尾部内容不够高时最后一个分组永远滚不到顶，不许越界。 */
  atBottom?: boolean
}

/**
 * 滚动位置落在哪个分组。**纯函数**（单测见 `useSettingToc.test.ts`）。
 *
 * 规则：取「锚点位置 ≤ 滚动位置 + 容差」里最靠下的那个；一个都不满足（停在最顶）取第一个。
 * 空列表返回 `null`（该节还没有任何锚点）。入参顺序不敏感（内部按 offset 排序，不原地改）。
 */
export const computeActiveAnchorId = (
  anchors: readonly AnchorOffset[],
  scrollTop: number,
  options: ActiveAnchorOptions = {},
): string | null => {
  if (!anchors.length) return null
  const { topOffset = ACTIVE_ANCHOR_TOP_OFFSET, atBottom = false } = options
  const sorted = [...anchors].sort((a, b) => a.offset - b.offset)
  // 内容不满一屏时 scrollTop 恒为 0，这种「到底」不算数，否则会一进来就高亮最后一个分组
  if (atBottom && scrollTop > 0) return sorted[sorted.length - 1].id
  let current = sorted[0].id
  for (const anchor of sorted) {
    if (anchor.offset - topOffset > scrollTop) break
    current = anchor.id
  }
  return current
}

export interface GroupAnchor {
  id: string
  i18nKey: string
  el: HTMLElement
}

/**
 * 在节内容里找分组锚点。用属性选择器而不是 `#id`：以后 id 里出现 `.` / 数字开头也不用改这里。
 */
export const findGroupAnchor = (root: HTMLElement | null, groupId: string): HTMLElement | null =>
  root ? root.querySelector<HTMLElement>(`[id="${groupId}"]`) : null

/**
 * 命中项控件的定位契约（票 03 立、2026-09-25 扩展）：**key 项的控件带
 * `data-setting-key="<item.key>"`，非 key 控件带 `data-setting-id="<item.id>"`**（两者都等于
 * `itemId(item)`）。两个属性都查，是因为搜索结果只带 id、不区分它是哪种项。
 */
export const findItemElement = (root: HTMLElement | null, id: string): HTMLElement | null =>
  root ? root.querySelector<HTMLElement>(`[data-setting-key="${id}"],[data-setting-id="${id}"]`) : null

/**
 * 锚点在内容区滚动坐标里的偏移。用 `getBoundingClientRect` 换算，不读 `offsetTop`——
 * 子组件的容器不一定都是 static，`offsetParent` 链一变 `offsetTop` 就不等于「相对内容区」。
 */
export const measureAnchorOffset = (el: HTMLElement, root: HTMLElement) =>
  el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop

/**
 * 取该节在内容区里真实存在的分组锚点（**元数据顺序**，左栏目录直接照这个序渲染）。
 */
export const collectGroupAnchors = (
  groups: readonly Group[],
  root: HTMLElement | null,
): GroupAnchor[] => {
  if (!root) return []
  const anchors: GroupAnchor[] = []
  for (const group of groups) {
    const el = findGroupAnchor(root, group.id)
    if (el) anchors.push({ id: group.id, i18nKey: group.i18nKey, el })
  }
  return anchors
}

export interface UseSettingTocOptions {
  /** 命中闪烁用的 class：定义在调用组件的 style module 里（见 `index.vue` 的 `.flashTarget`）。 */
  flashClass: string
  flashDuration?: number
}

export const useSettingToc = (
  section: Ref<Section | undefined>,
  contentRef: Ref<HTMLElement | null>,
  options: UseSettingTocOptions,
) => {
  const { flashClass, flashDuration = FLASH_DURATION_MS } = options

  /** 该节内容里存在的分组锚点（元数据顺序）。 */
  const groupAnchors = ref<GroupAnchor[]>([])
  /** 当前分组（滚动高亮 / 目录里高亮），`null` = 该节没有锚点或还没测。 */
  const activeGroupId = ref<string | null>(null)

  let throttleTimer: number | null = null
  let lastThrottleRun = 0
  let flashTimer: number | null = null
  let flashedEl: HTMLElement | null = null

  /** 偏移现测（见文件头取舍），只在值真的变了才写 ref，免得滚动时反复触发左栏重渲染。 */
  const updateActiveGroup = () => {
    const root = contentRef.value
    if (!root) return
    const anchors = groupAnchors.value.map(({ id, el }) => ({ id, offset: measureAnchorOffset(el, root) }))
    const atBottom = root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2
    const next = computeActiveAnchorId(anchors, root.scrollTop, { atBottom })
    if (next !== activeGroupId.value) activeGroupId.value = next
  }

  const refreshAnchors = () => {
    groupAnchors.value = collectGroupAnchors(section.value?.groups ?? [], contentRef.value)
    updateActiveGroup()
  }

  const handleScroll = () => {
    const wait = SCROLL_THROTTLE_MS - (Date.now() - lastThrottleRun)
    if (wait <= 0) {
      lastThrottleRun = Date.now()
      updateActiveGroup()
      return
    }
    // 补一次尾沿：滚动停下时必须按最终位置算一次，否则「滚到节尾」的高亮会停在中途
    if (throttleTimer != null) return
    throttleTimer = window.setTimeout(() => {
      throttleTimer = null
      lastThrottleRun = Date.now()
      updateActiveGroup()
    }, wait)
  }

  // 内容区的元素在挂载后才有：监听随之挂上，锚点（含子组件渲染出的 h3/dd）在 nextTick 后测
  watch(contentRef, (el, oldEl) => {
    oldEl?.removeEventListener('scroll', handleScroll)
    el?.addEventListener('scroll', handleScroll, { passive: true })
    void nextTick(refreshAnchors)
  })

  // 切节：内容区换了一整棵子树，锚点重测
  watch(section, () => {
    void nextTick(refreshAnchors)
  })

  onMounted(refreshAnchors)

  onBeforeUnmount(() => {
    if (throttleTimer != null) window.clearTimeout(throttleTimer)
    if (flashTimer != null) window.clearTimeout(flashTimer)
    flashedEl?.classList.remove(flashClass)
    contentRef.value?.removeEventListener('scroll', handleScroll)
  })

  /** 闪烁一个元素（同一时刻只闪一个：先撤上一个，避免连点时多个元素一起闪）。 */
  const flashElement = (el: HTMLElement | null) => {
    if (!el) return false
    if (flashTimer != null) window.clearTimeout(flashTimer)
    flashedEl?.classList.remove(flashClass)
    el.classList.add(flashClass)
    flashedEl = el
    flashTimer = window.setTimeout(() => {
      flashTimer = null
      flashedEl?.classList.remove(flashClass)
      flashedEl = null
    }, flashDuration)
    return true
  }

  /** 回到节顶（切节、节级命中、以及分组锚点还没就位时的退路）。 */
  const scrollContentTop = () => {
    contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /**
   * 滚到分组锚点。切节后内容区是新建的 DOM，所以先等一次渲染再找锚点；
   * 找不到返回 `false`（该分组的内容还没在设置页里就位），由调用方决定退到哪儿。
   */
  const scrollToGroup = async(groupId: string): Promise<boolean> => {
    await nextTick()
    const root = contentRef.value
    const el = findGroupAnchor(root, groupId)
    if (!root || !el) return false
    root.scrollTo({ top: Math.max(measureAnchorOffset(el, root) - ANCHOR_SCROLL_GAP, 0), behavior: 'smooth' })
    return true
  }

  /**
   * 高亮命中项：控件带 `data-setting-key` / `data-setting-id` 时精确到控件（见 `findItemElement`），
   * 否则返回 false 让调用方退到分组锚点。
   */
  const flashItem = async(id: string): Promise<boolean> => {
    await nextTick()
    return flashElement(findItemElement(contentRef.value, id))
  }

  /** 退路：高亮分组锚点本身（命中项还没有就位的控件时用，至少指出它在哪一组）。 */
  const flashGroup = async(groupId: string): Promise<boolean> => {
    await nextTick()
    return flashElement(findGroupAnchor(contentRef.value, groupId))
  }

  /** 左栏「节内锚点目录」的数据：只含内容已就位的分组，元数据顺序。 */
  const tocGroups = computed(() => groupAnchors.value.map(({ id, i18nKey }) => ({ id, i18nKey })))

  return {
    tocGroups,
    activeGroupId,
    scrollToGroup,
    scrollContentTop,
    flashItem,
    flashGroup,
  }
}
