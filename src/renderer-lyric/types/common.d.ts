// 歌词窗需要 LX.AppSetting：utils/lyricColors.ts 要拿内置默认歌词色做比对，
// 而 types/desktop_lyric.d.ts 的属性类型本身就是 `LX.AppSetting[...]` 的引用。
// 上游把它注掉是因为当时用不到；开了之后这份声明才在歌词窗的 ts 程序里可见。
import '@common/types/app_setting'
// import '@common/types/common'
// import '@common/types/user_api'
// import '@common/types/sync'
// import '@common/types/music'
// import '@common/types/list'
// import '@common/types/download_list'
// import '@common/types/player'
import '@common/types/shims_vue'
// import '@common/types/utils'
import '@common/types/theme'
import '@common/types/desktop_lyric'
import '@common/types/ipc_renderer'
