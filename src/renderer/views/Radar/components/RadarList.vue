<template>
  <div :class="$style.container">
    <div :class="$style.listPane">
      <material-online-list
        :class="$style.list"
        :list="block.list"
        :page="block.page"
        :limit="block.limit"
        :total="block.total"
        :no-item="block.noItemLabel"
        :list-id="RADAR_QUEUE_ID"
        check-api-source
        @play-list="handlePlayList"
      />
    </div>
    <div v-if="block.hasMore" :class="$style.more">
      <base-btn min :disabled="block.isLoading" @click="$emit('load-more')">{{ $t('discover__load_more') }}</base-btn>
    </div>
    <p v-if="block.moreError" :class="$style.error">{{ block.moreError }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from '@common/utils/vueTools'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import { RADAR_QUEUE_ID, type RadarBlock } from '../useRadar'

// 纯展示：取数在 ../useRadar.ts，翻页由页面发 load-more（与 views/Discover 的分工一致）。
const props = defineProps<{ block: RadarBlock }>()
defineEmits(['load-more'])

// ⚠️ 传进去的是区块对象本身（不是 `{ list: block.list }`）：usePlay 会把 props.list 的数组
// 引用存下来，而写回全部走 splice/push 原地改，所以这个引用一直有效。
// `listId` 用雷达自己的标识（工单 06 方案 B）：点任意一首 = 从这首开始连播雷达列表，
// 翻页新拿到的推荐也据此接到队列尾部（见 useRadar 的 appendToPlayQueue）。
const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
const { handlePlayMusic } = usePlay({
  selectedList,
  props: { list: props.block.list, listId: RADAR_QUEUE_ID },
  removeAllSelect: () => { selectedList.value = [] },
  emit: () => {},
})
const handlePlayList = (index: number) => { void handlePlayMusic(index, true) }
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  flex: auto;
  min-height: 0;
  display: flex;
  flex-flow: column nowrap;
}
// material-online-list 内部是「绝对定位 + 自滚动」，父级必须给出确定高度
.listPane {
  flex: auto;
  min-height: 0;
  position: relative;
}
.list {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.more {
  flex: none;
  padding: 10px 0;
  text-align: center;
}
.error {
  flex: none;
  padding-bottom: 6px;
  text-align: center;
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
