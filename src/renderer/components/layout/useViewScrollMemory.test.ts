import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router, useRoute, useRouter } from 'vue-router'
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import View from './View.vue'

/**
 * `useViewScrollMemory`（工单 03）的状态机测试。
 *
 * jsdom **没有排版引擎**：`clientHeight` / `scrollHeight` / `clientWidth` 恒为 0，`scrollTop` 也永远不夹取，
 * 所以每个测试页面在挂载时给自己的滚动盒子**手写一份几何**（`makeBox`）：可动态改高度（模拟内容后到）、
 * `scrollTop` 带真实浏览器那样的夹取（超过最大滚动距离就停住）。
 *
 * 位置表是**模块级**的（`Map<fullPath, scrollTop>`，跨 View 实例共享），所以每个用例用各自的路径前缀，
 * 互不串味。挂的是真实的 `View.vue`（真 router-view + 真路由），不是重搭的壳。
 */

interface Box {
  el: HTMLElement
  /** 内容又长出来了（模拟异步数据到位） */
  setMax: (n: number) => void
  top: () => number
  /** 模拟用户滚动：摆位置 + 派发 scroll 事件（节流保存靠它） */
  userScrollTo: (n: number) => void
}

/**
 * 手写几何。`max` 是 scrollHeight：等于 clientHeight 就是「滚不动」（例如我的收藏左栏 `.rail` 只有两项）。
 */
const makeBox = (el: HTMLElement, width: number, max = 5000, selfRestoreTo = 0): Box => {
  let top = selfRestoreTo
  Object.defineProperty(el, 'clientHeight', { get: () => 500, configurable: true })
  Object.defineProperty(el, 'clientWidth', { get: () => width, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { get: () => max, configurable: true })
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: v => { top = Math.max(0, Math.min(v, max - 500)) },
    configurable: true,
  })
  return {
    el,
    setMax: n => { max = n },
    top: () => top,
    userScrollTo: n => {
      top = Math.max(0, Math.min(n, max - 500))
      el.dispatchEvent(new Event('scroll'))
    },
  }
}

/** 一个页面 = 一个滚动盒子。`selfRestoreTo` 模拟「页面自己恢复了位置」（useListScroll 的落盘位置）。 */
const makeScrollPage = (name: string, options: { initialMax?: number, selfRestoreTo?: number } = {}) => {
  const state: { box: Box | null } = { box: null }
  const page = defineComponent({
    name,
    setup() {
      const boxEl = ref<HTMLElement>()
      onMounted(() => {
        state.box = makeBox(boxEl.value!, 800, options.initialMax ?? 5000, options.selfRestoreTo)
      })
      return () => h('div', { class: 'page' }, [
        h('div', { ref: boxEl, class: 'scroll-box', style: 'overflow-y: auto' }),
      ])
    },
  })
  return { page, box: () => state.box! }
}

/**
 * `useListScroll` 的行为模型：`onMounted` 里消费 `scrollIndex`（这里目标索引 0 → 容器位置不动）、
 * 然后 `router.replace` 清参（加 `updated: true`，见 `useListScroll.js:38-49`）。
 */
const makeDeepLinkPage = (name: string) => {
  const state: { box: Box | null } = { box: null }
  const page = defineComponent({
    name,
    setup() {
      const router = useRouter()
      const route = useRoute()
      const boxEl = ref<HTMLElement>()
      onMounted(() => {
        state.box = makeBox(boxEl.value!, 800)
        if (route.query.scrollIndex != null) {
          void router.replace({
            path: route.path,
            // 真代码写的是布尔 `updated: true`（`useListScroll.js:46`，JS 文件不受类型约束），
            // URL 上是同一个 `?updated=true`；这里写字符串只是为了过 vue-router 的 query 类型
            query: { ...route.query, scrollIndex: undefined, updated: 'true' },
          })
        }
      })
      return () => h('div', { class: 'page' }, [
        h('div', { ref: boxEl, class: 'scroll-box', style: 'overflow-y: auto' }),
      ])
    },
  })
  return { page, box: () => state.box! }
}

