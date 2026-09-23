<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <base-tab v-model="searchType" :list="searchTypes" @change="handleTypeChange" />
    </div>
    <div :class="$style.main">
      <song-list-list v-if="searchType == 'songlist'" v-show="searchText" :page="page" :source-id="source" />
      <typed-result-list v-else-if="isTypedType" v-show="searchText" :key="searchType" :type="searchType" :page="page" :source-id="source" />
      <music-list v-else v-show="searchText" :page="page" :source-id="source" />
      <blank-view :visible="!searchText" :source="source" />
    </div>
  </div>
</template>

<script>
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { searchText } from '@renderer/store/search/state'
import { getSearchSetting, setSearchSetting } from '@renderer/utils/data'
import { normalizeSource } from '@renderer/store/search/music'
import { TYPED_SEARCH_TYPES } from '@renderer/store/search/typed'

import MusicList from './MusicList/index.vue'
import SongListList from './SongListList/index.vue'
import TypedResultList from './components/TypedResultList.vue'
import BlankView from './components/BlankView.vue'
import { computed, ref } from '@common/utils/vueTools'

const source = ref('tx')
const searchType = ref(null)
const page = ref(1)

const verifyQueryParams = async(to, from, next) => {
  let _source = to.query.source
  let _type = to.query.type
  let _page = to.query.page

  if (_source == null || _type == null) {
    const setting = await getSearchSetting()
    _source ??= setting.source
    _type ??= setting.type

    next({
      path: to.path,
      query: { ...to.query, source: normalizeSource(_source), type: _type, page: _page },
    })
    return
  }
  source.value = normalizeSource(_source)
  searchType.value = _type

  if (_page) page.value = parseInt(_page)

  if (to.query.text != null) {
    searchText.value = to.query.text
    if (!_page) page.value = 1
  }
  next()
  void setSearchSetting({ source: source.value, type: _type })
}

export default {
  components: {
    MusicList,
    SongListList,
    TypedResultList,
    BlankView,
  },
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const route = useRoute()
    const router = useRouter()

    const searchTypes = computed(() => {
      return [
        { label: window.i18n.t('search__type_music'), id: 'music' },
        { label: window.i18n.t('search__type_songlist'), id: 'songlist' },
        { label: window.i18n.t('search__type_singer'), id: 'singer' },
        { label: window.i18n.t('search__type_album'), id: 'album' },
        { label: window.i18n.t('search__type_mv'), id: 'mv' },
      ]
    })
    // 歌手 / 专辑 / MV 走同一个组件（条目形状不同、取数与翻页同构，见该组件的注释）
    const isTypedType = computed(() => TYPED_SEARCH_TYPES.includes(searchType.value))
    const handleTypeChange = (type) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          type,
          page: 1,
        },
      })
    }


    return {
      source,
      searchTypes,
      searchType,
      isTypedType,
      handleTypeChange,
      page,
      searchText,
    }
  },
}


</script>

<style lang="less" module>
.container {
  display: flex;
  flex-flow: column nowrap;
}

.header {
  // padding: 5px 0;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-between;
}

.main {
  position: relative;
  flex: auto;
  // min-height: 0;
}
</style>
