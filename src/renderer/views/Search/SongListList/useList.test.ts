import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listInfos, type SearchListInfo } from '@renderer/store/search/songlist/state'
import useList from './useList'

/**
 * 歌单搜索失败时的收口（票 03b，与 `Search/MusicList/useList.test.ts` 同一类缺陷）。
 *
 * 搜索页三个 tab 都从各自的 store action 取数，三个 action 都是「写完可读提示再把错重抛」；
 * 调用方（视图）原来谁都没接，于是 rejection 冒到顶层——dev 下就是 webpack-dev-server 的全屏
 * 浮层（`position:fixed; inset:0`），它会吞掉真实鼠标输入。
 *
 * 这里钉住：失败 → `noItemLabel` 是 `list__load_failed`（`SongCardGrid` 用 v-show 渲染它），
 * 且顶层收不到 unhandled rejection。
 */

const { songListSearchSdk } = vi.hoisted(() => ({ songListSearchSdk: vi.fn() }))

vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    sources: [{ id: 'tx', name: 'QQ音乐' }],
    tx: { songList: { search: songListSearchSdk } },
  },
}))
vi.mock('@renderer/store/search/action', () => ({ addHistoryWord: vi.fn() }))
// 本用例不挂路由：`onBeforeRouteLeave` 在路由组件外调用只会有告警
vi.mock('@common/utils/vueRouter', () => ({ onBeforeRouteLeave: vi.fn() }))

const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

const settle = async() => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('views/Search/SongListList/useList 的搜索失败收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign((listInfos as Record<'tx', SearchListInfo>).tx, {
      list: [],
      total: 0,
      page: 1,
      limit: 30,
      key: null,
      noItemLabel: '',
      tagId: '',
      sortId: '',
    })
  })

  it('搜索失败 → 提示「加载失败」，且没有未处理的 rejection', async() => {
    songListSearchSdk.mockRejectedValue(new Error('搜索失败'))
    const unhandled = trackUnhandledRejection()

    const { search } = useList()
    search('周杰伦', 'tx', 1)
    await settle()
    unhandled.stop()

    expect((listInfos as Record<'tx', SearchListInfo>).tx.noItemLabel).toBe(window.i18n.t('list__load_failed' as any))
    expect(unhandled.reasons).toEqual([])
  })
})
