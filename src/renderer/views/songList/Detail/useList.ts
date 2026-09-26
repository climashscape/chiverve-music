import { ref } from '@common/utils/vueTools'
// import { useI18n } from '@renderer/plugins/i18n'
// import { } from '@renderer/store/search/state'
import { getAndSetListDetail } from '@renderer/store/songList/action'
import { listDetailInfo } from '@renderer/store/songList/state'
import { playSongListDetail } from './action'

export default () => {
  const listRef = ref<any>(null)

  const getListData = async(source: LX.OnlineSource, id: string, page: number, refresh: boolean) => {
    // 收口：store 的 catch 是「写完可读提示（listDetailInfo.noItemLabel = list__load_failed）再重抛」，
    // 调用方全是 `void getListData(...)`（本文件与 index.vue），不接就成未处理 rejection——dev 下
    // webpack-dev-server 据此弹全屏浮层（fixed; inset:0）吞掉真实鼠标输入（票 03b）。
    // 提示已由 store 写入，这里只把 rejection 收口并留一行带上下文的日志。
    try {
      await getAndSetListDetail(id, source, page, refresh).then(() => {
        setTimeout(() => {
          if (listRef.value) listRef.value.scrollToTop()
        })
      })
    } catch (err: any) {
      console.log('[songList] 获取歌单歌曲失败', err)
    }
  }

  const handlePlayList = (index: number) => {
    // 收口：同 getListData——`playSongListDetail` 会拉整张歌单，失败即 reject，没人接就漏到顶层。
    void playSongListDetail(listDetailInfo.id, listDetailInfo.source, listDetailInfo.list, index).catch((err: any) => {
      console.log('[songList] 播放歌单歌曲失败', err)
    })
  }


  return {
    listRef,
    listDetailInfo,
    getListData,
    handlePlayList,
  }
}
