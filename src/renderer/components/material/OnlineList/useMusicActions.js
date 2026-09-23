import { useRouter } from '@common/utils/vueRouter'
import { addDislikeInfo, hasDislike } from '@renderer/core/dislikeList'
import { playNext } from '@renderer/core/player'
import { playMusicInfo } from '@renderer/store/player/state'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'


export default ({ props }) => {
  const router = useRouter()
  const t = useI18n()

  const handleSearch = index => {
    const info = props.list[index]
    router.push({
      path: '/search',
      query: {
        text: `${info.name} ${info.singer}`,
      },
    })
  }

  /**
   * 「歌曲详情」：进本仓的歌曲详情页（`/songDetail?source=…&mid=…`）。
   *
   * 原来这一项是 `getMusicDetailPageUrl` + `openUrl`——**打开 QQ 的网页**，等于把用户送出应用
   * （工单 09 的验收写的是「不再跳搜索页」，实际代码当时是这样，已按工单意图改成进本页）。
   * mid 取 `meta.songId`（新式模型里它存的才是 songmid，见 tools.ts 的 toOldMusicInfo），
   * 本地文件没有 mid → 保持「什么都不做」。
   */
  const handleOpenMusicDetail = index => {
    const minfo = props.list[index]
    if (minfo.source == 'local') return
    const mid = minfo.meta?.songId
    if (!mid) return
    router.push({ path: '/songDetail', query: { source: minfo.source, mid } })
  }

  const handleDislikeMusic = async(index) => {
    const minfo = props.list[index]
    const confirm = await dialog.confirm({
      message: minfo.singer ? t('lists__dislike_music_singer_tip', { name: minfo.name, singer: minfo.singer }) : t('lists__dislike_music_tip', { name: minfo.name }),
      cancelButtonText: t('cancel_button_text_2'),
      confirmButtonText: t('confirm_button_text'),
    })
    if (!confirm) return
    await addDislikeInfo([{ name: minfo.name, singer: minfo.singer }])
    if (hasDislike(playMusicInfo.musicInfo)) {
      playNext(true)
    }
  }


  return {
    handleSearch,
    handleOpenMusicDetail,
    handleDislikeMusic,
  }
}
