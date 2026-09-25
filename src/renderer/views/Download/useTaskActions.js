import { useRouter } from '@common/utils/vueRouter'
import { checkPath } from '@common/utils/nodejs'
// import { dialog } from '@renderer/plugins/Dialog'
// import { useI18n } from '@renderer/plugins/i18n'
// import { appSetting } from '@renderer/store/setting'
import useMusicJump from '@renderer/utils/compositions/useMusicJump'
import { startDownloadTasks, pauseDownloadTasks, removeDownloadTasks } from '@renderer/store/download/action'
import { openDirInExplorer } from '@renderer/utils/ipc'

export default ({ list, selectedList, removeAllSelect }) => {
  const router = useRouter()
  // const t = useI18n()
  // 「歌曲详情」与两个歌曲表共用一份（工单 03，见 useMusicJump 的 toSongDetail）
  const { toSongDetail } = useMusicJump()

  const handleSearch = index => {
    const info = list.value[index].metadata.musicInfo
    router.push({
      path: '/search',
      query: {
        text: `${info.name} ${info.singer}`,
      },
    })
  }

  /**
   * 「歌曲详情」：进本仓的歌曲详情页（工单 03）。
   *
   * 原来这里是 `getMusicDetailPageUrl` + `openUrl`——**打开 QQ 网页**，与两个歌曲表漂移成了两套行为。
   * 现在共用 `useMusicJump` 的 `toSongDetail`（`task.metadata.musicInfo` 本来就是要的那个新式对象，
   * 不必再过 `toOldMusicInfo`）；菜单项的显隐仍由 `useMenu.js` 的 sourceDetail 判据管。
   */
  const handleOpenMusicDetail = index => {
    toSongDetail(list.value[index].metadata.musicInfo)
  }

  const handleStartTask = async(index, single) => {
    if (selectedList.value.length && !single) {
      startDownloadTasks([...selectedList.value])
      removeAllSelect()
    } else {
      startDownloadTasks([list.value[index]])
    }
  }

  const handlePauseTask = async(index, single) => {
    if (selectedList.value.length && !single) {
      pauseDownloadTasks([...selectedList.value])
      removeAllSelect()
    } else {
      pauseDownloadTasks([list.value[index]])
    }
  }

  const handleRemoveTask = async(index, single) => {
    if (selectedList.value.length && !single) {
      // const confirm = await (selectedList.value.length > 1
      //   ? dialog.confirm({
      //     message: t('lists__remove_music_tip', { len: selectedList.value.length }),
      //     confirmButtonText: t('lists__remove_tip_button'),
      //   })
      //   : Promise.resolve(true)
      // )
      // if (!confirm) return
      removeDownloadTasks(selectedList.value.map(m => m.id))
      removeAllSelect()
    } else {
      removeDownloadTasks([list.value[index].id])
    }
  }

  const handleOpenFile = async(index) => {
    const task = list.value[index]
    if (!checkPath(task.metadata.filePath)) return
    openDirInExplorer(task.metadata.filePath)
  }

  return {
    handleSearch,
    handleOpenMusicDetail,
    handleStartTask,
    handlePauseTask,
    handleRemoveTask,
    handleOpenFile,
  }
}
