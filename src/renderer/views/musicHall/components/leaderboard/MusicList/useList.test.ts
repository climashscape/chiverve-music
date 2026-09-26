import { beforeEach, describe, expect, it, vi } from 'vitest'
import useList from './useList'

/**
 * 排行榜「歌曲列表」两个取数动作的 rejection 收口（票 03b 同类）。
 *
 * - `getList` 里 `void getAndSetListDetail(...).then(...)`：store 的 catch 是「写可读提示
 *   （listDetailInfo.noItemLabel = list__load_failed）再重抛」，调用方不接就成未处理 rejection；
 * - `handlePlayList` 里 `void playSongListDetail(...)`：它会拉整榜（`getListDetailAll`），
 *   网络失败即 reject，原来同样没人接。
 *
 * 未处理 rejection 在 dev 下会让 webpack-dev-server 弹全屏浮层（`fixed; inset:0`）吞掉真实
 * 鼠标输入。这里把两个数据层动作换桩，钉住「调用后顶层收不到 rejection」。
 */

const { getAndSetListDetail, playSongListDetail } = vi.hoisted(() => ({
  getAndSetListDetail: vi.fn(),
  playSongListDetail: vi.fn(),
}))

vi.mock('@renderer/store/leaderboard/action', () => ({ getAndSetListDetail }))
vi.mock('../action', () => ({ playSongListDetail }))

const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

const settle = async() => { await new Promise(resolve => setTimeout(resolve, 0)) }

describe('leaderboard/MusicList/useList 的 rejection 收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAndSetListDetail 失败 → 无未处理的 rejection（提示由 store 写入 noItemLabel）', async() => {
    getAndSetListDetail.mockRejectedValue(new Error('榜单接口挂了'))
    const unhandled = trackUnhandledRejection()

    useList().getList('tx__1', 1)
    await settle()
    unhandled.stop()

    expect(getAndSetListDetail).toHaveBeenCalledWith('tx__1', 1)
    expect(unhandled.reasons).toEqual([])
  })

  it('playSongListDetail 失败 → 无未处理的 rejection', async() => {
    playSongListDetail.mockRejectedValue(new Error('拉整榜失败'))
    const unhandled = trackUnhandledRejection()

    useList().handlePlayList(0)
    await settle()
    unhandled.stop()

    expect(playSongListDetail).toHaveBeenCalledTimes(1)
    expect(unhandled.reasons).toEqual([])
  })

  it('正常取数不回归：resolve 后照常走滚动复位分支', async() => {
    getAndSetListDetail.mockResolvedValue(undefined)
    const unhandled = trackUnhandledRejection()

    const { getList } = useList()
    getList('tx__1', 1)
    await settle()
    unhandled.stop()

    expect(getAndSetListDetail).toHaveBeenCalledWith('tx__1', 1)
    expect(unhandled.reasons).toEqual([])
  })
})
