<template>
  <div :class="$style.container">
    <!-- 列表自带滚动（内部绝对定位 + 自滚动），父级给确定高度；
         「加载更多」钉在列表下方，不随列表滚走（与 components/common/QqFavList.vue 同形） -->
    <div :class="$style.listPane">
      <material-online-list
        :list="songs.list"
        :page="songs.page"
        :limit="songs.limit"
        :total="songs.list.length"
        :no-item="songs.noItemLabel"
        check-api-source
        @play-list="handlePlaySongs"
      />
    </div>
    <div v-if="songs.hasMore" :class="$style.more">
      <base-btn min :disabled="songs.isLoading" @click="loadMoreSongs">{{ $t('singer__load_more') }}</base-btn>
    </div>
    <p v-if="songs.moreError" :class="$style.error">{{ songs.moreError }}</p>
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import useSinger from '../useSinger'

/**
 * 歌手页 → 歌曲 tab（工单 02）。
 *
 * 取数全在 `useSinger.ts` 里：本组件只负责「切进来时判一次要不要取」（`ensureSongsTab`）
 * 与播放复用（`usePlay`）。分页器用不了（见 useSinger.ts 文件头第 3 条），翻页靠「加载更多」。
 */
export default {
  name: 'SingerSongsPanel',
  props: {
    mid: {
      type: String,
      default: '',
    },
  },
  setup(props: { mid: string }) {
    const { songs, ensureSongsTab, loadMoreSongs } = useSinger()

    // 懒加载入口：切进本 tab（含换歌手）时判一次要不要取；切回来已有缓存则不重复拉
    watch(() => props.mid, (mid) => { ensureSongsTab(mid) }, { immediate: true })

    // 播放复用在线列表的同一套逻辑（加入试听列表并从该位置播放）。
    // ⚠️ 传歌曲区块对象本身（不是 `{ list: songs.list }`）：usePlay 存的是 props.list 的数组
    // 引用，区块内写回全部走 splice/push，所以引用一直有效（与 /album 同样的处理）。
    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    const { handlePlayMusic } = usePlay({
      selectedList,
      props: songs,
      removeAllSelect: () => { selectedList.value = [] },
      emit: () => {},
    })
    const handlePlaySongs = (index: number) => { void handlePlayMusic(index, true) }

    return {
      songs,
      handlePlaySongs,
      loadMoreSongs,
    }
  },
}
</script>

<style lang="less" module>
@import './panels.less';

.container {
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
}
// material-online-list 内部是绝对定位 + 自滚动，父级要给出确定的高度
.listPane {
  flex: auto;
  min-height: 0;
  position: relative;
}
// 列表会吃掉所有剩余高度，按钮本身不能再被压缩（卡片面板那边是跟在网格后面，不必 pin）
.morePinned {
  flex: none;
}
</style>
