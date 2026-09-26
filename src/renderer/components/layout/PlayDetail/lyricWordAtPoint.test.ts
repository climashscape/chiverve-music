import { afterEach, describe, expect, it, vi } from 'vitest'
import { wordAtOffset, wordAtPoint } from './lyricWordAtPoint'

/**
 * 「按点击坐标取词」的两层钉子（票 02 的修法）。
 *
 * 为什么要单独钉它：真机上歌词区是 `user-select: none`（`App.vue`），浏览器**建不起选区**，
 * 双击选词这条路整条走不通；改成 `caretRangeFromPoint` 后，「取哪个词」成了本文件里的纯逻辑，
 * 而它在真机上出错（取到半截词 / 取到空）只有点了才知道——所以先在单测里把边界钉死。
 *
 * 分两层：
 *   1. `wordAtOffset(text, offset)`：纯函数，与 DOM 无关（词边界、光标两位歧义、CJK/空白/越界）；
 *   2. `wordAtPoint(x, y, root)`：DOM 那层（光标 API 取节点与 offset → 折算到**整行**文本），
 *      这里用 `document.caretRangeFromPoint` 桩驱动；「词被 QRC 拆成多个 span」那条是重点
 *      （只看命中节点会取到半截词，真机上点击落点就是这么碎的）。
 */

/** 假光标：把 `caretRangeFromPoint` 换成返回指定 range 的桩（jsdom 没有这个 API） */
const setCaretRange = (node: Node, offset: number) => {
  const range = document.createRange()
  range.setStart(node, offset)
  ;(document as unknown as { caretRangeFromPoint?: () => Range }).caretRangeFromPoint = () => range
}

/** 造一行歌词（每个 part 一个 `<span>`，与逐字歌词的 DOM 同形）；返回行元素与各段的文本节点 */
const makeLine = (parts: string[], className = 'line-content') => {
  const line = document.createElement('div')
  line.className = className
  const texts: Text[] = []
  for (const part of parts) {
    const span = document.createElement('span')
    span.textContent = part
    line.appendChild(span)
    texts.push(span.firstChild as Text)
  }
  document.body.appendChild(line)
  return { line, texts }
}

afterEach(() => {
  delete (document as unknown as { caretRangeFromPoint?: unknown }).caretRangeFromPoint
  delete (document as unknown as { caretPositionFromPoint?: unknown }).caretPositionFromPoint
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('wordAtOffset：文本 + 光标位置 → 词', () => {
  const LINE = 'I see a little silhouetto of a man'

  it('光标落在词中间：向左右扩到词边界', () => {
    expect(wordAtOffset(LINE, 9)).toBe('little') // 'l' 附近
    expect(wordAtOffset(LINE, 12)).toBe('little')
  })

  it('光标贴在词的边缘（点在词后的空格上）也能取到这个词', () => {
    // 'little' 之后是空格（下标 16），光标常在词的右边界外一位——只看 offset 处会什么都取不到
    expect(wordAtOffset('poor boy', 4)).toBe('poor')
    expect(wordAtOffset('poor boy', 6)).toBe('boy') // 点在 'b' 前一位（空格）→ 取右侧的词
    expect(wordAtOffset('abc', 3)).toBe('abc') // 行尾：offset 越到 text.length，取到紧邻的整词
  })

  it('两侧都不是词内字符（点在连续空白 / 标点上）→ 空串', () => {
    expect(wordAtOffset('a  b', 2)).toBe('')
    expect(wordAtOffset('  ', 1)).toBe('')
    expect(wordAtOffset('', 0)).toBe('')
    expect(wordAtOffset('abc def', 99)).toBe('')
  })

  it('撇号 / 数字算词内字符（`don\'t`、`2nd` 整体返回）', () => {
    expect(wordAtOffset("don't stop", 3)).toBe("don't")
    expect(wordAtOffset('don’t stop', 3)).toBe('don’t') // 弯撇号
    expect(wordAtOffset('the 2nd time', 5)).toBe('2nd')
  })

  it('连字符与 CJK 不算词内字符：前者拆词（短语匹配仍能命中），后者没有词边界', () => {
    expect(wordAtOffset('well-known fact', 3)).toBe('well')
    expect(wordAtOffset('well-known fact', 6)).toBe('known')
    // 中文歌实测没有词典（NOTES-lyric-dict.md），取不出词就什么都不做
    expect(wordAtOffset('晚安的夜 world', 1)).toBe('')
  })

  it('重复下划线等非词字符不会黏在词上（`_word_` → `word`）', () => {
    expect(wordAtOffset('_word_', 3)).toBe('word')
  })
})

describe('wordAtPoint：点击坐标 → 词（走光标 API）', () => {
  it('整行在一个文本节点里：按点击位置取词', () => {
    const { line, texts } = makeLine(['I see a little silhouetto of a man'])

    setCaretRange(texts[0], 9)
    expect(wordAtPoint(0, 0, line)).toBe('little')

    setCaretRange(texts[0], 2)
    expect(wordAtPoint(0, 0, line)).toBe('see')
  })

  it('词被逐字歌词拆成多个 span（QRC）：折算到整行再取，不返回半截词', () => {
    // `Running` 被拆成 `Run` + `ning`：只看命中节点只会拿到 `ning`
    const { line, texts } = makeLine(['Run', 'ning '])

    setCaretRange(texts[1], 2)
    expect(wordAtPoint(0, 0, line)).toBe('Running')
  })

  it('没有 `.line-content` 时退回命中节点的父元素（扩展歌词 / 结构变化时不至于取不到）', () => {
    const { line, texts } = makeLine(['poor boy'], 'plain-line')

    setCaretRange(texts[0], 6)
    expect(wordAtPoint(0, 0, line)).toBe('boy')
  })

  it('命中位置不在歌词容器里 → 空串（旁边封面 / 歌名上的双击不该当歌词查）', () => {
    const { texts } = makeLine(['poor boy'])
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    setCaretRange(texts[0], 6)

    expect(wordAtPoint(0, 0, outside)).toBe('')
    expect(wordAtPoint(0, 0, null)).toBe('boy')
  })

  it('点在非文本处（元素上）→ 空串，不弹空弹窗', () => {
    const { line } = makeLine(['poor boy'])
    setCaretRange(line, 0)

    expect(wordAtPoint(0, 0, line)).toBe('')
  })

  it('Chromium 的 `caretRangeFromPoint` 不在时退回 `caretPositionFromPoint`', () => {
    const { line, texts } = makeLine(['poor boy'])
    ;(document as unknown as { caretPositionFromPoint?: () => unknown }).caretPositionFromPoint =
      () => ({ offsetNode: texts[0], offset: 6 })

    expect(wordAtPoint(0, 0, line)).toBe('boy')
  })
})
