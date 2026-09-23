<template>
  <div :class="$style.container">
    <div :class="$style.songListHeader">
      <div :class="$style.songListHeaderLeft" :style="{ backgroundImage: 'url('+(picUrl || listDetailInfo.info.img)+')' }">
        <!-- <span v-if="listDetailInfo.info.play_count" :class="$style.playNum">{{ listDetailInfo.info.play_count }}</span> -->
      </div>
      <div :class="$style.songListHeaderMiddle">
        <h3 :title="listDetailInfo.info.name">{{ listDetailInfo.info.name }}</h3>
        <p :title="listDetailInfo.info.desc">{{ listDetailInfo.info.desc }}</p>
      </div>
      <div :class="$style.songListHeaderRight">
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!!listDetailInfo.noItemLabel"
          @click="playSongListDetail(listDetailInfo.id, listDetailInfo.source, listDetailInfo.list)"
        >
          {{ $t('list__play') }}
        </base-btn>
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!!listDetailInfo.noItemLabel"
          @click="addSongListDetail(listDetailInfo.id, listDetailInfo.source, listDetailInfo.info.name)"
        >
          {{ $t('list__collect') }}
        </base-btn>
        <base-btn :class="$style.headerRightBtn" :disabled="isFavLoading || !!listDetailInfo.noItemLabel" @click="handleToggleFav">
          {{ isFav ? $t('fav__cancel') : $t('fav__add') }}
        </base-btn>
        <base-btn :class="$style.headerRightBtn" @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>
    <div :class="$style.list">
      <material-online-list
        ref="listRef"
        :page="listDetailInfo.page"
        :limit="listDetailInfo.limit"
        :total="listDetailInfo.total"
        :list="listDetailInfo.list"
        :no-item="listDetailInfo.noItemLabel"
        :list-id="`tx__${$route.query.id ?? ''}`"
        @play-list="handlePlayList"
        @toggle-page="togglePage"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { listDetailInfo } from '@renderer/store/songList/state'
import { useRouter } from '@common/utils/vueRouter'
import { addSongListDetail, playSongListDetail } from './action'
import useList from './useList'
import useKeyBack from './useKeyBack'
import { getQQCredential } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'
import { favPlaylistIds } from '@renderer/store/user/state'
import { loadFavSonglistIds, setPlaylistFav } from '@renderer/store/user/action'

// 初始值而已，真正的源由路由 query 决定（下面的 verifyQueryParams 会覆写它）
const source = ref<LX.OnlineSource>('tx')
const id = ref<string>('')
const page = ref<number>(1)
const picUrl = ref<string>('')
const refresh = ref<boolean>(false)


interface Query {
  source?: string
  id?: string
  page?: string
  picUrl?: string
  refresh?: 'true'
  fromName?: string
  fromTab?: string
  /** 只在兜底跳转（无歌单可显示时跳乐馆歌单广场）里出现 */
  tab?: string
}

const verifyQueryParams = async function(this: any, to: { query: Query, path: string }, from: any, next: (route?: { path: string, query: Query }) => void) {
  let _source = to.query.source
  let _id = to.query.id
  let _page: string | undefined = to.query.page
  let _picUrl: string | undefined = to.query.picUrl
  let _refresh: 'true' | undefined = to.query.refresh

  if (_source == null || _id == null) {
    if (listDetailInfo.key) {
      _source = listDetailInfo.source
      _id = listDetailInfo.id
      _page = listDetailInfo.page.toString()
      _picUrl = listDetailInfo.info.img
    } else {
      next({ path: '/musicHall', query: { tab: 'songlist' } })
      return
    }

    next({
      path: to.path,
      query: { ...to.query, source: _source, id: _id, page: _page, picUrl: _picUrl, refresh: _refresh },
    })
    return
  }
  next()
  source.value = _source as LX.OnlineSource
  id.value = _id
  page.value = _page ? parseInt(_page) : 1
  picUrl.value = _picUrl ?? ''
  refresh.value = _refresh ? _refresh == 'true' : false
  if (to.query.fromName) window.lx.songListInfo.fromName = to.query.fromName
  window.lx.songListInfo.fromTab = to.query.fromTab ?? ''
}


