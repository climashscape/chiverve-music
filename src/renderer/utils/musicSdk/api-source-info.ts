// Support qualitys: 128k 320k flac wav

const sources: Array<{
  id: string
  name: string
  disabled: boolean
  supportQualitys: Partial<Record<LX.OnlineSource, LX.Quality[]>>
}> = [
  {
    // 本项目的内置音源：QQ 音乐取流（M3）。id 会拼成 allApi 的 key `builtin_tx`。
    id: 'builtin',
    name: '内置 QQ 音乐',
    disabled: false,
    // ⚠️ 数组顺序有语义：下载路径在「请求档不在支持列表」时取 list[list.length - 1]
    // 作回退（src/renderer/worker/download/utils.ts:57-66）。这里按升序写，与本列表
    // 在 UI 上的展示顺序一致；请求档必然是这四档之一（守卫来自本表）。
    supportQualitys: {
      tx: ['128k', '320k', 'flac', 'flac24bit'],
    },
  },
  // {
  //   id: 'test',
  //   name: '测试接口',
  //   disabled: false,
  //   supportQualitys: {
  //     kw: ['128k'],
  //     kg: ['128k'],
  //     tx: ['128k'],
  //     wy: ['128k'],
  //     mg: ['128k'],
  //     // bd: ['128k'],
  //   },
  // },
  // {
  //   id: 'temp',
  //   name: '临时接口',
  //   disabled: false,
  //   supportQualitys: {
  //     kw: ['128k'],
  //   },
  // },
]

export default sources
