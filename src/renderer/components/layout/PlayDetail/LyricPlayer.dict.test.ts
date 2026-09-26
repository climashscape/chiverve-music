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
 * **接线错了它们都不会红**——这条路径上至少有三个只在装配里才成立的约定（前两条是 2026-09-26
 * 验收抓到的真 bug，票 01 / 02）：
 *   1. `v-model:show`（组件侧是 `show` prop + `update:show`，不是 `modelValue`）：属性名写错时
 *      弹窗永远不出现，而那两个单测照样全绿；
 *   2. **新式 musicInfo 上 mid 叫 `meta.songId`**（顶层 `songmid` 是老式平铺对象的字段）：写成
 *      `musicInfo?.songmid` 时 mid 为 null、整首直接跳过，**词典请求一次都不发**；
 *      而且取数层 `getSongId({songId, songmid})` 读的是老式两个键 → 发请求前要过一次
 *      `toOldMusicInfo`（两条都在票 01 的单测里钉住）；
 *   3. 取词走**点击坐标**（`document.caretRangeFromPoint`）而不是浏览器选区：歌词区是
 *      `user-select: none`，真实双击建不起选区（票 02）。
 * 所以这里把整条链在 jsdom 里走一遍：真 `LyricPlayer` + 真 `useLyricDict`，只有四处替身：
 *   - 取词典的请求（`tx/lyric`）：不打真接口（本机约定），也便于造「这首歌没有词典」；
 *   - `useLyric`（歌词滚动 / 拖拽那套）：它 onMounted 要读 DOM 尺寸、自己构歌词 DOM，与本文件无关。
 *     ⚠️ 替身返回的必须是**真 ref**（`ref(null)`）：模板上的 `ref="dom_lyric"` 只会写进真 ref，
 *     普通对象 `{ value: null }` 不会被赋值（Vue 3.3 只认 `__v_isRef`），于是组件里
 *     `dom_lyric.value` 永远是 null、包含判据必然落空——本次就先后踩了这一脚；
 *   - `document.caretRangeFromPoint`：jsdom 没有这个 API，按「点击坐标 → 光标位置」给它一个
 *     固定 range（真机上的坐标到文本位置由 Chromium 算，属浏览器职责）；
 *   - `window.getSelection`：**不再用**（票 02 的修法就是绕开选区），留着真身也无所谓。
 *
 * 另有一条**反向**用例：命中位置在歌词容器之外（本页旁边有封面 / 歌名）不该弹——否则在歌名上
 * 双击也会跳出「无释义」。
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
const POOR_OFFSET = NOBODY_LINE.indexOf('poor') + 1
const NOBODY_OFFSET = NOBODY_LINE.indexOf('nobody') + 1
const NEW_STYLE_SONG_ID = 107509954

let LyricPlayer: Component

/** 每首歌一个新 mid：`useLyricDict` 的词典缓存是模块级的，复用同一个 mid 会走缓存不再发请求 */
let songIndex = 0
const nextSong = () => {
  const mid = `midDict${++songIndex}`
  // **新式模型**（运行期 `playMusicInfo.musicInfo` 的真形状）：mid 在 `meta.songId`，顶层没有 `songmid`
  playMusicInfo.musicInfo = {
    id: `tx_${mid}`,
    name: 'Rolling in the Deep',
    singer: 'Adele',
    source: 'tx',
    interval: '03:48',
    meta: {
      songId: mid,
      id: NEW_STYLE_SONG_ID,
      albumName: '21',
      picUrl: '',
      qualitys: [],
      _qualitys: {},
      strMediaMid: '',
    },
  } as unknown as typeof playMusicInfo.musicInfo
  return mid
}

beforeEach(async() => {
  getLyricDict.mockReset()
  getLyricDict.mockReturnValue({ promise: Promise.resolve([POOR_BOY]), cancelHttp: vi.fn() })
  LyricPlayer = (await import('./LyricPlayer.vue')).default as unknown as Component
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (document as unknown as { caretRangeFromPoint?: unknown }).caretRangeFromPoint
})

/** 「点击坐标」在 jsdom 里等价于「把光标放在这一行文本的某个位置」——真机由 Chromium 按坐标算 */
const setCaret = (node: Node, offset: number) => {
  const range = document.createRange()
  range.setStart(node, offset)
  ;(document as unknown as { caretRangeFromPoint?: () => Range }).caretRangeFromPoint = () => range
}

const makeLine = (text: string, inDomLyric: boolean) => {
  const line = document.createElement('div')
  line.className = 'line-content'
  line.textContent = text
  return inDomLyric ? line : document.body.appendChild(line)
}

interface MountOptions {
  /** 是否等词典请求真的发出（本地音乐那条用例要断言「没发」，就不能等） */
  waitForDictRequest?: boolean
}

const mountPlayer = async(options: MountOptions = {}) => {
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
  if (options.waitForDictRequest !== false) {
    // 等词典预取落地（`useLyricDict` 的 watch 是 immediate）
    await vi.waitFor(() => {
      expect(getLyricDict).toHaveBeenCalled()
    })
  }
  await nextTick()
  return wrapper
}

/** 双击点名的是「歌词区」（监听挂在 `dom_lyric` 上），所以点在歌词区元素上、让事件自己冒泡 */
const dblclick = (el: HTMLElement) => {
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 10 }))
}

/** 真机上的歌词 DOM 由 useLyric 构建（本文件把它替身掉了），这里往歌词区塞一行 */
const appendLine = (wrapper: unknown, text: string) => {
  const domLyric = (wrapper as { vm: { dom_lyric: HTMLElement } }).vm.dom_lyric
  const line = makeLine(text, true)
  domLyric.appendChild(line)
  return { domLyric, line, textNode: line.firstChild as Text }
}

