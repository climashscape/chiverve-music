import { ref, watch, onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import music from '@renderer/utils/musicSdk'
import { toOldMusicInfo } from '@renderer/utils'
// `matchDictEntries` 是纯匹配函数（词条 ↔ 歌词选区），留在原模块；**取数走统一入口** `music.tx.getLyricDict`
import { matchDictEntries } from '@renderer/utils/musicSdk/tx/lyric'

/**
 * 歌词词典（双击歌词里的词查释义）的取数与状态。
 *
 * 设计取舍（改之前先读）：
 *
 * 1. **切歌就预取整首词典**（一次请求），而不是等用户双击才查。理由有两层：
 *    - 端点拿回的就是**整首词典**（`dictList`，见 `tx/lyric.js` 的 `fetchLyricDict`），
 *      「查哪个词」本来就是本地匹配，预取之后双击**零延迟**（单击歌词已经在做拖拽滚动，
 *      再叠一个网络等待体验很差）；
 *    - 拿到 `dictList.length` 才知道**这首歌有没有词典**（中文歌实测都没有），
 *      有了它提示才敢只挂在真能用的歌上——不然用户双击十次都是「无释义」。
 *    代价是每首歌切歌时多一个请求（播放详情页打开期间才有），与取歌词同量级。
 * 2. **失败静默**：词典是可选装饰。请求失败/超时只 `console.warn`，不弹提示、不打断播放
 *    （`isLyricDictAvailable` 保持 false，等于这首歌没有词典）。
 * 3. **缓存按 songmid**：切走再切回不重复请求；模块级 Map 让「开关播放详情页」也不重取。
 * 4. **mid 取 `meta.songId`，请求前转回老式模型**：`watch` 拿到的 musicInfo 是新式模型
 *    （`{id,name,singer,source,interval,meta}`），mid 存在 `meta.songId`（老式平铺对象才叫 `songmid`，
 *    见 `@common/utils/tools` 的映射）；而数据层 `getSongId({songId, songmid})` 读的是**老式**两个键，
 *    新式对象上取不到 → 必须 `toOldMusicInfo()` 一次（与 `core/music/utils.ts` 取歌词那条路一致）。
 *    本地音乐直接跳过：它的 `meta.songId` 是文件路径，`getSongId` 会抛，这里不发请求。
 */
const dictCache = new Map()

export default () => {
  const lyricDictVisible = ref(false)
  const lyricDictWord = ref('')
  const lyricDictEntries = ref([])
  /**
   * 词典请求在不在路上。**两个消费方都读这一个 ref**：
   * - `LyricDictModal` 的加载态（查询中显示「查询中…」）；
   * - `LyricPlayer` 的双击守卫：`isLyricDictAvailable` 只在请求回来且非空时为真，光看它会把
   *   「刚切歌、词典还在路上」那一段的双击静默丢掉（下面 `pending` 那条分支也就永远走不到）。
   * 由 `loadDict` 在发请求时置真、落定时置假，别在别处改。
   */
  const lyricDictLoading = ref(false)
  const isLyricDictAvailable = ref(false)

  let curMid = null
  let curEntries = []
  let holder = null
  let pending = null

  const applyEntries = (mid, list) => {
    if (mid != curMid) return
    curEntries = list
    isLyricDictAvailable.value = list.length > 0
  }

  const loadDict = (musicInfo) => {
    // 新式模型里 mid 是 `meta.songId`（不是顶层 `songmid`——那是老式平铺对象的字段，见文件头第 4 条）
    const mid = musicInfo?.meta?.songId ?? null
    holder?.cancelHttp()
    holder = null
    pending = null
    curMid = mid
    curEntries = []
    isLyricDictAvailable.value = false
    // 切歌时把上一次的查询结果一起丢掉：留着会在新歌上闪一下旧歌的释义
    lyricDictVisible.value = false
    lyricDictLoading.value = false
    // 本地音乐没有 songmid（`meta.songId` 是文件路径），`getSongId` 会抛——不发请求
    if (!mid || musicInfo?.source == 'local') return

    const cached = dictCache.get(mid)
    if (cached) {
      applyEntries(mid, cached)
      return
    }

    const targetMid = mid
    // 取数层要老式对象（`getSongId` 读 `songmid` / 数字 `songId`），见文件头第 4 条
    const request = music.tx.getLyricDict(toOldMusicInfo(musicInfo))
    holder = request
    const wrapper = request.promise.then((list) => {
      dictCache.set(targetMid, list)
      applyEntries(targetMid, list)
      return list
    }).catch((err) => {
      // 见文件头第 2 条：静默降级成「这首歌没有词典」
      console.warn('[lyric-dict] 取歌词词典失败', err?.message ?? err)
      return []
    })
    pending = wrapper
    // 请求在路上：双击守卫据此放行（见 `handleLyricDblclick`），弹窗据此显示加载态
    lyricDictLoading.value = true
    wrapper.then(() => {
      // 只有「还是这一次」才清：期间用户可能已经切歌，pending 已经换成新的那一次
      if (pending === wrapper) {
        pending = null
        lyricDictLoading.value = false
      }
    })
  }

  /**
   * 打开某个词/短语的释义。`text` 是用户在歌词区选中的原文（双击时浏览器会选中光标下的词）。
   * 词典还在路上时先给加载态（`lyricDictLoading`，由 `loadDict` 驱动），到了再补匹配——
   * 避免刚切歌就双击时误报「无释义」。
   */
  const lookupWord = (text) => {
    const word = String(text ?? '').trim()
    if (!word) return
    lyricDictWord.value = word
    lyricDictVisible.value = true

    if (pending) {
      lyricDictEntries.value = []
      pending.then(list => {
        // 期间用户可能又双击了别的词 / 关了弹窗 / 切了歌：只认「还是这次查询」的结果
        if (lyricDictWord.value != word || !lyricDictVisible.value) return
        lyricDictEntries.value = matchDictEntries(list, word)
      })
      return
    }

    lyricDictEntries.value = matchDictEntries(curEntries, word)
  }

  const closeLyricDict = () => {
    lyricDictVisible.value = false
  }

  watch(() => playMusicInfo.musicInfo, loadDict, { immediate: true })

  onBeforeUnmount(() => {
    holder?.cancelHttp()
  })

  return {
    lyricDictVisible,
    lyricDictWord,
    lyricDictEntries,
    lyricDictLoading,
    isLyricDictAvailable,
    lookupWord,
    closeLyricDict,
  }
}
