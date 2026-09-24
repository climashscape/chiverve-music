import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_LYRIC_SOURCE_PRIORITY,
  LYRIC_SOURCE_PRIORITIES,
  getLyricSourcePriority,
  normalizeLyricSourcePriority,
} from './lyricSource'

/**
 * 本地歌的歌词来源优先级（`lyric.sourcePriority`，设置页重构票 09）：取值清单 + 默认值 + 消费点对账。
 *
 * 默认值这条不是口味问题：**`localFirst` 必须是改造前实际走的顺序**（先「歌词缓存 + 同目录 .lrc」，
 * 都没有才请求在线歌词，见 `core/music/local.ts`），否则老用户升级上来取词顺序会变。
 * 「消费点对账」那段读源码文本，钉住「真读了设置」与「一侧失败回落另一侧」这两个要点。
 */

describe('取值清单（设置页选项直接用它）', () => {
  it('两个值、顺序即选项顺序（先本地后在线，与默认值一致）', () => {
    expect([...LYRIC_SOURCE_PRIORITIES]).toEqual(['localFirst', 'onlineFirst'])
  })

  it('默认值是 localFirst（= 改造前行为），且在清单里', () => {
    expect(DEFAULT_LYRIC_SOURCE_PRIORITY).toBe('localFirst')
    expect(LYRIC_SOURCE_PRIORITIES).toContain(DEFAULT_LYRIC_SOURCE_PRIORITY)
  })
})

describe('normalizeLyricSourcePriority：不认识的值落默认', () => {
  it('两个合法值原样返回', () => {
    expect(normalizeLyricSourcePriority('localFirst')).toBe('localFirst')
    expect(normalizeLyricSourcePriority('onlineFirst')).toBe('onlineFirst')
  })

  it('大小写不符 / 空串 / 别的类型 / 缺失都落到 localFirst', () => {
    for (const value of ['localfirst', 'ONLINEFIRST', '', 'both', 0, 1, true, null, undefined, {}]) {
      expect(normalizeLyricSourcePriority(value)).toBe(DEFAULT_LYRIC_SOURCE_PRIORITY)
    }
  })
})

describe('getLyricSourcePriority：消费点唯一入口', () => {
  it('从设置对象里现取', () => {
    const setting: Pick<LX.AppSetting, 'lyric.sourcePriority'> = { 'lyric.sourcePriority': 'onlineFirst' }
    expect(getLyricSourcePriority(setting)).toBe('onlineFirst')
    setting['lyric.sourcePriority'] = 'localFirst'
    expect(getLyricSourcePriority(setting)).toBe('localFirst')
  })

  it('老配置里没有这个 key（undefined）→ localFirst', () => {
    const missing: Partial<LX.AppSetting> = {}
    expect(getLyricSourcePriority(missing as Pick<LX.AppSetting, 'lyric.sourcePriority'>)).toBe('localFirst')
  })
})

describe('消费点对账：本地歌真读它、在线歌曲不看它', () => {
  const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8')
  /** 「在线优先」那条分支的起点（正则形式：源码里的写法是 `== 'onlineFirst'`）。 */
  const ONLINE_FIRST_BRANCH = /== 'onlineFirst'/

  it('core/music/local.ts 取设置并按值分派', () => {
    const source = read('src/renderer/core/music/local.ts')
    expect(source).toContain('getLyricSourcePriority(')
    expect(source).toMatch(ONLINE_FIRST_BRANCH)
  })

  it('两侧都保留、互为回落（「在线优先」不等于不用本地 .lrc）', () => {
    const source = read('src/renderer/core/music/local.ts')
    // onlineFirst 分支里也调本地那一路（断网 / 未登录时同目录 .lrc 仍要出词）
    const onlineFirstBranch = source.slice(source.search(ONLINE_FIRST_BRANCH))
    expect(onlineFirstBranch).toContain('getLyricInfoByLocal()')
    // 本地优先分支里也保留在线那一路
    expect(source).toContain('getLyricInfoByOnline()')
  })

  it('在线歌曲（core/music/online.ts）不看这个设置（那里没有本地歌词可查）', () => {
    expect(read('src/renderer/core/music/online.ts')).not.toContain('lyric.sourcePriority')
  })
})
