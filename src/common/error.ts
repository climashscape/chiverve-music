import { log } from './utils'

const ignoreErrorMessage = [
  'Possible side-effect in debug-evaluate',
  'Unexpected end of input',
]

process.on('uncaughtException', err => {
  if (ignoreErrorMessage.includes(err?.message)) return
  console.error('An uncaught error occurred!')
  console.error(err)
  log.error(err)
})
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at: Promise ', p)
  console.error(' reason: ', reason)
  log.error(reason)
})

/**
 * 渲染侧异常兜底：**只做记录，不负责阻止 dev 的全屏浮层**。
 *
 * 上面两条 `process.on(...)` 只管 Node 侧（主进程 / 各 worker）：渲染进程里没人接的 rejection
 * 是 Blink 以 `unhandledrejection` 事件发到 `window` 的，`process.on('unhandledRejection')`
 * 收不到。2026-09-26 票 03b 的真机实测：Node 侧 handler 在、webpack-dev-server 的全屏浮层
 * （`position:fixed; inset:0`，会吞掉真实鼠标输入）照样弹、window 侧计数为 1 ——
 * **别指望这里能拦下浮层**，该修的仍然是「调用方把 rejection 接住」（范式见 2cbca6f）。
 * 这里只把渲染侧没人接的异常写进日志，方便排查「界面看着正常却点不动」这类问题。
 */
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    console.error('Unhandled Rejection at: window')
    console.error(' reason: ', reason)
    log.error(reason)
  })
  window.addEventListener('error', (event) => {
    // 同一个事件也覆盖资源加载失败（img/script）：那时没有 `error`，`message` 也可能为空，
    // 用 error.message → event.message → 出错元素的信息依次兜底，别只记一个 undefined
    if (ignoreErrorMessage.includes(event.error?.message)) return
    const target = event.target instanceof Element ? event.target : null
    const reason = event.error ?? (event.message || (target ? `资源加载失败：<${target.tagName.toLowerCase()}> ${(target as HTMLImageElement).src ?? ''}` : '未知错误'))
    console.error('An uncaught error occurred in renderer!')
    console.error(reason)
    log.error(reason)
  })
}
