<template>
  <div :class="$style.container">
    <!-- 只有一路：QQ 音乐的「我喜欢」（云端 dirId=201）。本地收藏已取消——收藏只写云端，
         所以这里不再有本地/云端来源切换，`?favSource=` 也不再被读取（2026-09-24）。 -->
    <qq-fav-list
      :list="favSongs.list"
      :no-item="cloudFavNoItem"
      :page="favSongs.page"
      :limit="favSongs.total || favSongs.limit"
      :total="favSongs.total"
      @play-list="handlePlayFav"
      @load-more="handleLoadMoreFav"
      @unlove="handleUnloveFav"
    />
  </div>
</template>

<script lang="ts">
import { computed, ref } from '@common/utils/vueTools'
import { favSongs, labels as userLabels } from '@renderer/store/user/state'
import { loadFavSongs, loadMoreFavSongs, removeFavSongFromCloud } from '@renderer/store/user/action'
import { dialog } from '@renderer/plugins/Dialog'
import useOnlinePlay from '@renderer/components/material/OnlineList/usePlay'
import QqFavList from '@renderer/components/common/QqFavList.vue'

/**
 * 我的收藏 → 我收藏的歌曲。
 *
 * 内容就是 QQ 音乐的「我喜欢」（云端 dirId=201）：2026-09-24 起本地收藏取消，
 * 这一块不再并列展示本地 love 列表（它的数据行仍在，只是界面不再有入口）。
 * 「试听列表」更早退场（工单 07 / ADR 0006）——所以本页没有左栏，`?list=` 也不被读取。
 */

export default {
  name: 'FavoritesSongsPanel',
  components: {
    QqFavList,
  },
  setup() {
    const t = (key: string, params?: any) => window.i18n.t(key as any, params)

    // 未登录时 loadFavSongs 会落「请先登录 QQ 音乐」文案（它认的就是凭证层抛的
    // `QQ 音乐未登录`），所以这里不自己判登录态——那个状态目前只在「设置」页初始化过。
    // ⚠️ `no-item` 在 material-online-list 里同时是**列表容器的显隐开关**（`v-show="!noItem"`），
    // 所以「一切正常」时必须给空串；恒给非空值会让列表永远被藏起来。
    const cloudFavNoItem = computed(() => userLabels.favSongs || (favSongs.list.length ? '' : t('no_item')))

    // 进页面就拉（切 tab 会重建本组件，所以每次回来都是新的一份）：
    // 重复进页面就重拉，loadFavSongs 不受 initUserCenter 的 isInited 守卫约束
    void loadFavSongs()

    const selectedCloudList = ref<LX.Music.MusicInfoOnline[]>([])
    const { handlePlayMusic: handlePlayCloudMusic } = useOnlinePlay({
      selectedList: selectedCloudList,
      props: { list: favSongs.list },
      removeAllSelect: () => { selectedCloudList.value = [] },
      emit: () => {},
    })
    const handlePlayFav = (index: number) => {
      void handlePlayCloudMusic(index, true)
    }
    const handleLoadMoreFav = () => {
      void loadMoreFavSongs()
    }
    // 取消喜欢：行内「取消喜欢」按钮 → 二次确认 → 写 QQ（失败给出明确提示，不静默）
    const handleUnloveFav = async(index: number) => {
      const musicInfo = favSongs.list[index]
      if (musicInfo == null) return
      const confirm = await dialog.confirm({
        message: t('list_unlove__tip', { name: musicInfo.name }),
        confirmButtonText: t('list__unlove'),
      })
      if (!confirm) return
      try {
        await removeFavSongFromCloud(musicInfo)
      } catch (err: any) {
        void dialog({
          message: err?.message || String(err),
          type: 'error',
        })
      }
    }

    return {
      cloudFavNoItem,
      favSongs,
      handlePlayFav,
      handleLoadMoreFav,
      handleUnloveFav,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
}
</style>