/** 「慢一点」的深链消费方：清参的 replace 比本机制的第一趟更晚（等数据/等一帧才消费 scrollIndex） */
const makeSlowDeepLinkPage = (name: string, delay = 120) => {
  const state: { box: Box | null } = { box: null }
  const page = defineComponent({
    name,
    setup() {
      const router = useRouter()
      const route = useRoute()
      const boxEl = ref<HTMLElement>()
      let timer: ReturnType<typeof setTimeout> | null = null
      onMounted(() => {
        state.box = makeBox(boxEl.value!, 800)
        if (route.query.scrollIndex != null) {
          timer = setTimeout(() => {
            timer = null
            void router.replace({
              path: route.path,
              query: { ...route.query, scrollIndex: undefined, updated: 'true' },
            })
          }, delay)
        }
      })
      onBeforeUnmount(() => {
        if (timer != null) clearTimeout(timer)
      })
      return () => h('div', { class: 'page' }, [
        h('div', { ref: boxEl, class: 'scroll-box', style: 'overflow-y: auto' }),
      ])
    },
  })
  return { page, box: () => state.box! }
}

/** 页面里两个滚动容器（设置页的目录 + 内容那种） */
const makeTwoBoxPage = (name: string) => {
  const boxes: Box[] = []
  const page = defineComponent({
    name,
    setup() {
      const small = ref<HTMLElement>()
      const large = ref<HTMLElement>()
      onMounted(() => {
        boxes[0] = makeBox(small.value!, 200)
        boxes[1] = makeBox(large.value!, 800)
      })
      return () => h('div', { class: 'page' }, [
        h('div', { ref: small, class: 'scroll-small', style: 'overflow-y: auto' }),
        h('div', { ref: large, class: 'scroll-large', style: 'overflow-y: auto' }),
      ])
    },
  })
  return { page, small: () => boxes[0], large: () => boxes[1] }
}

/**
 * 反例回归用：真容器**晚于首帧**出现，而且首帧就有一个「带 overflow 样式但滚不动」的干扰容器
 * （我的收藏 → 歌曲：左栏 `.rail` 只有两项，滚不动；真歌曲表在 `v-show="list.length"` 后面，数据到了才有盒子）。
 */
const makeLateListPage = (name: string, options: { revealAfter?: number } = {}) => {
  const state: { rail: Box | null, list: Box | null } = { rail: null, list: null }
  const page = defineComponent({
    name,
    setup() {
      const railEl = ref<HTMLElement>()
      const listEl = ref<HTMLElement>()
      const showList = ref(false)
      onMounted(() => {
        // 左栏：有盒子、带 overflow 样式，但内容只有一屏 → scrollHeight == clientHeight（滚不动）
        state.rail = makeBox(railEl.value!, 200, 500)
        setTimeout(() => { showList.value = true }, options.revealAfter ?? 150)
      })
      watch(showList, async(show) => {
        if (!show) return
        await nextTick()
        state.list = makeBox(listEl.value!, 800)
      })
      return () => h('div', { class: 'page' }, [
        h('div', { ref: railEl, class: 'rail', style: 'overflow-y: auto' }),
        showList.value ? h('div', { ref: listEl, class: 'list', style: 'overflow-y: auto' }) : null,
      ])
    },
  })
  return { page, rail: () => state.rail!, list: () => state.list! }
}

const raf = async() => {
  await new Promise(resolve => { requestAnimationFrame(() => { resolve(null) }) })
}
const sleep = async(ms: number) => {
  await new Promise(resolve => { setTimeout(resolve, ms) })
}
/** 走完本机制的一趟：路由变化后是 nextTick + 一次 rAF */
const settle = async() => {
  await nextTick()
  await raf()
  await raf()
  await nextTick()
}

