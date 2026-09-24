import { useI18n } from '@renderer/plugins/i18n'
import { dialog } from '@renderer/plugins/Dialog'
import {
  canFavSongInCloud, favErrorText, isFavSongInCloud, loadFavSongIds, toggleFavSongToCloud,
} from '@renderer/store/user/action'

/**
 * 「我喜欢」的共用行为（ui-polish-3 工单 06）：在线歌曲表与本地列表歌曲表、播放栏三处共用这一份，
 * 免得各写一套判定、文案与失败提示（同 `useMusicJump` 的分工：判定与动作在 store，
 * 这里只负责「显示成什么＋点下去做什么」）。
 *
 * 「我喜欢」= QQ 云端的 dirId=201 目录，**本地收藏已取消**（2026-09-24），所以这里只有云端一条路。
 * 状态读 store/user 的收藏全量 id 集合（shallowReactive，写成功后就地增删 → 界面立刻跟着变）。
 *
 * 三个函数都按参数取歌而不是持有状态：调用方（右键菜单 / 播放栏）各自决定「当前是哪一首」。
 */
export default () => {
  const t = useI18n()

  /** 不能收藏的歌（本地文件等）**不显示**键/菜单项，别让它点了才报错。 */
  const canFav = (musicInfo: LX.Music.MusicInfoOnline | null | undefined) => canFavSongInCloud(musicInfo)

  /**
   * 键名 / 菜单项名：**随当前状态变**（已在我喜欢里 → 「取消喜欢」）。
   * 复用既有 key，不另造一套文案：`list_add__cloud_fav`（收藏到 QQ 音乐「我喜欢」）/ `list__unlove`。
   * ⚠️ 它只是**显示**用的判据；动作分支必须走 `toggleFav`（它自己先等状态加载完）。
   */
  const favTitle = (musicInfo: LX.Music.MusicInfoOnline | null | undefined) =>
    isFavSongInCloud(musicInfo) ? t('list__unlove') : t('list_add__cloud_fav')

  /**
   * 点一下：已在我喜欢里 → 移除，不在 → 加入；失败弹提示（未登录 → 「请先登录 QQ 音乐」）。
   * 不静默——收藏是用户主动动作，静默失败会让人以为已经生效。
   */
  const toggleFav = async(musicInfo: LX.Music.MusicInfoOnline | null | undefined): Promise<void> => {
    if (!canFavSongInCloud(musicInfo)) return
    try {
      await toggleFavSongToCloud(musicInfo!)
    } catch (err) {
      void dialog({ message: favErrorText(err) })
    }
  }

  /**
   * 把收藏态拉回来（store 里缓存，一次会话只真拉一次）。**失败不打断调用方**：
   * 未登录 / 网络不通时按「没收藏」显示，等用户真去点那一下再报错（与托盘那条路一致）。
   */
  const loadFavState = () => {
    void loadFavSongIds().catch(err => { console.log('[fav] fav song ids', err) })
  }

  return {
    canFav,
    favTitle,
    toggleFav,
    loadFavState,
  }
}
