<template>
  <div :class="$style.container">
    <!-- 「我的收藏」有两个来源：本地收藏（本地库的 love 列表）与 QQ 音乐的「我喜欢」
         （云端 dirId=201，切到才加载）。两者是**两套数据**，这里只做并列展示。 -->
    <base-tab v-model="favSource" :list="sourceTabs" :class="$style.sourceTabs" />

    <!-- 本地：我的收藏（本地收藏）的歌曲表 -->
    <list-music-table v-if="!isShowCloudFav" :list-id="listId" />
    <!--
      QQ 我喜欢那一栏。这里必须用 v-if 而不是 v-show：base-virtualized-list 在 onMounted
      的 rAF 里按容器 clientHeight 算渲染区间，挂载时若还是 display:none 就只渲染一行。
    -->
    <qq-fav-list
      v-else
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
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { loveList } from '@renderer/store/list/state'
import { favSongs, labels as userLabels } from '@renderer/store/user/state'
import { loadFavSongs, loadMoreFavSongs, removeFavSongFromCloud } from '@renderer/store/user/action'
import { dialog } from '@renderer/plugins/Dialog'
import useOnlinePlay from '@renderer/components/material/OnlineList/usePlay'
import ListMusicTable from '@renderer/components/common/ListMusicTable/index.vue'
import QqFavList from '@renderer/components/common/QqFavList.vue'

/**
 * 我的收藏 → 我收藏的歌曲。
 *
 * 只有「我的收藏」（本地库的 love 列表）一个列表；「试听列表」已从界面退场
 * （工单 07 / ADR 0006），这里不再有左栏，`?list=` 参数也不再被读取。
 * 列表内再多一层来源切换：本地收藏（本地库）与 QQ 音乐·我喜欢（云端 201）。
 *
 * 来源写在 query 上（`favSource`）：从歌曲详情/其它页面返回、刷新页面都还在原位。
 */

export default {
  name: 'FavoritesSongsPanel',
  components: {
    ListMusicTable,
    QqFavList,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const t = (key: string, params?: any) => window.i18n.t(key as any, params)

    // 本页只有一个列表：恒为「我的收藏」（工单 07）。写死而不是读 `route.query.list`，
    // 免得旧书签里的 `?list=default` 又把试听列表带回来。
    const listId = loveList.id

    // ── 「我的收藏」的双来源切换（本地收藏 / QQ 音乐的我喜欢）─────────────────
    const favSource = computed({
      get: () => (route.query.favSource === 'cloud' ? 'cloud' : 'local'),
      set: (value: string) => {
        void router.replace({ path: route.path, query: { ...route.query, favSource: value === 'cloud' ? 'cloud' : undefined } })
      },
    })
    const sourceTabs = computed(() => ([
      { id: 'local', label: t('list__source_local') },
      { id: 'cloud', label: t('list__source_qq_fav') },
    ]))
    const isShowCloudFav = computed(() => favSource.value === 'cloud')

    // 未登录时 loadFavSongs 会落「请先登录 QQ 音乐」文案（它认的就是凭证层抛的
    // `QQ 音乐未登录`），所以这里不自己判登录态——那个状态目前只在「设置」页初始化过。
    // ⚠️ `no-item` 在 material-online-list 里同时是**列表容器的显隐开关**（`v-show="!noItem"`），
    // 所以「一切正常」时必须给空串；恒给非空值会让列表永远被藏起来。
    const cloudFavNoItem = computed(() => userLabels.favSongs || (favSongs.list.length ? '' : t('no_item')))

    // 切到云端来源才拉数据（懒加载）：重复进页面就重拉，loadFavSongs 不受 initUserCenter 的守卫约束
    watch(isShowCloudFav, (show) => {
      if (!show) return
      void loadFavSongs()
    }, { immediate: true })

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
      listId,
      favSource,
      sourceTabs,
      isShowCloudFav,
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

// base-tab 自带下划线指示器
.sourceTabs {
  flex: none;
}
</style>
