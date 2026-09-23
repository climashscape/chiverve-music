import { ref, shallowReactive } from '@common/utils/vueTools'
import defaultSetting from '@common/defaultSetting'

/**
 * 歌词窗需要的设置 key——**这里只声明「要哪些 key」，值一律现从 `@common/defaultSetting` 取**
 * （设置页重构票 12：默认值的唯一来源是 `defaultSetting.ts`）。
 *
 * 旧实现逐条手写了一份默认值镜像，与 `defaultSetting` 漂移了 9 处（isShowTaskbar / pauseHide /
 * isLockScreen / 三个 isFontWeight* / isZoomActiveLrc / isPlayLxlrc / common.langId）：
 * 镜像值只在「主进程下发的真值进 store 之前」被读到，两端不一致时歌词窗显示的是设置页的反面。
 * 平台相关的默认（`isLockScreen` = `isWin`、`isPlayLxlrc` = `!isMac`）也在这里一并解决——
 * 歌词窗与主窗同机，不要再算一遍。
 *
 * 写成 `satisfies Record<keyof LX.DesktopLyric.Config, true>` 而不是数组：
 * 类型侧（`common/types/desktop_lyric.d.ts`）加 key 而这里漏写，或多写、拼错都是**编译期**报错；
 * 数组 + `satisfies readonly (keyof …)[]` 只管得住拼错。三个歌词颜色 key 不在此列——
 * 它们已不是设置项，只由主题派生（ADR-0007，见 `utils/lyricColors.ts`）。
 */
const lyricConfigKeys = {
  'desktopLyric.enable': true,
  'desktopLyric.isLock': true,
  'desktopLyric.isAlwaysOnTop': true,
  'desktopLyric.isAlwaysOnTopLoop': true,
  'desktopLyric.isShowTaskbar': true,
  'desktopLyric.pauseHide': true,
  'desktopLyric.audioVisualization': true,
  'desktopLyric.width': true,
  'desktopLyric.height': true,
  'desktopLyric.x': true,
  'desktopLyric.y': true,
  'desktopLyric.isLockScreen': true,
  'desktopLyric.isDelayScroll': true,
  'desktopLyric.scrollAlign': true,
  'desktopLyric.isHoverHide': true,
  'desktopLyric.direction': true,
  'desktopLyric.style.align': true,
  'desktopLyric.style.font': true,
  'desktopLyric.style.fontSize': true,
  'desktopLyric.style.lineGap': true,
  // 'desktopLyric.style.fontWeight': true,
  'desktopLyric.style.opacity': true,
  'desktopLyric.style.ellipsis': true,
  'desktopLyric.style.isFontWeightFont': true,
  'desktopLyric.style.isFontWeightLine': true,
  'desktopLyric.style.isFontWeightExtended': true,
  'desktopLyric.style.isZoomActiveLrc': true,
  'common.langId': true,
  'player.isShowLyricTranslation': true,
  'player.isShowLyricRoma': true,
  'player.isSwapLyricTranslationAndRoma': true,
  'player.isPlayLxlrc': true,
  'player.playbackRate': true,
} satisfies Record<keyof LX.DesktopLyric.Config, true>

/**
 * 取子集。
 *
 * 歌词窗是独立渲染进程，但这条 import 与主窗同源同路：`defaultSetting.ts` 只依赖
 * `node:path` / `node:os`，两个渲染进程的 webpack target 都是 `electron-renderer`、
 * 窗口都是 `nodeIntegration: true`（`main/modules/winLyric/main.ts:181-190`），
 * 主窗（`renderer/store/setting.ts:2`）早就直接 import 它。
 * 子集里的值全是布尔/数字/字符串/null，**没有对象值**，所以也不存在「两个进程共享同一个可变引用」。
 */
const pickLyricConfig = (): LX.DesktopLyric.Config => Object.fromEntries(
  Object.keys(lyricConfigKeys).map(key => [key, defaultSetting[key as keyof LX.AppSetting]]),
) as LX.DesktopLyric.Config

export const setting = shallowReactive<LX.DesktopLyric.Config>(pickLyricConfig())

// export const themeList = markRaw([
//   {
//     id: 0,
//     className: 'green',
//   },
//   {
//     id: 1,
//     className: 'yellow',
//   },
//   {
//     id: 2,
//     className: 'blue',
//   },
//   {
//     id: 3,
//     className: 'red',
//   },
//   {
//     id: 4,
//     className: 'pink',
//   },
//   {
//     id: 5,
//     className: 'purple',
//   },
//   {
//     id: 6,
//     className: 'orange',
//   },
//   {
//     id: 7,
//     className: 'grey',
//   },
//   {
//     id: 8,
//     className: 'ming',
//   },
//   {
//     id: 9,
//     className: 'blue2',
//   },
// ])

// export type Status = 'playing' | 'paused' | 'stopped'

// export const status = ref<Status>('stopped')
export const isPlay = ref(false)

export const musicInfo = shallowReactive<{
  id: string | null
  name: string
  singer: string
  album: string | null
}>({
  id: null,
  name: '^',
  singer: '^',
  album: null,
})
