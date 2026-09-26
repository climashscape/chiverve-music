import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { nextTick } from 'vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import zhCn from '@root/lang/zh-cn.json'
import { playMusicInfo } from '@renderer/store/player/state'

/**
 * 「双击歌词里的词查释义」的**接线**钉子（挂真 `LyricPlayer`）。
 *
 * 为什么单独有这个文件：数据层（`tx/lyric.test.ts`）与弹窗本体（`LyricDictModal.test.ts`）各自绿了，
 * **接线错了它们都不会红**——这条路径上至少有两个只在装配里才成立的约定：
 *   1. `v-model:show`（组件侧是 `show` prop + `update:show`，不是 `modelValue`）：属性名写错时
 *      弹窗永远不出现，而那两个单测照样全绿（本次实现时就先踩了这一脚）；
 *   2. 双击时得有浏览器选中（`window.getSelection()`）**且选区落在歌词区里**才能拿词。
 * 所以这里把整条链在 jsdom 里走一遍：真 `LyricPlayer` + 真 `useLyricDict`，只有三处替身：
 *   - 取词典的请求（`tx/lyric`）：不打真接口（本机约定），也便于造「这首歌没有词典」；
 *   - `useLyric`（歌词滚动 / 拖拽那套）：它 onMounted 要读 DOM 尺寸、自己构歌词 DOM，与本文件无关。
 *     ⚠️ 替身返回的必须是**真 ref**（`ref(null)`）：模板上的 `ref="dom_lyric"` 只会写进真 ref，
 *     普通对象 `{ value: null }` 不会被赋值（Vue 3.3 只认 `__v_isRef`），于是组件里
 *     `dom_lyric.value` 永远是 null、双击的选区判定必然落空——本次就先后踩了这一脚；
 *   - `window.getSelection`：jsdom 的 Selection 是空壳（`addRange` 后 `anchorNode` 拿不到，实测），
 *     所以按组件真正用到的两个字段（`toString()` / `anchorNode`）给一个假对象。
 *
 * 另有一条**反向**用例：选区在歌词区之外（本页旁边有封面 / 歌名）不该弹——否则在歌名上双击
 * 也会跳出「无释义」。
 */

const { getLyricDict } = vi.hoisted(() => ({ getLyricDict: vi.fn() }))
vi.mock('@renderer/utils/musicSdk/tx/lyric', async() => {
  // 匹配规则用真实现（`lyric.test.ts` 已单独钉它）；这里只换掉发请求的那一半
  const actual = await vi.importActual<Record<string, unknown>>('@renderer/utils/musicSdk/tx/lyric')
  return { default: { getLyricDict }, matchDictEntries: actual.matchDictEntries }
})
// 取数走统一入口 `music.tx.getLyricDict`（视图不再 deep import tx/lyric 发请求），
// 所以聚合层也要换成桩——两个 mock 指向同一个 `getLyricDict` 假函数，上面那条保留给匹配规则。
vi.mock('@renderer/utils/musicSdk', () => ({ default: { tx: { getLyricDict } } }))
vi.mock('@renderer/utils/compositions/useLyric', async() => {
  const { ref } = await import('@common/utils/vueTools')
  return {
    default: () => ({
      dom_lyric: ref<HTMLElement | null>(null),
      dom_lyric_text: ref<HTMLElement | null>(null),
      dom_skip_line: ref<HTMLElement | null>(null),
      isMsDown: ref(false),
      isStopScroll: ref(false),
      timeStr: ref('--/--'),
      handleLyricMouseDown: vi.fn(),
      handleLyricTouchStart: vi.fn(),
      handleWheel: vi.fn(),
      handleSkipPlay: vi.fn(),
      handleSkipMouseEnter: vi.fn(),
      handleSkipMouseLeave: vi.fn(),
      handleScrollLrc: vi.fn(),
    }),
  }
})

const t = (key: keyof typeof zhCn) => zhCn[key]

const POOR_BOY = {
  phrase: 'poor boy',
  explain: '在这个上下文中，“poor boy”用作俚语…',
  lyric_text: "I'm just a poor boy nobody loves me",
  trans_lyric_text: '但我只是个穷小孩 没有人爱我',
  lyric_timestamp: '[03:23.75]',
}
const NOBODY_LINE = "I'm just a poor boy nobody loves me"

/** 假选区：组件只读 `toString()` 与 `anchorNode` 两处（jsdom 的 Selection 是空壳），
 *  所以按用到的那两个字段造，断言只在这个 helper 里做一次，用例里就干净了 */
