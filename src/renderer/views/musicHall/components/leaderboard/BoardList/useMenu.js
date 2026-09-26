import { computed, ref, reactive, nextTick } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { addSongListDetail, playSongListDetail } from '../action'

export default ({
  emit,
  list,
}) => {
  // const menuControl = reactive({
  //   play: true,
  //   collect: true,
  // })
  const t = useI18n()
  const menuLocation = reactive({ x: 0, y: 0 })
  const isShowMenu = ref(false)

  const menus = computed(() => {
    return [
      {
        name: t('list__play'),
        action: 'play',
        disabled: false,
      },
      {
        name: t('list__collect'),
        action: 'collect',
        disabled: false,
      },
    ]
  })


  const showMenu = (event, index) => {
    menuLocation.x = event.pageX
    menuLocation.y = event.pageY

    if (isShowMenu.value) return
    emit('show-menu')
    nextTick(() => {
      isShowMenu.value = true
    })
  }

  const hideMenu = () => {
    isShowMenu.value = false
  }


  const menuClick = (action, index, source) => {
    // console.log(action)
    hideMenu()
    if (!action) return
    // const id = `board__${this.source}__${board.id}`
    const board = list[index]
    switch (action.action) {
      case 'play':
        // 收口：`playSongListDetail` 内部会拉整榜（`getListDetailAll`），网络失败即 reject；
        // 不接住就漏到顶层——dev 下 webpack-dev-server 据此弹全屏浮层（fixed; inset:0）吞掉真实
        // 鼠标输入（票 03b）。这里只收口 + 留上下文日志（这个文件是 JS，`void` 会踩 no-void）。
        playSongListDetail(board.id).catch((err) => {
          console.log('[leaderboard] 播放榜单失败', err)
        })
        break
      case 'collect':
        // 收口：同 play——`addSongListDetail` 也要先拉整榜再建列表，失败即 reject。
        addSongListDetail(board.id, board.name, source).catch((err) => {
          console.log('[leaderboard] 收藏榜单失败', err)
        })
        break
    }
  }

  return {
    menus,
    menuLocation,
    isShowMenu,
    showMenu,
    menuClick,
  }
}
