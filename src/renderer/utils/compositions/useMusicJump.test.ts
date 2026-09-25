import { beforeEach, describe, expect, it, vi } from 'vitest'
import useMusicJump from './useMusicJump'

/**
 * `useMusicJump.toSongDetail`（ui-polish-followups 工单 03）。
 *
 * 三个列表的同名菜单项（`list__source_detail`）现在共用这一个入口，所以这里钉住的就是三处共用的判据：
 * 在线歌曲进**本仓**的 `/songDetail`（带 source 与 mid），本地文件与「没有在线 mid」的行什么都不做。
 * 原来三处各写一套，于是漂移成「一处进本仓页面、一处开 QQ 网页」（用户报的就是这个）。
 *
 * 路由与外部依赖全部 mock：本测试只关心跳转参数，不关心页面渲染与请求。
 */
const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('@common/utils/vueRouter', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@common/utils/electron', () => ({ openUrl: vi.fn(), clipboardWriteText: vi.fn() }))
vi.mock('@renderer/plugins/Dialog', () => ({ dialog: vi.fn() }))
vi.mock('@renderer/plugins/i18n', () => ({ useI18n: () => (key: string) => key }))
vi.mock('@renderer/utils/musicSdk', () => ({
  default: {
    tx: {
      getMusicDetailPageUrl: () => 'https://y.qq.com/n/yqq/song/x.html',
      getAlbumDetailPageUrl: () => '',
    },
  },
}))

const txMusic = (songId: string | number): LX.Music.MusicInfoOnline => ({
  id: `tx_${songId}`,
  name: '歌名',
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { songId, albumName: '专辑', qualitys: [], _qualitys: {}, strMediaMid: '' },
})

const localMusic = (filePath: string): LX.Music.MusicInfoLocal => ({
  id: `local_${filePath}`,
  name: '本地歌',
  singer: '歌手',
  source: 'local',
  interval: '03:00',
  meta: { songId: filePath, albumName: '', filePath, ext: 'mp3' },
})

describe('utils/compositions/useMusicJump 的歌曲详情跳转', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('在线歌曲：进本仓 /songDetail，mid 取 meta.songId（不是网页链接）', () => {
    const { toSongDetail } = useMusicJump()

    toSongDetail(txMusic('001Qu4J42yg8uu'))

    expect(mocks.push).toHaveBeenCalledWith({
      path: '/songDetail',
      query: { source: 'tx', mid: '001Qu4J42yg8uu' },
    })
  })

  it('本地文件：不跳（meta.songId 是文件路径，没有在线 mid）', () => {
    const { toSongDetail } = useMusicJump()

    toSongDetail(localMusic('/music/song.mp3'))

    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('取不到 mid（空串）与空对象：都不跳，而不是跳进一个进不去的页面', () => {
    const { toSongDetail } = useMusicJump()

    toSongDetail({ ...txMusic(''), meta: { ...txMusic('').meta, songId: '' } })
    toSongDetail(null)

    expect(mocks.push).not.toHaveBeenCalled()
  })
})