export default {
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const router = useRouter()

    const {
      listRef,
      listDetailInfo,
      getListData,
      handlePlayList,
    } = useList()


    const togglePage = (page: number) => {
      void getListData(source.value, id.value, page, refresh.value)
    }

    const handleBack = () => {
      // 回来源页时把 Tab 一起带上：乐馆里「歌单广场」是 tab=songlist，不带就回到排行榜
      const fromTab = window.lx.songListInfo.fromTab
      if (window.lx.songListInfo.fromName) {
        void router.replace({ name: window.lx.songListInfo.fromName, query: fromTab ? { tab: fromTab } : {} })
      } else router.back()
    }

    useKeyBack(handleBack)

    /**
     * 收藏 / 取消收藏到 QQ（工单 08）。注意与左边的 `list__collect`（复制成本地自建列表）
     * 那是把在线歌单**复制成本地自建列表**）不是同一件事：这个写的是 QQ 云端收藏。
     * 判定见 store/user 的注释（读接口没有单条查询，靠收藏全量 tid 集合本地比对）。
     */
    const isFavLoading = ref(false)
    const isFav = computed(() => !!id.value && favPlaylistIds.includes(String(id.value)))
    const handleToggleFav = async() => {
      if (!id.value) return
      const credential = await getQQCredential()
      if (credential == null) {
        void dialog({ message: window.i18n.t('user_center__need_login' as any), type: 'info' })
        return
      }
      const next = !isFav.value
      isFavLoading.value = true
      try {
        await setPlaylistFav(String(id.value), next)
      } catch (err: any) {
        void dialog({ message: err?.message || String(err), type: 'error' })
      } finally {
        isFavLoading.value = false
      }
    }
    watch(id, (next) => {
      if (!next) return
      void loadFavSonglistIds().catch(err => { console.log('[songList] load fav ids', err) })
    }, { immediate: true })

    watch([source, id, page, refresh], async([_source, _id, _page, _refresh]) => {
      if (!_source || !_id) return router.replace({ path: '/musicHall', query: { tab: 'songlist' } })
      // console.log(_source, _id, _page, _refresh, picUrl.value)
      // source.value = _source
      // id.value = _id
      // refresh.value = _refresh
      // page.value = _page ?? 1
      void getListData(_source, _id, _page, _refresh)
    }, {
      immediate: true,
    })

    return {
      source,
      id,
      page,
      picUrl,
      listDetailInfo,
      listRef,
      togglePage,
      addSongListDetail,
      playSongListDetail,
      handlePlayList,
      handleBack,
      isFav,
      isFavLoading,
      handleToggleFav,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  // position: absolute;
  // left: 0;
  // top: 0;
  // width: 100%;
  // height: 100%;
  display: flex;
  flex-flow: column nowrap;
}

.songListHeader {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  height: 80px;
}
.songListHeaderLeft {
  flex: none;
  margin-left: 15px;
  height: 100%;
  aspect-ratio: 1 / 1;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background-position: center;
  background-size: cover;
  opacity: .9;
  box-shadow: 0 0 2px 0 rgba(0,0,0,.2);
}
.playNum {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px;
  background-color: rgba(0, 0, 0, 0.4);
  color: #fff;
  font-size: 12px;
  text-align: right;
  .mixin-ellipsis-1();
}

.songListHeaderMiddle {
  flex: auto;
  padding: 2px 7px;
  min-width: 0;
  h3 {
    .mixin-ellipsis-1();
    line-height: 1.2;
    padding-bottom: 5px;
    color: var(--color-font);
  }
  p {
    .mixin-ellipsis(3);
    font-size: 12px;
    line-height: 1.2;
    color: var(--color-font-label);
  }
}
.songListHeaderRight {
  flex: none;
  display: flex;
  align-items: center;
  padding-right: 15px;

  .headerRightBtn {
    border-radius: 0;
    &:first-child {
      border-top-left-radius: 4px;
      border-bottom-left-radius: 4px;
    }
    &:last-child {
      border-top-right-radius: 4px;
      border-bottom-right-radius: 4px;
    }
  }
}

.list {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: auto;
  height: 100%;
}
</style>

