import { beforeEach, describe, expect, it, vi } from 'vitest'
import useList from './useList'

/**
 * 歌单详情「歌曲列表」取数与播放的 rejection 收口（票 03b 同类）。
 *
 * `getListData` 由 `index.vue` 两处 `void getListData(...)` 调用，原来 await 的 rejection
 * 直接顺着 async 函数漏到顶层；`handlePlayList` 的 `playSongListDetail` 会拉整张歌单，
 * 网络失败即 reject。两者在 dev 下都会让 webpack-dev-server 弹全屏浮层（`fixed; inset:0`）
 * 吞掉真实鼠标输入，生产下是未处理异常。这里把数据层换桩，钉住「调用后顶层收不到 rejection」。
 */

const { getAndSetListDetail, playSongListDetail } = vi.hoisted(() => ({
  getAndSetListDetail: vi.fn(),
  playSongListDetail: vi.fn(),
}))

vi.mock('@renderer/store/songList/action', () => ({ getAndSetListDetail }))
vi.mock('./action', () => ({ playSongListDetail }))

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

describe('songList/Detail/useList 的 rejection 收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAndSetListDetail 失败 → getListData 不 reject、无未处理 rejection', async() => {
    getAndSetListDetail.mockRejectedValue(new Error('歌单接口挂了'))
    const unhandled = trackUnhandledRejection()

    await expect(useList().getListData('tx', 'slist1', 1, false)).resolves.toBeUndefined()
    await settle()
    unhandled.stop()

    expect(getAndSetListDetail).toHaveBeenCalledWith('slist1', 'tx', 1, false)
    expect(unhandled.reasons).toEqual([])
  })

  it('playSongListDetail 失败 → 无未处理的 rejection', async() => {
    playSongListDetail.mockRejectedValue(new Error('拉整张歌单失败'))
    const unhandled = trackUnhandledRejection()

    useList().handlePlayList(0)
    await settle()
    unhandled.stop()

    expect(playSongListDetail).toHaveBeenCalledTimes(1)
    expect(unhandled.reasons).toEqual([])
  })

  it('正常取数不回归：getListData resolve', async() => {
    getAndSetListDetail.mockResolvedValue(undefined)
    const unhandled = trackUnhandledRejection()

    await expect(useList().getListData('tx', 'slist1', 1, false)).resolves.toBeUndefined()
    await settle()
    unhandled.stop()

    expect(unhandled.reasons).toEqual([])
  })
})
