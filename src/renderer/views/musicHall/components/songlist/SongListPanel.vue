<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <div :class="$style.left">
        <tag-list :source="source" :tag-id="tagId" :sort-id="sortId" />
        <sort-tab :source="source" :tag-id="tagId" :sort-id="sortId" />
      </div>
      <base-btn :class="$style.btn" outline min @click="visibleOpenSongListModal = true">{{ $t('songlist__import_input_show_btn') }}</base-btn>
    </div>
    <list-view :source="source" :tag-id="tagId" :sort-id="sortId" :page="page" />
    <open-list-modal v-model="visibleOpenSongListModal" />
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { DEFAULT_SETTING } from '@common/constants'
import { getSongListSetting, setSongListSetting } from '@renderer/utils/data'
import TagList from './components/TagList.vue'
import SortTab from './components/SortTab.vue'
import OpenListModal from './components/OpenListModal.vue'
import ListView from './ListView.vue'
import { sources, listInfo } from '@renderer/store/songList/state'

/**
 * 乐馆 → 歌单广场 Tab。
 *
 * 原本是独立路由页（views/songList/List/index.vue），并入乐馆后**参数仍走 route.query**
 * （source / tagId / sortId / page）：旧地址 `/songList/list?tagId=…` 重定向进来能原样带上。
 * 原来的 `beforeRouteEnter/beforeRouteUpdate` 守卫换成组件内 watch（面板不是路由组件）。
 */

const source = ref<LX.OnlineSource>('tx')
const tagId = ref<string>('')
const sortId = ref<string>('')
const page = ref<number>(1)

// 只保留 tx 一个在线源，源不再由用户选择：历史值（旧 `'all'` 或已移除的源）归一到已注册源
const normalizeSource = (source?: string): LX.OnlineSource => {
  return sources.includes(source as LX.OnlineSource) ? source as LX.OnlineSource : (sources[0] ?? DEFAULT_SETTING.songList.source)
}

export default {
  components: {
    TagList,
    SortTab,
    ListView,
    OpenListModal,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const visibleOpenSongListModal = ref(false)

    const applyQuery = async() => {
      // 收口：函数体里两处 `getSongListSetting` / `setSongListSetting` 是 IPC 调用，失败即 reject，
      // 而调用方（下面的 watch）是 `void applyQuery()`——没人接就漏到顶层，dev 下 webpack-dev-server
      // 据此弹全屏浮层（fixed; inset:0）吞掉真实鼠标输入（票 03b）。设置读不到时 query 仍照常驱动
      // 视图（最坏是本次不写回默认值），所以只收口 + 留一行带上下文的日志。
      try {
        const rawSource = route.query.source
        const rawTagId = route.query.tagId
        const rawSortId = route.query.sortId
        const rawPage = route.query.page

        // query 里没有 source（外部直接进 /musicHall?tab=songlist）时，用上次的选择或设置里的默认值补齐
        if (rawSource == null) {
          let nextTagId = rawTagId
          let nextSortId = rawSortId
          let nextPage = rawPage
          if (listInfo.key) {
            nextTagId = listInfo.tagId
            nextSortId = listInfo.sortId
            nextPage = listInfo.page.toString()
          } else {
            const setting = await getSongListSetting()
            nextTagId = setting.tagId
            nextSortId = setting.sortId
            nextPage = '1'
          }
          void router.replace({
            path: route.path,
            query: {
              ...route.query,
              source: normalizeSource(route.query.source as string | undefined),
              tagId: nextTagId,
              sortId: nextSortId,
              page: nextPage,
            },
          })
          return
        }

        source.value = normalizeSource(rawSource as string)
        tagId.value = (rawTagId as string) ?? ''
        sortId.value = (rawSortId as string) ?? ''
        page.value = rawPage ? parseInt(rawPage as string) : 1
        await setSongListSetting({ source: source.value, tagId: rawTagId as string, sortId: rawSortId as string })
      } catch (err: any) {
        console.log('[songlist] 应用歌单广场路由参数失败', err)
      }
    }

    watch(() => [route.query.source, route.query.tagId, route.query.sortId, route.query.page], () => { void applyQuery() }, { immediate: true })

    return {
      source,
      tagId,
      sortId,
      page,
      visibleOpenSongListModal,
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
  position: relative;
}
.header {
  flex: none;
  width: 100%;
  display: flex;
  flex-flow: row nowrap;
  padding-bottom: 5px;
}
.left {
  flex: auto;
  display: flex;
  flex-flow: row nowrap;
}

.btn {
  color: var(--color-font);
  transition: color @transition-fast;
  background: none !important;
  &:hover {
    color: var(--color-primary-font-hover);
  }
}

</style>