const fakeSelection = (text: string, anchorNode: Node) =>
  ({ text, anchorNode, toString: () => text }) as unknown as Selection

let LyricPlayer: Component
let songIndex = 0

/** 每首歌一个新 songmid：`useLyricDict` 的词典缓存是模块级的，复用同一个 mid 会走缓存不再发请求 */
const nextSong = () => {
  const songmid = `midDict${++songIndex}`
  // 测试里只喂用例真正会读的两个字段（`source` 用来判是否本地音乐）
  playMusicInfo.musicInfo = { songmid, source: 'tx' } as unknown as typeof playMusicInfo.musicInfo
  return songmid
}

beforeEach(async() => {
  getLyricDict.mockReset()
  getLyricDict.mockReturnValue({ promise: Promise.resolve([POOR_BOY]), cancelHttp: vi.fn() })
  LyricPlayer = (await import('./LyricPlayer.vue')).default as unknown as Component
})

afterEach(() => {
  vi.restoreAllMocks()
})

const mountPlayer = async(searchText: string | null) => {
  const wrapper = mount(LyricPlayer, {
    global: {
      plugins: [i18nPlugin],
      stubs: {
        'material-modal': { props: { show: { type: Boolean, default: false } }, template: '<div v-if="show" class="modal"><slot /></div>' },
        // 全局注册的（`components/index.js` 按目录给前缀），测试里没有那层注册
        'base-btn': true,
        // 右键菜单与本文件无关，而且它自己也 teleport 到 `#root`（jsdom 里没有那个锚点，只刷告警）
        LyricMenu: true,
      },
    },
  })
  // 等词典预取落地（`useLyricDict` 的 watch 是 immediate）
  await vi.waitFor(() => {
    expect(getLyricDict).toHaveBeenCalled()
  })
  await nextTick()

  // 真歌词 DOM 由 useLyric 构建（本文件把它替身掉了），这里自己往歌词区塞一行
  const domLyric = (wrapper.vm as unknown as { dom_lyric: HTMLElement }).dom_lyric
  const line = document.createElement('div')
  line.textContent = NOBODY_LINE
  domLyric.appendChild(line)

  if (searchText != null) {
    vi.spyOn(window, 'getSelection').mockReturnValue(fakeSelection(searchText, line))
  }
  return { wrapper, domLyric, line }
}

/** 双击点名的是「歌词区」（监听挂在 `dom_lyric` 上），所以点在歌词区元素上、让事件自己冒泡 */
const dblclick = (el: HTMLElement) => {
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
}

describe('LyricPlayer：双击歌词查词', () => {
  it('歌曲有词典：双击选中歌词里的词 → 弹窗打开并带出释义', async() => {
    nextSong()
    const { wrapper, domLyric } = await mountPlayer('poor boy')

    dblclick(domLyric)
    await nextTick()

    const modal = wrapper.find('.modal')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('poor boy')
    expect(modal.text()).toContain(POOR_BOY.explain)
  })

  it('有词典但这个词查不到：弹窗给「无释义」而不是空白', async() => {
    nextSong()
    const { wrapper, domLyric } = await mountPlayer('晚安 晚安')

    dblclick(domLyric)
    await nextTick()

    const modal = wrapper.find('.modal')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain(t('player__lyric_dict_empty').replace('{word}', '晚安 晚安'))
  })

  it('选区在歌词区之外（歌名 / 封面）时双击不弹', async() => {
    nextSong()
    const { wrapper, domLyric } = await mountPlayer(null)
    // 选区锚点落在歌词区外：把假选区的 anchorNode 指到页面别处
    const outside = document.createElement('p')
    outside.textContent = NOBODY_LINE
    document.body.appendChild(outside)
    vi.spyOn(window, 'getSelection')
      .mockReturnValue(fakeSelection(NOBODY_LINE, outside))

    dblclick(domLyric)
    await nextTick()

    expect(wrapper.find('.modal').exists()).toBe(false)
    outside.remove()
  })

  it('这首歌没有词典（预取回来空数组）时不弹，也不挂悬停提示', async() => {
    getLyricDict.mockReturnValue({ promise: Promise.resolve([]), cancelHttp: vi.fn() })
    nextSong()
    const { wrapper, domLyric } = await mountPlayer('poor boy')

    dblclick(domLyric)
    await nextTick()

    expect(wrapper.find('.modal').exists()).toBe(false)
    expect(wrapper.find('.lyric').attributes('title')).toBe('')
  })
})
