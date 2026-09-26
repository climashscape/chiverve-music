/**
 * 「点歌词查词」的取词：从**点击坐标**取词，不依赖浏览器选区。
 *
 * 为什么不用 `window.getSelection()`（原实现）：整个应用是 `user-select: none`（`App.vue`，
 * 为了「长按拖动歌词滚动」的手感），歌词区没有例外——真实双击**建不起选区**，所以旧写法拿到的
 * `selection.toString()` 恒为空、处理器必然提前返回（票 02 真机实测：双击后选区锚点还在别的元素上）。
 * 这里改成「按坐标取词」：`caretRangeFromPoint`（Chromium/Electron 有，优先）拿不到就
 * `caretPositionFromPoint`，得到文本节点与 offset；取词纯逻辑与 DOM 无关（`wordAtOffset`），
 * 所以不受 `user-select` 影响，也不必放开整块可选（放开会与拖拽滚动互抢手势）。
 *
 * 为什么把 offset 折算到**整行**再取词（而不是只用命中那个文本节点）：逐字歌词（QRC）会把一行
 * 拆成多个 `<span>`（`common/utils/lyric-font-player/font-player.js` 每个时间段一个 span），
 * 点击落在一个 span 上时只看该节点的文本可能只拿到半截词。行的容器是 `.line-content`（同一份
 * 上游代码里的 `lineContentClassName`，`useLyric.js` 也按它取行），向下兼容用「文本节点的父元素」。
 */

/**
 * 词内字符：拉丁字母（含重音，`\u00c0-\u024f`）/ 数字 / 撇号（直的与弯的都要，`don't`、`I'm`
 * 得连成一个词）。**刻意不含连字符与 CJK**：
 *   - 连字符会把 `well-known` 当一个词，点击落在 `-` 上还会取出一个只有连字符的「词」；
 *     拆开后 `matchDictEntries` 的第 3/4 条规则仍能用短语命中（`well` ↔ `well-known`）。
 *   - CJK 没有词边界（要分词器），且词典探针实测**只给外语原文歌**（中文/日文歌 `dictList=null`，
 *     见 `scripts/verify/artifacts/2026-09-26-capabilities/NOTES-lyric-dict.md`）→ 取不出词是对的。
 */
const WORD_CHAR_RXP = /[0-9A-Za-z\u00c0-\u024f'\u2019]/

/** 逐字歌词的行容器（上游 `lyric-font-player` 的 `lineContentClassName`），用于把 offset 折算到整行 */
const LINE_SELECTOR = '.line-content'

const isWordChar = (ch: string | undefined) => typeof ch == 'string' && WORD_CHAR_RXP.test(ch)

/**
 * 从一段文本与光标位置取词（**纯函数**，拿文本节点与 offset 就能测）。
 *
 * 光标位置的两位歧义：双击落在词的边缘时 `offset` 可能指向词内字符，也可能指向词后的第一个字符
 * （点在 `boy` 的 `y` 之后 vs `b` 之前，都是「贴着这个词」）→ 优先看 `offset` 处，不是词内字符再
 * 看 `offset - 1` 处。两侧都不是词内字符（点在空格 / 标点 / 行尾空白上）→ 返回 `''`：调用方据此
 * 什么都不做，不弹空弹窗。
 *
 * 命中后向左右扩到词边界（同一字符类）。数字与撇号算词内字符，所以 `03`、`don't` 整体返回。
 */
export const wordAtOffset = (text: string, offset: number) => {
  const str = typeof text == 'string' ? text : ''
  const at = Number.isFinite(offset) ? Math.trunc(offset) : 0

  let index = -1
  if (isWordChar(str[at])) index = at
  else if (isWordChar(str[at - 1])) index = at - 1
  if (index < 0) return ''

  let start = index
  let end = index + 1
  while (start > 0 && isWordChar(str[start - 1])) start--
  while (end < str.length && isWordChar(str[end])) end++
  return str.slice(start, end)
}

/** 拿点击坐标处的光标位置：优先 Chromium 的 `caretRangeFromPoint`，退回标准的 `caretPositionFromPoint` */
const caretAt = (x: number, y: number) => {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node, offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint == 'function') {
    const range = doc.caretRangeFromPoint(x, y)
    if (range) return { node: range.startContainer, offset: range.startOffset }
  }
  const pos = doc.caretPositionFromPoint?.(x, y)
  return pos ? { node: pos.offsetNode, offset: pos.offset } : null
}

/** 光标位置在该行整行文本里的下标（用 Range 量「行首 → 光标」的文本长度，跨 span 也对） */
const lineTextOffset = (line: HTMLElement, node: Node, offset: number) => {
  const nodeLength = node.nodeValue?.length ?? 0
  const end = Math.min(Math.max(offset, 0), nodeLength)
  const range = document.createRange()
  range.setStart(line, 0)
  range.setEnd(node, end)
  return range.toString().length
}

/**
 * 取点击坐标处的词。`root` 是歌词容器（`dom_lyric`）：**命中位置必须落在它里面**，否则返回 `''`
 * ——与旧实现「选区必须落在歌词区里」同一条判据（本页旁边还有封面 / 歌名，那里的取词不该查歌词）。
 * 点在非文本处（行间空白、图片、覆盖层）也返回 `''`。
 */
export const wordAtPoint = (x: number, y: number, root?: Node | null) => {
  if (typeof document == 'undefined') return ''
  const caret = caretAt(x, y)
  if (!caret || caret.node.nodeType != Node.TEXT_NODE) return ''

  const parent = caret.node.parentElement
  const line = parent?.closest<HTMLElement>(LINE_SELECTOR) ?? parent
  if (!line) return ''
  if (root && !root.contains(line)) return ''

  return wordAtOffset(line.textContent ?? '', lineTextOffset(line, caret.node, caret.offset))
}
