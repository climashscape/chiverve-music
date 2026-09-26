import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  getPageSize,
  normalizePageSize,
} from './pageSize'

/**
 * 列表分页条数（`list.pageSize`，设置页重构票 09）的两个纯逻辑：档位清单与取值规整。
 *
 * 第三段是**消费点对账**（读源码文本）：票 09 的核心是「11 处写死值收敛到一个取值口」，
 * 光有单测测不出「某个列表还在用写死数字」——那是漏网，而漏网正是这次改造要消灭的东西。
 * 所以这里按工单点名的文件清单逐个核对（清单就是工单的事实段，改一处漏一处这条会红）。
 */

describe('档位清单（设置页下拉直接用它）', () => {
  it('就是工单定的五档，顺序即下拉顺序', () => {
    expect([...PAGE_SIZE_OPTIONS]).toEqual([10, 20, 30, 50, 100])
  })

  it('每档都是合法值（规整后原样返回，不会被夹取）', () => {
    for (const option of PAGE_SIZE_OPTIONS) expect(normalizePageSize(option)).toBe(option)
  })

  it('默认值在档位里、且不超过兜底上限（改默认值时别让它落到非法区）', () => {
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE)
    expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE)
  })
})

describe('normalizePageSize：非法值落默认、过大夹上限', () => {
  it('合法值原样返回', () => {
    for (const value of [1, 10, 20, 30, 50, 100, MAX_PAGE_SIZE]) expect(normalizePageSize(value)).toBe(value)
  })

  it('手改配置文件写成字符串也能认（"50" → 50）', () => {
    expect(normalizePageSize('50')).toBe(50)
  })

  it('小数截断（30.9 → 30）', () => {
    expect(normalizePageSize(30.9)).toBe(30)
  })

  it('缺失 / 非数字 / 空串 / NaN 落到默认值', () => {
    for (const value of [undefined, null, '', 'abc', NaN, Infinity, -Infinity, {}]) {
      expect(normalizePageSize(value)).toBe(DEFAULT_PAGE_SIZE)
    }
  })

  it('0 与负数落到默认值（0 不是「不限」，它会让分页器算出 Infinity 页）', () => {
    expect(normalizePageSize(0)).toBe(DEFAULT_PAGE_SIZE)
    expect(normalizePageSize(-1)).toBe(DEFAULT_PAGE_SIZE)
    expect(normalizePageSize(-100)).toBe(DEFAULT_PAGE_SIZE)
  })

  it('过大夹到上限（手改配置写成 1000 → 200，避免被服务端按自己的上限截断后翻页跳歌）', () => {
    expect(normalizePageSize(MAX_PAGE_SIZE + 1)).toBe(MAX_PAGE_SIZE)
    expect(normalizePageSize(1000)).toBe(MAX_PAGE_SIZE)
    expect(normalizePageSize(Number.MAX_SAFE_INTEGER)).toBe(MAX_PAGE_SIZE)
  })
})

describe('getPageSize：消费点唯一入口', () => {
  it('从设置对象里现取（不是模块加载时算一次）', () => {
    const setting: Pick<LX.AppSetting, 'list.pageSize'> = { 'list.pageSize': 50 }
    expect(getPageSize(setting)).toBe(50)
    setting['list.pageSize'] = 100
    expect(getPageSize(setting)).toBe(100)
  })

  it('老配置里没有这个 key（undefined）→ 默认 30，与改造前大多数列表一致', () => {
    const missing: Partial<LX.AppSetting> = {}
    expect(getPageSize(missing as Pick<LX.AppSetting, 'list.pageSize'>)).toBe(DEFAULT_PAGE_SIZE)
  })
})

