import { Worker } from 'node:worker_threads'
import * as Comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/esm/node-adapter'
import { log } from '@common/utils'

export type DBSeriveTypes = Comlink.Remote<LX.WorkerDBSeriveListTypes>

/**
 * dbService worker 的创建与**监督**。
 *
 * 为什么需要这一层（2026-09-26 全历史自审查发现）：worker 一拍死（原生 addon 加载失败 / OOM /
 * 未捕获异常），comlink 的调用就**再也不会 settle**——界面一直转圈到用户重启应用，而此前连一条
 * 日志都不会有。现在：
 * - `error` / `exit` 都会留下日志，写清后果与恢复方式；
 * - 非正常退出后把代理置空，**下一次调用会重建 worker**（已在飞的那几个调用救不回来——
 *   comlink 没有「拒绝全部 pending」的口子，这是它能力的边界）；
 * - 5 秒内再次死亡视为「一起来就死」的崩溃循环，不再自动重建，之后的调用**显式抛错**
 *   （让调用方拿到 rejection，而不是永久挂起），日志里说明要重启应用。
 */

/** 两次死亡间隔小于它 → 判为崩溃循环，停止自动重建（避免空转刷日志） */
const RESTART_GUARD_MS = 5000

let currentWorker: Worker | null = null
let currentProxy: DBSeriveTypes | null = null
let lastExitAt = 0
let giveUp = false

const create = (): DBSeriveTypes => {
  const worker: Worker = new Worker(new URL(
    /* webpackChunkName: 'dbService.worker' */
    '../dbService',
    import.meta.url,
  ))
  currentWorker = worker

  worker.on('error', (error) => {
    log.error('[dbService] worker 抛错（数据库相关调用可能不再返回）：', error)
  })
  worker.on('exit', (code) => {
    // 只认「当前这个」worker 的退出：重建后旧 worker 的收尾事件不该影响新代理
    if (worker !== currentWorker) return
    currentWorker = null
    currentProxy = null

    const now = Date.now()
    if (now - lastExitAt < RESTART_GUARD_MS) {
      giveUp = true
      log.error(`[dbService] worker 反复退出（code=${code}）——不再自动重建，数据库相关功能不可用，请重启应用`)
    } else {
      log.error(`[dbService] worker 意外退出（code=${code}）——下次数据库调用会重建 worker；已在飞的调用不会返回`)
    }
    lastExitAt = now
  })

  return Comlink.wrap<LX.WorkerDBSeriveListTypes>(nodeEndpoint(worker))
}

/** 取 dbService 代理（首次调用时创建；worker 意外退出后会重建）。 */
export const getDBServiceWorker = (): DBSeriveTypes => {
  if (currentProxy == null) {
    if (giveUp) throw new Error('[dbService] worker 已停止（反复退出），请重启应用')
    currentProxy = create()
  }
  return currentProxy
}
