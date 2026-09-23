<template>
  <div :class="$style.container">
    <!-- 左栏：试听列表 / 我的收藏（本地两类歌曲集合都在这里，工单 05） -->
    <ul :class="$style.rail" class="scroll">
      <li
        v-for="item in railItems"
        :key="item.id"
        :class="[$style.railItem, { [$style.active]: item.id === listId }]"
        :aria-label="item.name"
        @click="handleToggleList(item.id)"
      >
        <span :class="$style.railLabel">
          <transition name="list-active">
            <svg-icon v-if="item.id === listId" name="angle-right-solid" :class="$style.activeIcon" />
          </transition>
          {{ item.name }}
        </span>
      </li>
    </ul>

    <div :class="$style.pane">
      <!-- 「我的收藏」有两个来源：本地收藏（本地库的 love 列表）与 QQ 音乐的「我喜欢」
           （云端 dirId=201，切到才加载）。两者是**两套数据**，这里只做并列展示。 -->
      <base-tab v-if="isLoveList" v-model="favSource" :list="sourceTabs" :class="$style.sourceTabs" />

      <!-- 本地：试听列表 / 我的收藏（本地收藏）共用同一份歌曲表实现 -->
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
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { LIST_IDS } from '@common/constants'
import { defaultList, loveList } from '@renderer/store/list/state'
import { favSongs, labels as userLabels } from '@renderer/store/user/state'
import { loadFavSongs, loadMoreFavSongs, removeFavSongFromCloud } from '@renderer/store/user/action'
import { dialog } from '@renderer/plugins/Dialog'
import useOnlinePlay from '@renderer/components/material/OnlineList/usePlay'

/**
 * 我的收藏 → 歌曲。
 *
 * 左栏两项都是**本地库里的列表**（`default` 试听列表 / `love` 我的收藏）；
 * 「我的收藏」这一项再多一层来源切换：本地收藏（本地库）与 QQ 音乐·我喜欢（云端 201）。
 *
 * 状态写在 query 上（`list` 与 `favSource`）：从歌曲详情/其它页面返回、刷新页面都还在原位。
 */

export default {
  name: 'FavoritesSongsPanel',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const t = (key: string, params?: any) => window.i18n.t(key as any, params)

    const railItems = computed(() => [
      { id: defaultList.id, name: t(defaultList.name) },
      { id: loveList.id, name: t(loveList.name) },
    ])
    const listId = computed(() => {
      const id = route.query.list as string | undefined
      return id === LIST_IDS.LOVE ? LIST_IDS.LOVE : LIST_IDS.DEFAULT
    })
    const isLoveList = computed(() => listId.value === LIST_IDS.LOVE)

    const handleToggleList = (id: string) => {
      void router.replace({ path: route.path, query: { ...route.query, list: id, favSource: undefined } })
    }

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
    const isShowCloudFav = computed(() => isLoveList.value && favSource.value === 'cloud')

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
      railItems,
      listId,
      isLoveList,
      handleToggleList,
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
  flex-flow: row nowrap;
}

// 左栏：与乐馆排行榜的榜单栏同宽同款（13–15% 窄轨道 + 行内高亮）
.rail {
  flex: none;
  width: 15%;
  min-width: 120px;
  overflow-y: auto;
}
.railItem {
  transition: .3s ease;
  transition-property: color, background-color;
  background-color: transparent;

  &:hover:not(.active) {
    background-color: var(--color-primary-background-hover);
    cursor: pointer;
  }
  &.active {
    color: var(--color-primary);
  }
}
.railLabel {
  display: block;
  height: 100%;
  padding: 0 10px;
  font-size: 13px;
  line-height: 36px;
  .mixin-ellipsis-1();
}
.activeIcon {
  height: .9em;
  width: .9em;
  margin-left: -0.45em;
  vertical-align: -0.05em;
}

.pane {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
}
// base-tab 自带下划线指示器
.sourceTabs {
  flex: none;
}
</style>
