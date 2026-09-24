import { computed, ref, reactive, nextTick } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { useI18n } from '@renderer/plugins/i18n'
import { hasDislike } from '@renderer/core/dislikeList'
import { canJumpToAlbum, canJumpToSinger, canShareMusic } from '@common/utils/musicLink'
import useFavSong from '@renderer/utils/compositions/useFavSong'

export default ({
  props,
  assertApiSupport,
  emit,

  handleShowDownloadModal,
  handlePlayMusic,
  handlePlayMusicLater,
  handleSearch,
  handleShowMusicAddModal,
  handleOpenMusicDetail,
  handleDislikeMusic,

  handleJumpAlbum,
  handleJumpSinger,
  handleCopyLink,
  handleOpenInQqMusic,
}) => {
  const itemMenuControl = reactive({
    play: true,
    addTo: true,
    fav: true,
    playLater: true,
    download: true,
    search: true,
    sourceDetail: true,
    dislike: true,
    jumpAlbum: true,
    jumpSinger: true,
    share: true,
  })
  const t = useI18n()
  // 「我喜欢」是**一键开关**（工单 06）：名字随当前状态变，点一下就地切换，不再开弹窗
  const { canFav, favTitle, toggleFav, loadFavState } = useFavSong()
  // 只记「当前右键的这一首」：菜单项名字与点击动作都读它，就不必再让调用方按 index 找歌
  // （本地列表的那个 useMenu 拿不到 list，两边靠这个写成同一份）
  const currentMusic = ref(null)
  const menuLocation = reactive({ x: 0, y: 0 })
  const isShowItemMenu = ref(false)

  const menus = computed(() => {
    return [
      {
        name: t('list__play'),
        action: 'play',
        disabled: !itemMenuControl.play,
      },
      {
        name: t('list__download'),
        action: 'download',
        disabled: !itemMenuControl.download,
      },
      {
        name: t('list__play_later'),
        action: 'playLater',
        disabled: !itemMenuControl.playLater,
      },
      {
        name: t('list__search'),
        action: 'search',
        disabled: !itemMenuControl.search,
      },
      // 「我喜欢」与「加入歌单」是两件事（工单 06）：前者一键切换（名字随状态变），
      // 后者开弹窗。不能收藏的歌（本地文件等）**不显示**收藏项，而不是显示成灰的
      {
        name: favTitle(currentMusic.value),
        action: 'fav',
        hide: !itemMenuControl.fav,
      },
      {
        name: t('list__add_to'),
        action: 'addTo',
        disabled: !itemMenuControl.addTo,
      },
      // 跳转 / 分享：对本地文件**不显示**（本地没有在线 mid，显示出来就是点了没反应的项）
      {
        name: t('list__jump_album'),
        action: 'jumpAlbum',
        hide: !itemMenuControl.jumpAlbum,
      },
      {
        name: t('list__jump_singer'),
        action: 'jumpSinger',
        hide: !itemMenuControl.jumpSinger,
      },
      {
        name: t('list__copy_link'),
        action: 'copyLink',
        hide: !itemMenuControl.share,
      },
      {
        name: t('list__open_in_qq'),
        action: 'openInQq',
        hide: !itemMenuControl.share,
      },
      {
        name: t('list__source_detail'),
        action: 'sourceDetail',
        disabled: !itemMenuControl.sourceDetail,
      },
      {
        name: t('list__dislike'),
        action: 'dislike',
        disabled: !itemMenuControl.dislike,
      },
    ]
  })

  const showMenu = (event, musicInfo) => {
    itemMenuControl.sourceDetail = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    // this.listMenu.itemMenuControl.play =
    //   this.listMenu.itemMenuControl.playLater =
    itemMenuControl.download = assertApiSupport(musicInfo.source)
    itemMenuControl.jumpAlbum = canJumpToAlbum(musicInfo)
    itemMenuControl.jumpSinger = canJumpToSinger(musicInfo)
    itemMenuControl.share = canShareMusic(musicInfo)

    itemMenuControl.dislike = !hasDislike(musicInfo)

    // 收藏态先拉回来（缓存住，一次会话只真拉一次）：拉不到就按「没收藏」显示文案，
    // 点击那一下会再等一次（`toggleFav` 内部），所以不会点错方向
    currentMusic.value = musicInfo
    itemMenuControl.fav = canFav(musicInfo)
    loadFavState()

    if (props.checkApiSource) {
      itemMenuControl.playLater =
      itemMenuControl.play =
        itemMenuControl.download
    }

    menuLocation.x = event.pageX
    menuLocation.y = event.pageY

    if (isShowItemMenu.value) return
    emit('show-menu')
    nextTick(() => {
      isShowItemMenu.value = true
    })
  }

  const hideMenu = () => {
    isShowItemMenu.value = false
  }

  const menuClick = (action, index, location) => {
    // console.log(action)
    hideMenu()
    if (!action) return

    switch (action.action) {
      case 'download':
        handleShowDownloadModal(index)
        break
      case 'play':
        handlePlayMusic(index)
        break
      case 'playLater':
        handlePlayMusicLater(index)
        break
      case 'search':
        handleSearch(index)
        break
      case 'addTo':
        handleShowMusicAddModal(index)
        break
      case 'fav':
        // 一键切换「我喜欢」：失败会在 toggleFav 里弹出来（未登录 → 请先登录 QQ 音乐）
        toggleFav(currentMusic.value)
        break
      case 'sourceDetail':
        handleOpenMusicDetail(index)
        break
      case 'dislike':
        handleDislikeMusic(index)
        break
      case 'jumpAlbum':
        handleJumpAlbum(index)
        break
      case 'jumpSinger':
        // 多位歌手时选择菜单要出现在行菜单的位置上
        handleJumpSinger(index, location)
        break
      case 'copyLink':
        handleCopyLink(index)
        break
      case 'openInQq':
        handleOpenInQqMusic(index)
        break
    }
  }

  return {
    menus,
    menuLocation,
    isShowItemMenu,
    showMenu,
    menuClick,
  }
}
