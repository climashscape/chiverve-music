// 媒体资源的类型声明，与 `build-config/renderer/webpack.config.base.js` 的 asset 规则
// （`test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/`）对齐：小于 10KB 的会被 webpack 内联成
// data URL，所以统一按字符串声明。
//
// 放这里而不是 `src/common/types/`：渲染进程的 tsconfig（`src/renderer/tsconfig.json`）
// 没有 `include`，走默认的「本目录及子目录」规则，`src/common/types/*.d.ts` 不在程序里，
// 声明会不生效（ts-loader 报 TS2307）。
declare module '*.mp3' {
  const src: string
  export default src
}

declare module '*.wav' {
  const src: string
  export default src
}

declare module '*.ogg' {
  const src: string
  export default src
}

declare module '*.flac' {
  const src: string
  export default src
}

declare module '*.aac' {
  const src: string
  export default src
}

declare module '*.mp4' {
  const src: string
  export default src
}

declare module '*.webm' {
  const src: string
  export default src
}
