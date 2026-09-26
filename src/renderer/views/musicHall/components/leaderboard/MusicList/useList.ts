import { ref } from '@common/utils/vueTools'
// import { useI18n } from '@renderer/plugins/i18n'
// import { } from '@renderer/store/search/state'
import { getAndSetListDetail } from '@renderer/store/leaderboard/action'
import { listDetailInfo } from '@renderer/store/leaderboard/state'
import { playSongListDetail } from '../action'

export default () => {
  const listRef = ref<any>(null)

  const handlePlayList = (index: number) => {
    // 收口：`playSongListDetail` 内部会拉整榜（`getListDetailAll`），网络失败即 reject。
    // 不接住就漏到顶层——dev 下 webpack-dev-server 据此弹全屏浮层（fixed; inset:0）吞掉真实
    // 鼠标输入（票 03b）。这里只收口 + 留上下文日志（播放失败没有 store 层文案可复用）。
    void playSongListDetail(listDetailInfo.id, listDetailInfo.list, index).catch((err: any) => {
      console.log('[leaderboard] 播放榜单歌曲失败', err)
    })
  }

  const getList = (id: string, page: number) => {
    // 收口：store 的 catch 是「写完可读提示（listDetailInfo.noItemLabel = list__load_failed）再重抛」，
    // 调用方不接就成了未处理 rejection；提示已由 store 写入，这里只吞掉异常。
    void getAndSetListDetail(id, page).then(() => {
      setTimeout(() => {
        if (listRef.value) listRef.value.scrollToTop()
      })
    }).catch((err: any) => {
      console.log('[leaderboard] 获取榜单歌曲失败', err)
    })
  }

  return {
    listRef,
    listDetailInfo,
    getList,
    handlePlayList,
  }
}