const makeRouter = (entries: Array<[string, any]>) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: entries.map(([path, component]) => ({ path, component })),
  })
  void router.push(entries[0][0])
  return router
}

const mountView = async(router: Router) => {
  await router.isReady()
  const wrapper = mount(View, { global: { plugins: [router] } })
  await settle()
  return wrapper
}

describe('useViewScrollMemory', () => {
  it('滚到中部 → 离开 → 回来：位置一致', async() => {
    const a = makeScrollPage('A')
    const b = makeScrollPage('B')
    const router = makeRouter([['/t1a', a.page], ['/t1b', b.page]])
    await mountView(router)

    expect(a.box().top()).toBe(0)
    a.box().userScrollTo(800)
    await sleep(250) // 等节流写内存

    await router.push('/t1b')
    await settle()
    await router.push('/t1a')
    await settle()

    expect(a.box().top()).toBe(800)
  })

  it('豁免 1：带 scrollIndex 的深链不被记忆位置抢', async() => {
    const a = makeScrollPage('A')
    const b = makeScrollPage('B')
    const router = makeRouter([['/t2a', a.page], ['/t2b', b.page]])
    await mountView(router)

    // 带 scrollIndex 进页面（该页面不消费它，query 一直留着），用户滚到 600 → 记在带 scrollIndex 的 key 上
    await router.push('/t2b')
    await settle()
    await router.push('/t2a?scrollIndex=2')
    await settle()
    a.box().userScrollTo(600)
    await sleep(250)

    // 再进来一次（重挂载，容器是新的）：豁免 1 生效则应停在 0，否则会被拉到 600
    await router.push('/t2b')
    await settle()
    await router.push('/t2a?scrollIndex=2')
    await settle()
    await sleep(250)

    expect(a.box().top()).toBe(0)
  })

  it('豁免 1 的真实时序：页面自己 replace 清参后也不被记忆位置抢', async() => {
    const a = makeDeepLinkPage('A')
    const b = makeScrollPage('B')
    const router = makeRouter([['/t3a', a.page], ['/t3b', b.page]])
    await mountView(router)

    // 第一次深链跳转：页面 replace 清参（key 变成 /t3a?updated=true），用户随后滚到 500
    await router.push('/t3b')
    await settle()
    await router.push('/t3a?scrollIndex=0')
    await settle()
    a.box().userScrollTo(500)
    await sleep(250)

    // 第二次同样的深链跳转：定位目标是 0，不能被上次留下的记忆拉到 500（清参那次 replace 也要让开）
    await router.push('/t3b')
    await settle()
    await router.push('/t3a?scrollIndex=0')
    await settle()
    await sleep(250)

    expect(a.box().top()).toBe(0)
  })

  it('豁免 1 的 query 判据：深链消费方晚一步清参时，第一趟不能把「让位」用掉', async() => {
    const a = makeSlowDeepLinkPage('A')
    const b = makeScrollPage('B')
    const router = makeRouter([['/t9a', a.page], ['/t9b', b.page]])
    await mountView(router)

    // 第一次深链跳转：页面 120ms 后才 replace 清参（key 变成 /t9a?updated=true），用户随后滚到 500
    await router.push('/t9b')
    await settle()
    await router.push('/t9a?scrollIndex=0')
    await settle()
    await sleep(200) // 等那次延迟的 replace 落地
    a.box().userScrollTo(500)
    await sleep(250)

    // 第二次深链跳转：定位目标是 0，不能被上次留下的记忆拉到 500
    await router.push('/t9b')
    await settle()
    await router.push('/t9a?scrollIndex=0')
    await settle()
    await sleep(300)

    expect(a.box().top()).toBe(0)
  })

  it('豁免 2：页面自己已经恢复过（非 0）就不覆盖', async() => {
    const a = makeScrollPage('A')
    const b = makeScrollPage('B')
    const first = await mountView(makeRouter([['/t4a', a.page], ['/t4b', b.page]]))

    a.box().userScrollTo(800)
    await sleep(250)
    first.unmount()

    // 同一个 key（/t4a）换成「自己会恢复」的页面：onMounted 摆到 500（模拟 useListScroll 的落盘位置）
    const aSelf = makeScrollPage('A', { selfRestoreTo: 500 })
    await mountView(makeRouter([['/t4a', aSelf.page], ['/t4b', b.page]]))

    expect(aSelf.box().top()).toBe(500)
  })

  it('页面里两个滚动容器时取可视面积最大的（设置页 TOC 那种不抢）', async() => {
    const a = makeTwoBoxPage('A')
    const b = makeScrollPage('B')
    const first = await mountView(makeRouter([['/t5a', a.page], ['/t5b', b.page]]))

    a.large().userScrollTo(700)
    await sleep(250)
    first.unmount()

    const aAgain = makeTwoBoxPage('A')
    await mountView(makeRouter([['/t5a', aAgain.page], ['/t5b', b.page]]))
    await sleep(250)

    expect(aAgain.large().top()).toBe(700)
    expect(aAgain.small().top()).toBe(0)
  })

  it('内容后到时补一次位置（补偿）', async() => {
    const a = makeScrollPage('A')
    const b = makeScrollPage('B')
    const first = await mountView(makeRouter([['/t6a', a.page], ['/t6b', b.page]]))

    a.box().userScrollTo(800)
    await sleep(250)
    first.unmount()

    // 回 /t6a 时容器先只有 600 高（最多滚 100），内容到齐后才有 5000
    const aLoaded = makeScrollPage('A', { initialMax: 600 })
    await mountView(makeRouter([['/t6a', aLoaded.page], ['/t6b', b.page]]))
    expect(aLoaded.box().top()).toBe(100) // 目标 800 被夹到当前最大滚动距离

    aLoaded.box().setMax(5000)
    await sleep(300) // 等 150ms 的补偿

    expect(aLoaded.box().top()).toBe(800)
  })

  it('容器晚于首帧出现：先选中的左栏不被当终态，真容器出现后切过去并摆上位置', async() => {
    // 第一段：先让真列表出现并滚到 700（模拟用户正常使用过一次）
    const first = makeLateListPage('A')
    const b = makeScrollPage('B')
    const router = makeRouter([['/t7a', first.page], ['/t7b', b.page]])
    const firstView = await mountView(router)
    await sleep(250) // 等真列表出现 + 补判切过去
    first.list().userScrollTo(700)
    await sleep(250) // 等节流写内存
    firstView.unmount()

    // 第二段：同样的页面重新进来，首帧只有左栏（滚不动），150ms 后真列表才出现
    const again = makeLateListPage('A')
    await mountView(makeRouter([['/t7a', again.page], ['/t7b', b.page]]))
    await sleep(500) // 越过补判序列的头几步

    expect(again.list().top()).toBe(700)
    expect(again.rail().top()).toBe(0) // 左栏不能被摆上歌曲表的位置
  })

  it('skipRestoreOnce 会过期：没有消费方（redirect 进已在的页）时不吞下一次导航的恢复', async() => {
    const a = makeScrollPage('A')
    const b = makeScrollPage('B')
    const router = makeRouter([['/t8a', a.page], ['/t8b', b.page]])
    await mountView(router)

    a.box().userScrollTo(800)
    await sleep(250)
    await router.push('/t8b')
    await settle()

    // 带 scrollIndex 的跳转，但该页不消费它（没有 useListScroll → 没有清参的 replace）
    await router.push('/t8a?scrollIndex=3')
    await settle()
    await sleep(600) // 越过 SKIP_RESTORE_TTL
    await router.push('/t8a')
    await settle()
    await sleep(250)

    expect(a.box().top()).toBe(800)
  })
})
