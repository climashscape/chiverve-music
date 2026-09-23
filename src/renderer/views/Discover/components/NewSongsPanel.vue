<template>
  <div :class="$style.container">
    <!-- 新歌：一次一批，切地区 = 重拉（没有页码语义） -->
    <div :class="$style.sectionHeader">
      <base-tab v-model="type" :class="$style.tabs" :list="typeTabs" item-key="type" @change="switchNewSongType" />
    </div>
    <div :class="$style.songList">
      <material-online-list
        :list="newSongs.list"
        :page="newSongs.page"
        :limit="newSongs.limit"
        :total="newSongs.total"
        :no-item="newSongs.noItemLabel"
        check-api-source
        @play-list="handlePlayList"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { ref } from '@common/utils/vueTools'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import useNewSongsTab from '../useNewSongsTab'

/** 发现页 → 新歌 Tab：按地区切一批。 */
export default {
  name: 'DiscoverNewSongsPanel',
  setup() {
    const { newSongs, typeTabs, initNewSongsTab, switchNewSongType } = useNewSongsTab()

    void initNewSongsTab()

    // 播放复用在线列表的同一套逻辑（传区块对象本身：usePlay 存的是 props.list 的引用）
    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    const { handlePlayMusic } = usePlay({
      selectedList,
      props: newSongs,
      removeAllSelect: () => { selectedList.value = [] },
      emit: () => {},
    })
    const handlePlayList = (index: number) => { void handlePlayMusic(index, true) }

    // 地区 tab 的 v-model 与区块状态分开：加载中不该被外部改掉
    const type = ref(newSongs.type)

    return {
      newSongs,
      type,
      typeTabs: typeTabs(),
      switchNewSongType,
      handlePlayList,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  box-sizing: border-box;
  color: var(--color-font);
  display: flex;
  flex-flow: column nowrap;
}

.sectionHeader {
  flex: none;
  display: flex;
  align-items: center;
}
// base-tab 自带 15px 内边距，这里抵消掉，让 tab 与内容左对齐
.tabs {
  margin: 0 -15px 4px 0;
}

// material-online-list 内部是绝对定位，父级给确定高度
.songList {
  flex: auto;
  min-height: 0;
  position: relative;
}
</style>
