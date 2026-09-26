<template>
  <div :class="$style.content">
    <canvas ref="dom_canvas" :class="$style.canvas" />
  </div>
</template>

<script>
import { ref, onBeforeUnmount, onMounted, watch } from '@common/utils/vueTools'
import { useEvent, getAnalyserDataArray } from '@lyric/core/mainWindowChannel'
// import { getAnalyser } from '@renderer/plugins/player'
import { isPlay, setting } from '@lyric/store/state'

// const themes = {
//   green: 'rgba(77,175,124,.16)',
//   blue: 'rgba(52,152,219,.16)',
//   yellow: 'rgba(233,212,96,.22)',
//   orange: 'rgba(245,171,53,.16)',
//   red: 'rgba(214,69,65,.12)',
//   pink: 'rgba(241,130,141,.16)',
//   purple: 'rgba(155,89,182,.14)',
//   grey: 'rgba(108,122,137,.16)',
//   ming: 'rgba(51,110,123,.14)',
//   blue2: 'rgba(79,98,208,.14)',
//   black: 'rgba(39,39,39,.4)',
//   mid_autumn: 'rgba(74,55,82,.1)',
//   naruto: 'rgba(87,144,167,.15)',
//   happy_new_year: 'rgba(192,57,43,.1)',
// }

const getBarWidth = canvasWidth => {
  let barWidth = (canvasWidth / 128) * 2.5
  const width = canvasWidth / 86
  const diffWidth = barWidth - width
  // console.log(barWidth - width)
  // if (barWidth - width > 20) newBarWidth = 20
  // barWidth = newBarWidth
  return diffWidth > 32
    ? canvasWidth / 128 // 4k屏、超宽屏直接显示所有频谱条
    : diffWidth > 12 ? width : barWidth
}
export default {
  setup() {
    const dom_canvas = ref(null)

    let ctx
    // let bufferLength = 0
    // let dataArray
    let WIDTH
    let HEIGHT
    let MAX_HEIGHT
    let barWidth
    let barHeight
    let x = 0
    let isPlaying = false
    let animationFrameId

    let num
    let mult
    const maxNum = 255
    let frequencyAvg = 0

    // const theme = useRefGetter('theme')
    // const setting = useRefGetter('setting')
    // let themeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-light-200-alpha-800')
    // watch(theme, theme => {
    // 上游把「取主题色」注释掉后留了写死的白色兜底，这里恢复成主题色：
    // 主题变量由 `window.setTheme` 写在 `:root` 上（见 renderer-lyric/index.html），
    // 所以从 `document.documentElement` 的计算样式里读它的字面量。
    // ⚠️ 别读 `getComputedStyle(dom_canvas).color`：那个值永远给解析后的 used value
    // （变量缺失时回落到继承的 color），不是空串，兜底分支永远不可达（2026-09-26 复核）；
    // `getPropertyValue` 在变量没定义时**真的返回空串**，兜底才有意义。
    const resolveThemeColor = () => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-light-200-alpha-800')
      // canvas 的 fillStyle 只认具体颜色值，所以要在这里把 var() 解析成字面量
      return color.trim() || 'rgba(255, 255, 255, .12)' // 主题变量缺失时的兜底（等于上游写死的那支白）
    }
    let themeColor = 'rgba(255, 255, 255, .12)'
    // 主题变化时 window.setTheme 会重写 <style> 的内容，用 MutationObserver 跟上（没有专门的主题事件可用）
    let themeObserver
    // })

    useEvent((event) => {
      if (event.action == 'send_analyser_data_array') {
        // console.log(event.action)
        renderFrame(event.data)
      }
    })

    // https://developer.mozilla.org/zh-CN/docs/Web/API/AnalyserNode/smoothingTimeConstant
    const renderFrame = (dataArray) => {
      x = 0

      // console.log(dataArray)
      // analyser.getByteFrequencyData(dataArray)

      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      // ctx.fillRect(0, 0, WIDTH, HEIGHT)
      ctx.fillStyle = themeColor

      for (let i = 0; i < dataArray.length; i++) {
        mult = Math.floor(i / maxNum)
        num = mult % 2 === 0 ? (i - maxNum * mult) : (maxNum - (i - maxNum * mult))
        let spectrum = num > 90 ? 0 : dataArray[num + 20]
        frequencyAvg += spectrum * 1.4
      }
      frequencyAvg /= dataArray.length
      frequencyAvg *= 1.6

      frequencyAvg = frequencyAvg / maxNum
      // ctx.scale(1, 1 + frequencyAvg)

      for (let i = 0; i < dataArray.length; i++) {
        if (x > WIDTH) break

        barHeight = dataArray[i]

        // let r = barHeight + (25 * (i / bufferLength))
        // let g = 250 * (i / bufferLength)
        // let b = 50

        // ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'
        barHeight = (barHeight * frequencyAvg + barHeight * 0.42) * MAX_HEIGHT
        ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight)

        x += barWidth
      }

      animationFrameId = null
      if (isPlaying) animationFrameId = window.requestAnimationFrame(getAnalyserDataArray)
    }

    const handlePlay = () => {
      isPlaying = true
      // analyser.fftSize = 256
      // bufferLength = analyser.frequencyBinCount
      // console.log(bufferLength)
      barWidth = getBarWidth(WIDTH)
      // dataArray = new Uint8Array(bufferLength)
      // renderFrame()
      getAnalyserDataArray()
    }


    const handlePause = () => {
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
      isPlaying = false
    }

    const handleResize = () => {
      const canvas = dom_canvas.value
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
      WIDTH = canvas.width
      HEIGHT = canvas.height
      MAX_HEIGHT = Math.round(HEIGHT * 0.46 / 255 * 10000) / 10000
      // console.log(MAX_HEIGHT)
      barWidth = getBarWidth(WIDTH)
      themeColor = resolveThemeColor()
    }

    watch(isPlay, (isPlay) => {
      if (isPlay) handlePlay()
      else handlePause()
    })
    watch(() => setting['desktopLyric.audioVisualization'], (enable) => {
      if (!enable) handlePause()
    })
    window.addEventListener('resize', handleResize)
    onBeforeUnmount(() => {
      handlePause()
      themeObserver?.disconnect()
      window.removeEventListener('resize', handleResize)
    })

    onMounted(() => {
      const canvas = dom_canvas.value
      ctx = canvas.getContext('2d')
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
      WIDTH = canvas.width
      HEIGHT = canvas.height
      MAX_HEIGHT = Math.round(HEIGHT * 0.46 / 255 * 10000) / 10000
      themeColor = resolveThemeColor()
      themeObserver = new MutationObserver(() => {
        themeColor = resolveThemeColor()
      })
      themeObserver.observe(window.dom_style_theme, { childList: true, characterData: true, subtree: true })

      // console.log(MAX_HEIGHT)
      if (isPlay.value) handlePlay()
    })

    return {
      dom_canvas,
    }
  },
}
</script>

<style lang="less" module>
.content {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
}
.canvas {
  width: 100%;
  height: 100%;
  // 主题色不再挂在这里：从 `:root` 的 CSS 变量读字面量（见 script 的 resolveThemeColor）
}
</style>