describe('LyricPlayer：双击歌词查词', () => {
  it('预取词典（票 01）：新式 musicInfo 从 meta.songId 取 mid，并把老式对象交给取数层', async() => {
    const mid = nextSong()
    await mountPlayer()

    expect(getLyricDict).toHaveBeenCalledTimes(1)
    const passed = getLyricDict.mock.calls[0][0] as Record<string, unknown>
    // 老式对象才有 songmid（取数层 `getSongId({songId, songmid})` 读它）；
    // 数字 songId 一并带上，走快路径不再多打一次歌曲详情
    expect(passed.songmid).toBe(mid)
    expect(passed.songId).toBe(NEW_STYLE_SONG_ID)
  })

  it('本地音乐不发词典请求（它的 meta.songId 是文件路径，getSongId 会抛）', async() => {
    playMusicInfo.musicInfo = {
      id: 'local_/music/a.mp3',
      name: '本地歌',
      singer: '',
      source: 'local',
      interval: '03:00',
      meta: { songId: '/music/a.mp3', filePath: '/music/a.mp3', ext: 'mp3' },
    } as unknown as typeof playMusicInfo.musicInfo

    await mountPlayer({ waitForDictRequest: false })

    expect(getLyricDict).not.toHaveBeenCalled()
  })

  it('歌曲有词典：双击歌词里的词 → 弹窗打开并带出释义，歌词区挂提示', async() => {
    nextSong()
    const wrapper = await mountPlayer()
    const { domLyric, textNode } = appendLine(wrapper, NOBODY_LINE)
    setCaret(textNode, POOR_OFFSET)

    dblclick(domLyric)
    await nextTick()

    const modal = wrapper.find('.modal')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('poor boy')
    expect(modal.text()).toContain(POOR_BOY.explain)
    // 有词典才挂的悬停提示（票 01 的验收判据之一）
    expect(wrapper.find('.lyric').attributes('title')).toBe(t('player__lyric_dict_hint'))
  })

  it('有词典但这个词查不到：弹窗给「无释义」而不是空白', async() => {
    nextSong()
    const wrapper = await mountPlayer()
    const { domLyric, textNode } = appendLine(wrapper, NOBODY_LINE)
    setCaret(textNode, NOBODY_OFFSET)

    dblclick(domLyric)
    await nextTick()

    const modal = wrapper.find('.modal')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain(t('player__lyric_dict_empty').replace('{word}', 'nobody'))
  })

  it('命中位置在歌词区之外（歌名 / 封面）时双击不弹', async() => {
    nextSong()
    const wrapper = await mountPlayer()
    const { domLyric } = appendLine(wrapper, NOBODY_LINE)
    // 命中节点换成歌词区外的那一行（真机上就是点在了别处）
    const outside = makeLine(NOBODY_LINE, false)
    setCaret(outside.firstChild as Text, POOR_OFFSET)

    dblclick(domLyric)
    await nextTick()

    expect(wrapper.find('.modal').exists()).toBe(false)
    outside.remove()
  })

  it('双击落在非文本处（行间空白）不弹，也不报错', async() => {
    nextSong()
    const wrapper = await mountPlayer()
    const { domLyric, line } = appendLine(wrapper, NOBODY_LINE)
    setCaret(line, 0) // 命中元素本身（不是文本节点）

    dblclick(domLyric)
    await nextTick()

    expect(wrapper.find('.modal').exists()).toBe(false)
  })

  it('这首歌没有词典（预取回来空数组）时不弹，也不挂悬停提示', async() => {
    getLyricDict.mockReturnValue({ promise: Promise.resolve([]), cancelHttp: vi.fn() })
    nextSong()
    const wrapper = await mountPlayer()
    const { domLyric, textNode } = appendLine(wrapper, NOBODY_LINE)
    setCaret(textNode, POOR_OFFSET)

    dblclick(domLyric)
    await nextTick()

    expect(wrapper.find('.modal').exists()).toBe(false)
    expect(wrapper.find('.lyric').attributes('title')).toBe('')
  })

  it('词典还在路上时双击照走：弹窗先给加载态，回来后补上释义', async() => {
    // 预取的请求挂住不 resolve：复现「刚切歌就双击」那个窗口（`useLyricDict` 的 pending 分支）
    let resolveDict: (list: unknown[]) => void = () => {}
    getLyricDict.mockReturnValue({
      promise: new Promise(resolve => { resolveDict = resolve }),
      cancelHttp: vi.fn(),
    })
    nextSong()
    // 前面用例留下的组件还挂着（本文件不卸载），`nextSong()` 会连带触发它们的 watcher，
    // 所以只断言「这次挂载让调用数增加」，不断言正好一次
    const callsBefore = getLyricDict.mock.calls.length
    const wrapper = await mountPlayer({ waitForDictRequest: false })
    expect(getLyricDict.mock.calls.length).toBeGreaterThan(callsBefore)

    const { domLyric, textNode } = appendLine(wrapper, NOBODY_LINE)
    setCaret(textNode, POOR_OFFSET)

    dblclick(domLyric)
    await nextTick()

    // 不能被静默丢弃：弹窗开着、给的是「查询中」
    const modal = wrapper.find('.modal')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain(t('player__lyric_dict_loading'))

    // 词典回来后同一个弹窗补上释义（不再是加载态）
    resolveDict([POOR_BOY])
    await vi.waitFor(() => {
      expect(wrapper.find('.modal').text()).toContain(POOR_BOY.explain)
    })
    expect(wrapper.find('.modal').text()).not.toContain(t('player__lyric_dict_loading'))
  })
})