describe('消费点对账：工单点名的文件都走同一个取值口', () => {
  const repoRoot = process.cwd()
  const read = (relative: string) => fs.readFileSync(path.resolve(repoRoot, relative), 'utf8')

  /** 工单「事实」段点名的写死值位置（含同一文件的多处）。 */
  const PAGED_SOURCES = [
    'src/renderer/store/mv/state.ts',
    'src/renderer/store/mv/action.ts',
    'src/renderer/store/search/typed/state.ts',
    'src/renderer/store/search/typed/action.ts',
    'src/renderer/store/search/music/state.ts',
    'src/renderer/store/search/music/action.ts',
    'src/renderer/store/search/songlist/state.ts',
    'src/renderer/store/search/songlist/action.ts',
    'src/renderer/store/user/state.ts',
    'src/renderer/store/user/action.ts',
    'src/renderer/store/leaderboard/state.ts',
    'src/renderer/store/leaderboard/action.ts',
    'src/renderer/store/songList/state.ts',
    'src/renderer/store/songList/action.ts',
    'src/renderer/views/Album/useAlbum.ts',
    'src/renderer/views/Discover/useNewAlbumsTab.ts',
    'src/renderer/views/Singer/useSinger.ts',
    'src/renderer/views/Search/MusicList/useList.ts',
    'src/renderer/views/Search/SongListList/useList.ts',
    // 乐馆 → 有声节目的专辑搜索（2026-09-26）：卡片网格同样走用户可见分页
    'src/renderer/views/musicHall/components/longaudio/useProgramAlbums.ts',
  ]

  it('每个取数点都 import 并调用 getPageSize', () => {
    const missing = PAGED_SOURCES.filter(relative => {
      const source = read(relative)
      return !source.includes('getPageSize')
    })
    expect(missing, '这些文件还没接上取值口（写死值漏网）').toEqual([])
  })

  it('推荐歌单的 9 条保留为特例，并且**不**跟 list.pageSize 走（3×3 配平，见该文件头）', () => {
    const source = read('src/renderer/views/Discover/useRecommendTab.ts')
    expect(source).toContain('RECOMMEND_PAGE_SIZE = 9')
    // 不接取值口：既没 import 这个模块，也没有现读设置（注释里提到它不算）
    expect(source).not.toContain("from '@common/settings/pageSize'")
    expect(source).not.toMatch(/getPageSize\(appSetting\)/)
    // 文件头写明了理由（每行 3 张卡片、9 条与面板固定高度配平），注释在、后来人才知道这 9 条是有意为之
    expect(source).toContain('每行 3 张')
    expect(source).toContain('配平')
  })

  it('页面组件（非取数层）里不再有写死的每页条数：只允许 1（存在性探测）与 9（推荐歌单）', () => {
    // 扫「字面量赋值」形态：`limit: 20` / `chunk: 20` / `limit = 20`（注释行先剔掉，
    // 讨论服务端口径的文档注释里会出现 `limit: 300` 这种值，不该算漏网）
    const literal = /\b(?:limit|chunk)\s*[:=]\s*(\d+)/g
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          // 数据层的 PAGE_SIZE 是「向服务端一次要多少」（服务端口径，工单明确不动）
          if (entry.name !== 'musicSdk') walk(full)
          continue
        }
        if (!/\.(ts|js|vue)$/.test(entry.name) || entry.name.includes('.test.')) continue
        const lines = fs.readFileSync(full, 'utf8').split('\n')
          .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
        for (const match of lines.join('\n').matchAll(literal)) {
          const value = Number(match[1])
          if (value === 1 || value === 9) continue
          offenders.push(`${path.relative(repoRoot, full)} → ${match[0]}`)
        }
      }
    }
    walk(path.resolve(repoRoot, 'src/renderer'))
    // 评论区的 20（MusicComment）不在票 09 点名的清单里（它是评论接口自己的每页条数），
    // 列在这里是为了让「又有人写死一处」立刻可见：要么接取值口，要么把理由补进本用例
    expect(offenders).toEqual([
      'src/renderer/components/layout/PlayDetail/components/MusicComment/index.vue → limit: 20',
      'src/renderer/components/layout/PlayDetail/components/MusicComment/index.vue → limit: 20',
    ])
  })
})
