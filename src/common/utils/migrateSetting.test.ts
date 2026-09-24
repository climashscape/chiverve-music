import { describe, expect, it } from 'vitest'
import migrateSetting from './migrateSetting'

/**
 * 设置迁移的语义钉子（设置页重构票 07 只动了下载命名那一块，所以这里先钉它）。
 *
 * 票 07 的验收有一条「旧库实测」：老配置里的 `download.fileName`（三选一枚举）要原样搬到
 * `download.fileNameTemplate`（自由模板串），**渲染结果必须逐字符不变** —— 三个预设只含
 * `歌名` / `歌手` 两个占位词，所以这是纯改名。迁移函数是纯函数，这里当「旧库」用。
 *
 * ⚠️ 判「旧 key 没了」一律用 `hasOwn`：jest/vitest 的 `toHaveProperty('download.fileName')`
 * 把点号当**嵌套路径**（2.0 前的配置里真有个 `download` 子对象），拿它判平铺 key 会永远通过。
 */
const hasFlatKey = (setting: Partial<LX.AppSetting> | Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(setting, key)

describe('migrateSetting：下载命名 2.2.0（fileName → fileNameTemplate）', () => {
  it('2.1.1 的老配置：旧 key 的值原样搬进新 key，旧 key 被删掉，版本推到 2.2.0', () => {
    const result = migrateSetting({
      version: '2.1.1',
      'common.apiSource': 'builtin',
      'download.enable': true,
      'download.fileName': '歌手 - 歌名',
      'download.maxDownloadNum': 3,
    })

    expect(result['download.fileNameTemplate']).toBe('歌手 - 歌名')
    expect(hasFlatKey(result, 'download.fileName')).toBe(false)
    expect(result.version).toBe('2.2.0')
    // 同一批的其它键不受影响
    expect(result['download.maxDownloadNum']).toBe(3)
    expect(result['download.enable']).toBe(true)
  })

  it('三个预设都能原样搬过去（渲染结果与改造前一致，见 tools.test.ts 的 formatMusicName 用例）', () => {
    for (const preset of ['歌名 - 歌手', '歌手 - 歌名', '歌名']) {
      expect(migrateSetting({ version: '2.1.1', 'download.fileName': preset })['download.fileNameTemplate']).toBe(preset)
    }
  })

  it('极老配置（2.0 前的嵌套 download.fileName）也能落到新 key 上', () => {
    const result = migrateSetting({
      version: '1.5.0',
      download: { fileName: '歌名', enable: true },
    })

    expect(result['download.fileNameTemplate']).toBe('歌名')
    expect(hasFlatKey(result, 'download.fileName')).toBe(false)
    expect(result.version).toBe('2.2.0')
  })

  it('已经是 2.2.0 的配置不再迁移（不会用旧 key 盖掉用户改过的模板）', () => {
    const result = migrateSetting({
      version: '2.2.0',
      'download.fileNameTemplate': 'my_music',
      'download.fileName': '歌名',
    })

    expect(result['download.fileNameTemplate']).toBe('my_music')
    expect(result.version).toBe('2.2.0')
  })

  it('没有旧 key 的新配置：只推版本，不动其它键', () => {
    const result = migrateSetting({ version: '2.1.1', 'download.fileNameTemplate': '歌名' })

    expect(result['download.fileNameTemplate']).toBe('歌名')
    expect(result.version).toBe('2.2.0')
  })

  it('幂等：同一条配置连跑两遍结果一致', () => {
    const once = migrateSetting({ version: '2.1.1', 'download.fileName': '歌手 - 歌名' })
    const twice = migrateSetting({ ...once })

    expect(twice['download.fileNameTemplate']).toBe('歌手 - 歌名')
    expect(twice.version).toBe('2.2.0')
  })
})
