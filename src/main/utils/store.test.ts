import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dialog, shell } from 'electron'
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from 'vitest'
import getStore, { Store } from './store'

/**
 * 自研 JSON Store（`src/main/utils/store.ts`）的行为钉子。
 *
 * 验证方式刻意「从外部看」：直接读磁盘文件、或用 `new Store(filePath)` 另开一个实例
 * 重新解析（独立于被测试例的内部状态），而不是读它的私有字段。
 *
 * 用 `global.lxDataPath` 指向临时目录（模块内的 stores 是按名字缓存的单例，
 * 所以每个用例用不同的 store 名，避免互相串）。
 * `@common/utils` 被 mock 掉：只是为了避免往真实 `~/.config/chiverve-music/logs/`
 * 写日志，被测逻辑（损坏配置的备份/重建）不受影响。
 */
vi.mock('@common/utils', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

let tempDir: string

/**
 * 从 electron 桩上取一个 vi.fn。
 * 直接引用 `dialog.showMessageBoxSync` 这类「方法声明」会被
 * `@typescript-eslint/unbound-method` 拦下，所以过一层「属性即 Mock」的类型投影。
 */
const stubMockOf = <T extends object, K extends keyof T & string>(obj: T, key: K): Mock =>
  (obj as unknown as Record<K, Mock>)[key]

const storePathOf = (name: string) => path.join(tempDir, `${name}.json`)
const readJson = (filePath: string) => JSON.parse(fs.readFileSync(filePath, 'utf8'))

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chiverve-store-test-'))
  global.lxDataPath = tempDir
})

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('Store.set', () => {
  it('立即同步落盘：set 返回后磁盘上就能读到最新内容', () => {
    const store = getStore('set-sync')
    store.set('a', { foo: 'bar' })
    store.set('b', 1)

    const onDisk = readJson(storePathOf('set-sync'))
    expect(onDisk).toEqual({ a: { foo: 'bar' }, b: 1 })
  })

  it('删字段的约定是 set(key, null)：值变 null 并落盘，键仍在（不是真的 delete）', () => {
    const store = getStore('set-null')
    store.set('keep', 'v')
    store.set('remove', 'v')
    store.set('remove', null)

    expect(store.get('remove')).toBeNull()
    // 注意：这里钉的是事实——`has` 判的是 `key in store`，所以删除字段后仍为 true。
    // 调用方要判「有没有值」应该用 `get`，别用 `has`。
    expect(store.has('remove')).toBe(true)
    expect(store.has('keep')).toBe(true)

    const onDisk = readJson(storePathOf('set-null'))
    expect(onDisk).toEqual({ keep: 'v', remove: null })
  })

  it('override 整体替换内容并落盘', () => {
    const store = getStore('override')
    store.set('a', 1)
    store.override({ b: 2 })

    expect(store.get('a')).toBeUndefined()
    expect(readJson(storePathOf('override'))).toEqual({ b: 2 })
  })

  it('另开一个 Store 实例能读到已落盘的值（写入是完整的，不留半截文件）', () => {
    const store = getStore('persist')
    store.set('list', [1, 2, 3])

    const reopened = new Store(storePathOf('persist'))
    expect(reopened.get('list')).toEqual([1, 2, 3])
  })
})

describe('getStore', () => {
  it('同名返回同一个单例（模块级缓存，第二次调用的参数不再生效）', () => {
    const first = getStore('singleton')
    const second = getStore('singleton', false, false)
    expect(second).toBe(first)
  })

  it('文件损坏时默认备份为 .json.bak 并以空配置重建', () => {
    fs.writeFileSync(storePathOf('broken'), '{ not json', 'utf8')

    // isIgnoredError=true（默认）、isShowErrorAlert=false（不弹窗，便于断言）
    const store = getStore('broken', true, false)

    expect(store.has('anything')).toBe(false)
    // 原始（损坏的）内容被完整挪到备份文件里，交给用户手工修
    expect(fs.readFileSync(storePathOf('broken') + '.bak', 'utf8')).toBe('{ not json')
  })

  it('isShowErrorAlert 打开时会弹错误框并把备份文件的位置暴露出来（走 electron 桩）', () => {
    const showMessageBoxSync = stubMockOf(dialog, 'showMessageBoxSync')
    const showItemInFolder = stubMockOf(shell, 'showItemInFolder')
    showMessageBoxSync.mockClear()
    showItemInFolder.mockClear()
    fs.writeFileSync(storePathOf('broken-alert'), '{ not json', 'utf8')

    getStore('broken-alert', true, true)

    expect(showMessageBoxSync).toHaveBeenCalledTimes(1)
    expect(showItemInFolder).toHaveBeenCalledWith(storePathOf('broken-alert') + '.bak')
  })

  it('isIgnoredError=false 时直接把解析错误抛给上层（不备份、不重建）', () => {
    fs.writeFileSync(storePathOf('broken-throw'), '{ not json', 'utf8')

    expect(() => getStore('broken-throw', false)).toThrow()
    // 抛错路径下不做备份
    expect(fs.existsSync(storePathOf('broken-throw') + '.bak')).toBe(false)
  })
})
