import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSingerCache, resolveSingers, type JumpSinger } from '@common/utils/musicLink'
import MenuToolBar from '@renderer/components/base/Menu.vue'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { setShowPlayerDetail } from '@renderer/store/player/action'
import PlayDetail from './index.vue'

/**
 * 播放详情页的歌手选择菜单（工单 05 加的，工单 23 修「弹一次后再也弹不出」）。
 *
 * 这里为什么要**手工拆一次点击**：真 Chromium 派发点击时，每个监听器返回后都会做一次
 * microtask checkpoint，而 Vue 的 watcher flush 恰好是微任务——菜单就是在那次 checkpoint 里
 * 打开的，于是**同一次点击**紧接着冒泡到 `useMenuLocation` 挂在 document 上的「点空白收起」，
 * 把刚开的菜单立刻关掉（`/tmp/ui-polish-2-verify/picker-timing.html` 在真浏览器里量到的顺序是
 * `触发元素 → microtask → document`）。jsdom 的 `dispatchEvent` 是纯同步循环，不在监听器之间
 * 跑 checkpoint，所以照原样派发永远复现不出来，只能把这一段照真机语义补上。
 *
 * 触发元素上若 `stopPropagation`（仓库里两个歌曲表就是这么写的 `@click.stop`），真机里
 * document 根本收不到这次点击——下面的模拟照此跳过第二段。播放详情页缺的就是这个 `.stop`。
 */
const flushMicrotasks = async() => {
  // 跑空微任务队列（picker 的 await 链 + Vue 的 watcher flush 都在里面）。
  // 多跑几轮无副作用：被测行为是「菜单最终可不可见」，与轮数无关。
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const dispatchClickLikeChromium = async(el: Element) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  let reachedDocument = false
  const probe = (e: Event) => { if (e === event) reachedDocument = true }
  document.addEventListener('click', probe)
  el.dispatchEvent(event)
  document.removeEventListener('click', probe)
  await flushMicrotasks() // = 真机的 checkpoint：菜单此刻已经打开
  if (reachedDocument) {
    // 真机里「同一次点击」继续冒泡到 document；这里用同一个事件对象补上这一段
    document.dispatchEvent(event)
    await flushMicrotasks()
  }
}

const singers: JumpSinger[] = [
  { mid: 'singer-a', name: '歌手甲' },
  { mid: 'singer-b', name: '歌手乙' },
]

// 在线歌曲对象：跳转判定看 meta.songId（= songmid），见 common/utils/musicLink.ts
const music = {
  id: 'tx_song-1',
  name: '歌名',
  singer: '歌手甲 / 歌手乙',
  source: 'tx',
  interval: '03:00',
  meta: { songId: 'song-mid-1', albumMid: 'album-mid-1' },
} as unknown as LX.Music.MusicInfo

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('@common/utils/vueRouter', () => ({
  useRouter: () => ({ push: routerPush }),
  useRoute: () => ({ query: {}, params: {}, path: '/', fullPath: '/', name: undefined }),
  onBeforeRouteUpdate: () => {},
  onBeforeRouteLeave: () => {},
}))

// jsdom 不做布局：`offsetParent` 恒为 null，而 useMenuLocation 要拿它当夹取容器（真机里是 #root）。
// 只补这一项，尺寸仍为 0——菜单的显隐判定不依赖尺寸，越界翻转会因此不触发（与本用例无关）。
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentElement },
  })
  // base-menu teleport 到 #root（真机里在 index.html）
  document.body.innerHTML = '<div id="root"></div>'
  clearSingerCache()
  musicInfo.name = music.name
  musicInfo.singer = music.singer
  musicInfo.album = '专辑名'
  playMusicInfo.musicInfo = music
})

afterEach(() => {
  setShowPlayerDetail(false)
  document.body.innerHTML = ''
})

const mountOverlay = async() => {
  setShowPlayerDetail(true)
  const wrapper = mount(PlayDetail, {
    global: {
      plugins: [i18nPlugin],
      // 真机靠 components/index.js 的 require.context 全局注册，测试里手工挂上
      components: { 'base-menu': MenuToolBar, 'common-audio-visualizer': { template: '<div />' } },
    },
  })
  // 触发元素必须真的在文档里：这个 bug 的两端（触发元素上的点击、document 上的收起监听）
  // 靠事件冒泡串起来，不入文档的子树永远到不了 document。
  // （VTU 的 `attachTo` 用的是 Vue ≥3.5 才有的 `app.onUnmount`，本仓库是 3.3，只能手工挂）
  document.body.appendChild(wrapper.element as Element)
  await flushMicrotasks()
  return wrapper
}

/** 菜单可见性：Menu 把它写在 ul 的内联样式上（显示 opacity 1 / 收起 opacity 0） */
const isPickerShown = () => {
  const menu = document.querySelector('#root ul')
  return menu != null && (menu as HTMLElement).style.opacity === '1'
}

/** 等真请求落到缓存里（stub 的请求在下一个宏任务 resolve） */
const settleRequest = async() => {
  await new Promise<void>(resolve => { setTimeout(resolve, 0) })
}

/**
 * 让「第一次点」具备真请求的时序：往 singerCache 里放一个**下一个宏任务才 resolve** 的 promise
 * （`musicLink.ts` 的 singerCache 是模块级的，之后同一首歌都命中它）。
 * 这样一来：第一次点的 await 要跨过事件派发（菜单在派发之后才打开，能弹出来），
 * 第二次点的 await 只跨微任务（打开落在派发中途 —— 用户报的现象就出在这里）。
 */
const startSlowSingerFetch = () => {
  let count = 0
  void resolveSingers(music, async() => {
    count++
    await new Promise(resolve => { setTimeout(resolve, 0) })
    return singers
  })
  return () => count
}

const singerNameEl = (wrapper: ReturnType<typeof mount>) => {
  const label = window.i18n.t('player__music_singer' as any)
  const el = wrapper.findAll('p').find(node => node.text().startsWith(label))
  if (!el) throw new Error('没找到唱机名那一行，模板结构变了？')
  return el.element as Element
}

describe('layout/PlayDetail 的歌手选择菜单', () => {
  it('第二次点歌手名（歌手列表已缓存）也要弹出菜单', async() => {
    const fetchCount = startSlowSingerFetch()
    const wrapper = await mountOverlay()
    const target = singerNameEl(wrapper)

    // 第一次点：请求还没回来，菜单此刻还没开；等到请求落地才弹出（用户报的「第一次能弹」）
    await dispatchClickLikeChromium(target)
    await settleRequest()
    expect(isPickerShown()).toBe(true)
    expect(fetchCount()).toBe(1)

    // 点空白收起（点菜单外面）
    await dispatchClickLikeChromium(document.body)
    expect(isPickerShown()).toBe(false)

    // 第二次点：同一首歌、命中缓存 → 打开落在这次点击的微任务里
    // （用户报的「弹出一次后再弹不出」就是这里）
    await dispatchClickLikeChromium(target)
    expect(isPickerShown()).toBe(true)
    expect(fetchCount()).toBe(1) // 复现前提：这次没再发请求
  })

  it('菜单开着时再点一次歌手名，菜单不会被自己那次点击关掉', async() => {
    const fetchCount = startSlowSingerFetch()
    const wrapper = await mountOverlay()
    const target = singerNameEl(wrapper)

    await dispatchClickLikeChromium(target)
    await settleRequest()
    expect(isPickerShown()).toBe(true)

    await dispatchClickLikeChromium(target)
    expect(isPickerShown()).toBe(true)
    expect(fetchCount()).toBe(1)
  })
})
