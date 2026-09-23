import { describe, expect, it } from 'vitest'
import defaultSetting from '@common/defaultSetting'
import { setting } from './state'

/**
 * 歌词窗默认值的**唯一来源是 `@common/defaultSetting`**（设置页重构票 12）。
 *
 * 为什么值得一条用例：`store/state.ts` 曾经逐条手写第二份默认值，与设置页漂移了 9 处
 * （`isShowTaskbar` / `pauseHide` / `isLockScreen` / 三个 `isFontWeight*` / `isZoomActiveLrc` /
 * `isPlayLxlrc` / `common.langId`）。这类漂移只在「主进程下发的真值进 store 之前」可读，
 * 靠人眼看首帧验不可靠（真值几乎总在渲染前就位），所以把「值必须逐 key 等于 defaultSetting」钉进用例：
 * 谁把值手写回去、或跟漏了 `defaultSetting` 的改动，这里就红。
 */
describe('歌词窗默认值（单一来源：defaultSetting）', () => {
  it('逐 key 等于 defaultSetting 的对应值', () => {
    const diffs = Object.keys(setting)
      .filter(key => setting[key as keyof LX.DesktopLyric.Config] !== defaultSetting[key as keyof LX.AppSetting])
      .map(key => `${key}: 歌词窗默认 ${String(setting[key as keyof LX.DesktopLyric.Config])} ≠ defaultSetting ${String(defaultSetting[key as keyof LX.AppSetting])}`)
    // 一条断言里列出全部差异，红了能直接看出是哪些 key 漂了
    expect(diffs).toEqual([])
  })

  it('store 是 defaultSetting 的副本，不是别名', () => {
    // 别名会双向污染：歌词窗把下发的设置写进 store（`store/action.ts` 的 mergeSetting）
    // 就等于改 defaultSetting，而主进程保存设置时以 defaultSetting 为基底建副本
    // （`src/main/utils/index.ts:123`），污染会顺着保存落到用户的配置文件里。
    const before = defaultSetting['desktopLyric.style.fontSize']
    try {
      setting['desktopLyric.style.fontSize'] = before + 4
      expect(defaultSetting['desktopLyric.style.fontSize']).toBe(before)
    } finally {
      // 还原：`setting` 是模块级单例，别把改动留给同进程里的其它用例
      setting['desktopLyric.style.fontSize'] = before
    }
  })
})
