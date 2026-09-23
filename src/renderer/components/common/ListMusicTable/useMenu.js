import { computed, ref, shallowReactive, reactive, nextTick } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { useI18n } from '@renderer/plugins/i18n'
import { hasDislike } from '@renderer/core/dislikeList'
import { canJumpToAlbum, canJumpToSinger, canShareMusic } from '@common/utils/musicLink'

export default ({
  assertApiSupport,
  emit,

  handleShowDownloadModal,
  handlePlayMusic,
  handlePlayMusicLater,
  handleSearch,
  handleShowMusicAddModal,
  handleShowMusicMoveModal,
  handleShowSortModal,
  handleOpenMusicDetail,
  handleCopyName,
  handleDislikeMusic,
  handleRemoveMusic,

  handleJumpAlbum,
  handleJumpSinger,
  handleCopyLink,
  handleOpenInQqMusic,
}) => {
  const itemMenuControl = reactive({
    play: true,
    playLater: true,
    copyName: true,
    addTo: true,
    moveTo: true,
    sort: true,
    download: true,
    search: true,
    dislike: true,
    remove: true,
    sourceDetail: true,
    jumpAlbum: true,
    jumpSinger: true,
    share: true,
  })
  const t = useI18n()
  const menuLocation = shallowReactive({ x: 0, y: 0 })
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
        name: t('list__add_to'),
        action: 'addTo',
        disabled: !itemMenuControl.addTo,
      },
      {
        name: t('list__move_to'),
        action: 'moveTo',
        disabled: !itemMenuControl.moveTo,
      },
      {
        name: t('list__sort'),
        action: 'sort',
        disabled: !itemMenuControl.sort,
      },
      {
        name: t('list__copy_name'),
        action: 'copyName',
        disabled: !itemMenuControl.copyName,
      },
      {
        name: t('list__source_detail'),
        action: 'sourceDetail',
        disabled: !itemMenuControl.sourceDetail,
      },
      // 跳转 / 分享：本地文件**不显示**（没有在线 mid，显示出来就是点了没反应的项）
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
        name: t('list__search'),
        action: 'search',
        disabled: !itemMenuControl.search,
      },
      {
        name: t('list__dislike'),
        action: 'dislike',
        disabled: !itemMenuControl.dislike,
      },
      {
        name: t('list__remove'),
        action: 'remove',
        disabled: !itemMenuControl.remove,
      },
    ]
  })

  const showMenu = (event, musicInfo) => {
    itemMenuControl.sourceDetail = !!musicSdk[musicInfo.source]?.getMusicDetailPageUrl
    // itemMenuControl.play =
    //   itemMenuControl.playLater =
    itemMenuControl.download = assertApiSupport(musicInfo.source) && musicInfo.source != 'local'
    itemMenuControl.jumpAlbum = canJumpToAlbum(musicInfo)
    itemMenuControl.jumpSinger = canJumpToSinger(musicInfo)
    itemMenuControl.share = canShareMusic(musicInfo)

    itemMenuControl.dislike = !hasDislike(musicInfo)

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
      case 'play':
        handlePlayMusic(index)
        break
      case 'playLater':
        handlePlayMusicLater(index)
        break
      case 'copyName':
        handleCopyName(index)
        break
      case 'addTo':
        handleShowMusicAddModal(index)
        break
      case 'moveTo':
        handleShowMusicMoveModal(index)
        break
      case 'sort':
        handleShowSortModal(index)
        break
      case 'download':
        handleShowDownloadModal(index)
        break
      case 'search':
        handleSearch(index)
        break
      case 'dislike':
        handleDislikeMusic(index)
        break
      case 'remove':
        handleRemoveMusic(index)
        break
      case 'sourceDetail':
        handleOpenMusicDetail(index)
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
