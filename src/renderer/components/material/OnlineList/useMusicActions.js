import { useRouter } from '@common/utils/vueRouter'
import { addDislikeInfo, hasDislike } from '@renderer/core/dislikeList'
import { playNext } from '@renderer/core/player'
import { playMusicInfo } from '@renderer/store/player/state'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import useMusicJump from '@renderer/utils/compositions/useMusicJump'


export default ({ props }) => {
  const router = useRouter()
  const t = useI18n()

  // 跳转 / 分享 / 歌手选择菜单与本地列表歌曲表共用一份（见 useMusicJump 的注释）
  const {
    canJumpToAlbum,
    canJumpToSinger,
    canShareMusic,
    handleSingerNameClick,
    handleAlbumNameClick,
    jumpToAlbum,
    jumpToSinger,
    copyMusicLink,
    openMusicInQqMusic,
    isShowSingerPicker,
    singerPickerXy,
    singerPickerMenus,
    handleSingerPickerClick,
  } = useMusicJump()

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


  // 右键菜单里的「跳转至专辑 / 歌手」：专辑有 mid 直接跳；歌手要现取 mid（取不到会在
  // jumpToSinger 里弹提示），多位歌手时在菜单处列出让用户挑（位置沿用行菜单的位置）
  const handleJumpAlbum = index => {
    jumpToAlbum(props.list[index])
  }
  const handleJumpSinger = async(index, location) => {
    await jumpToSinger(props.list[index], { pageX: location?.x, pageY: location?.y })
  }
  const handleCopyLink = index => {
    copyMusicLink(props.list[index])
  }
  const handleOpenInQqMusic = index => {
    openMusicInQqMusic(props.list[index])
  }

  return {
    handleSearch,
    handleOpenMusicDetail,
    handleDislikeMusic,
    canJumpToAlbum,
    canJumpToSinger,
    canShareMusic,
    handleSingerNameClick,
    handleAlbumNameClick,
    handleJumpAlbum,
    handleJumpSinger,
    handleCopyLink,
    handleOpenInQqMusic,
    isShowSingerPicker,
    singerPickerXy,
    singerPickerMenus,
    handleSingerPickerClick,
  }
}
