import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOWNLOAD_STATUS } from '@common/constants'
import { appSetting } from '@renderer/store/setting'
import { startDownloadTasks } from './action'

/**
 * 下载任务「歌词保存」的 rejection 收口（票 03b 同类）。
 *
 * `complete` 事件后任务已置为「已完成」，随后才去取歌词写 `.lrc`。取歌词失败原来没人接：
 * 后果是**下载显示「已完成」但歌词静默缺失**，而且这条 rejection 会漏到顶层——dev 下
 * webpack-dev-server 据此弹全屏浮层（`position:fixed; inset:0`）吞掉真实鼠标输入。
 *
 * 这里跑真实下载流程（`startDownloadTasks` → worker 回调 `complete` → `downloadLyric`），
 * 只桩掉 IPC、取流 / 取歌词与 worker。钉住：任务仍是 COMPLETED（不因歌词失败回退）、
 * 不调用 `saveLrc`、且没有未处理的 rejection。
 */

const {
  getMusicUrl,
  getPicUrl,
  getLyricInfo,
  downloadTasksUpdate,
  worker,
} = vi.hoisted(() => ({
  getMusicUrl: vi.fn(),
  getPicUrl: vi.fn(),
  getLyricInfo: vi.fn(),
  downloadTasksUpdate: vi.fn(),
  worker: {
    startTask: vi.fn(),
    writeMeta: vi.fn(),
    saveLrc: vi.fn(),
    removeTask: vi.fn(),
    updateUrl: vi.fn(),
  },
}))

vi.mock('@renderer/utils/ipc', () => ({
  downloadTasksGet: vi.fn(),
  downloadTasksCreate: vi.fn(),
  downloadTasksRemove: vi.fn(),
  downloadTasksUpdate,
}))
vi.mock('@renderer/core/music/online', () => ({ getMusicUrl, getPicUrl, getLyricInfo }))
vi.mock('@renderer/worker/utils', () => ({ proxyCallback: (callback: any) => callback }))
vi.mock('@renderer/plugins/Dialog', () => ({ dialog: vi.fn() }))

const trackUnhandledRejection = () => {
  const reasons: unknown[] = []
  const listener = (reason: unknown) => { reasons.push(reason) }
  process.on('unhandledRejection', listener)
  return {
    reasons,
    stop: () => { process.off('unhandledRejection', listener) },
  }
}

/** 多轮宏任务：complete 回调里 saveMeta / downloadLyric 两条链都是异步的 */
const settle = async(rounds = 4) => {
  for (let i = 0; i < rounds; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

const createTask = () => ({
  id: 'download_1',
  status: DOWNLOAD_STATUS.PAUSE,
  statusText: '',
  progress: 0,
  total: 0,
  downloaded: 0,
  speed: '',
  writeQueue: 0,
  metadata: {
    musicInfo: {
      id: 'tx__song1',
      source: 'tx',
      name: '歌',
      singer: '手',
      meta: { picUrl: 'http://pic' },
    },
    quality: '320k',
    filePath: '/tmp/歌 - 手.mp3',
    fileName: '歌 - 手.mp3',
    url: '',
    listId: 'default',
  },
}) as unknown as LX.Download.ListItem

describe('store/download 保存歌词失败时的收口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window.lx as any).worker = { download: worker }
    worker.startTask.mockImplementation(async(_task: any, _savePath: any, _skip: any, callback: any) => {
      // worker 的 complete 事件：任务已完成，接着才会去写 meta 与歌词
      callback({ action: 'complete' })
    })
    worker.writeMeta.mockResolvedValue(undefined)
    worker.saveLrc.mockResolvedValue(undefined)
    worker.removeTask.mockResolvedValue(undefined)
    getMusicUrl.mockResolvedValue('http://audio/320.mp3')
    getPicUrl.mockResolvedValue('http://pic')
    getLyricInfo.mockRejectedValue(new Error('取歌词失败'))
    appSetting['download.isDownloadLrc'] = true
    appSetting['download.isEmbedPic'] = false
    appSetting['download.isEmbedLyric'] = false
  })

  it('取歌词失败 → 任务仍为「已完成」，不写 .lrc，且没有未处理的 rejection', async() => {
    const unhandled = trackUnhandledRejection()
    const task = createTask()

    await startDownloadTasks([task])
    await settle()
    unhandled.stop()

    expect(task.status).toBe(DOWNLOAD_STATUS.COMPLETED)
    expect(getLyricInfo).toHaveBeenCalledTimes(1)
    expect(worker.saveLrc).not.toHaveBeenCalled()
    expect(unhandled.reasons).toEqual([])
  })

  it('取歌词成功 → 照常写 .lrc（失败收口不影响正常路径）', async() => {
    getLyricInfo.mockResolvedValue({ lyric: '[00:00.00]歌词', tlyric: '', rlyric: '', lxlyric: '' })
    const unhandled = trackUnhandledRejection()
    const task = createTask()

    await startDownloadTasks([task])
    await settle()
    unhandled.stop()

    expect(task.status).toBe(DOWNLOAD_STATUS.COMPLETED)
    expect(worker.saveLrc).toHaveBeenCalledTimes(1)
    expect(unhandled.reasons).toEqual([])
  })
})
