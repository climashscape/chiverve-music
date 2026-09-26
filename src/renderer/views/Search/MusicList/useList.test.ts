import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listInfos, type ListInfo } from '@renderer/store/search/music/state'
import useList from './useList'

/**
 * 搜索失败时的收口（票 03b）。
 *
 * 真机现象：`musicSearch` 的 rejection 沿 store 的 `search` 冒到顶层——
 *   - dev：webpack-dev-server 客户端监听 `window` 的 `unhandledrejection`，据此弹
 *     全屏浮层（`position:fixed; inset:0`），把**真实鼠标输入**一起吞掉（界面看着正常却点不动）；
 *   - 生产：同样是「未处理的 rejection」（只是没有浮层）。
 *
 * 这里钉住失败路径的**两个行为**（不是实现细节）：
 *   1. 界面拿到可读提示——store 写进 `noItemLabel` 的 `list__load_failed`（视图只渲染这个字段，
 *      `material-online-list` 的 `no-item`）；
 *   2. 顶层**收不到** unhandled rejection——这是浮层 / 鼠标被吞的唯一触发条件。
 *
 * 只把最外层 SDK 换成桩：store 的 catch（写提示 + 重抛）与视图的收口都真跑。
 */

const { searchSdk } = vi.hoisted(() => ({ searchSdk: vi.fn() }))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    sources: [{ id: 'tx', name: 'QQ音乐' }],
    tx: { musicSearch: { search: searchSdk } },
  },
}))
// 历史词写入（走 IPC）与播放队列都不是本用例的判据，桩掉
vi.mock('@renderer/store/search/action', () => ({ addHistoryWord: vi.fn() }))
vi.mock('@renderer/core/player/action', () => ({ playMusicList: vi.fn() }))

/** 顶层未处理 rejection 的探针：Node 在微任务清空后的下一轮事件循环里 emit */
const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

/** 等两轮宏任务：store 的 `.catch` → 视图的 `.catch` → 未处理判定落定 */
const settle = async() => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

/** `listInfos` 按源存放（Partial，加源时不用改结构）；本用例只跟 tx 打交道，先收窄一次 */
const txInfos = listInfos as Record<'tx', ListInfo>

const resetListInfo = () => {
  Object.assign(txInfos.tx, {
    list: [],
    total: 0,
    page: 1,
    maxPage: 0,
    key: null,
    noItemLabel: '',
  })
}

/** 一首 tx 在线歌（`toNewMusicInfo` 要的形状：songmid + types/_types） */
const song = {
  songmid: 'a1',
  name: '歌a',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  types: {},
  _types: {},
}

describe('views/Search/MusicList/useList 的搜索失败收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetListInfo()
  })

  it('搜索失败 → 提示「加载失败」，且没有未处理的 rejection', async() => {
    searchSdk.mockRejectedValue(new Error('搜索失败'))
    const unhandled = trackUnhandledRejection()

    const { search } = useList()
    search('周杰伦', 'tx', 1)
    await settle()
    unhandled.stop()

    // 提示：视图只渲染 noItemLabel，store 失败时写的就是 `list__load_failed` 的文案
    expect(txInfos.tx.noItemLabel).toBe(window.i18n.t('list__load_failed' as any))
    // 收口：没有冒到顶层的 rejection（dev 浮层与鼠标被吞的唯一触发条件）
    expect(unhandled.reasons).toEqual([])
  })

  it('正常搜索不回归：列表写回 listInfo、失败/空态文案清掉、无多余 rejection', async() => {
    searchSdk.mockResolvedValue({ list: [song], allPage: 1, limit: 30, total: 1, source: 'tx' })
    const unhandled = trackUnhandledRejection()

    const { search } = useList()
    search('周杰伦', 'tx', 1)
    await settle()
    unhandled.stop()

    expect(txInfos.tx.list).toHaveLength(1)
    expect(txInfos.tx.noItemLabel).toBe('')
    expect(unhandled.reasons).toEqual([])
  })
})
