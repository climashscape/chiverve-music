import { collectMusic, dislikeMusic, pause, play, playNext, playPrev, togglePlay, uncollectMusic } from '@renderer/core/player'

type Action = 'play' | 'pause' | 'skipNext' | 'skipPrev' | 'togglePlay' | 'collect' | 'uncollect' | 'dislike'

export default () => {
  return async(action: Action) => {
    switch (action) {
      case 'play':
        play()
        break
      case 'pause':
        pause()
        break
      case 'skipNext':
        playNext()
        break
      case 'skipPrev':
        playPrev()
        break
      case 'togglePlay':
        togglePlay()
        break
      case 'collect':
        collectMusic()
        break
      case 'uncollect':
        uncollectMusic()
        break
      case 'dislike':
        // 收口：`dislikeMusic` 里是两次可能 reject 的 await（写「不喜欢」的 IPC、切下一首），
        // 不接住就会漏到顶层——dev 下 webpack-dev-server 据此弹全屏浮层（fixed; inset:0）吞掉真实
        // 鼠标输入（票 03b），生产下也是未处理异常。deeplink 是一次性动作，这里只收口 + 留上下文日志。
        void dislikeMusic().catch((err: any) => {
          console.log('[deeplink] dislike', err)
        })
        break
      default: throw new Error('Unknown action: ' + (action as any ?? ''))
    }
  }
}
