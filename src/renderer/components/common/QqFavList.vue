<template>
  <div :class="$style.container">
    <div :class="$style.listPane">
      <material-online-list
        :class="$style.list"
        :list="list"
        :no-item="noItem"
        :page="page"
        :limit="limit"
        :total="total"
        :list-id="listId"
        check-api-source
        show-remove-btn
        :remove-label="$t('list__unlove')"
        @play-list="$emit('play-list', $event)"
        @remove-music="$emit('unlove', $event)"
      />
    </div>
    <div v-if="list.length && list.length < total" :class="$style.more">
      <base-btn min @click="$emit('load-more')">{{ $t('user_center__load_more') }}</base-btn>
    </div>
  </div>
</template>

<script setup>
// QQ 音乐「我喜欢」（云端 dirId=201）在「我的收藏」页里的展示。
// 纯展示组件：取数与播放都留在 views/Favorites/components/SongsPanel.vue（与 store/user 的分工一致）。
defineProps({
  list: {
    type: Array,
    default() {
      return []
    },
  },
  noItem: {
    type: String,
    default: '',
  },
  page: {
    type: Number,
    required: true,
  },
  limit: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
  // 播放队列的身份（ui-polish-followups 工单 09）：由宿主传进来，与宿主自己那份 usePlay 用同一个
  // 标识（`views/Favorites/components/SongsPanel.vue` 的 FAV_LIST_ID）——两条播放入口才落到一串队列上
  listId: {
    type: String,
    default: '',
  },
})
defineEmits(['play-list', 'load-more', 'unlove'])
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
// （同 views/Leaderboard/MusicList、views/userCenter 的写法）
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
</style>
