<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <h3 :class="$style.title" :title="card?.name">{{ card?.name }}</h3>
      <div :class="$style.btns">
        <base-btn min :disabled="isAdding" @click="isShowAddModal = true">{{ $t('playlists__cloud_add_songs') }}</base-btn>
        <base-btn min :disabled="isLoading" @click="load(1, false)">{{ $t('user_center__refresh') }}</base-btn>
      </div>
    </div>

    <div :class="$style.listPane">
      <material-online-list
        :class="$style.list"
        :list="cloudListSongs.list"
        :no-item="cloudListSongs.noItemLabel"
        :page="cloudListSongs.page"
        :limit="cloudListSongs.total || cloudListSongs.limit"
        :total="cloudListSongs.total"
        :list-id="`cloud_${dirId}`"
        check-api-source
        show-remove-btn
        :remove-label="$t('playlists__cloud_remove_song')"
        @play-list="handlePlayList"
        @remove-music="handleRemoveSong"
      />
    </div>
    <div v-if="cloudListSongs.list.length && cloudListSongs.list.length < cloudListSongs.total" :class="$style.more">
      <base-btn min :disabled="isLoading" @click="load(cloudListSongs.page + 1, true)">{{ $t('user_center__load_more') }}</base-btn>
    </div>

    <add-songs-modal v-model:show="isShowAddModal" :card="card" />
  </div>
</template>

<script lang="ts">
import { computed, ref } from '@common/utils/vueTools'
import { createdLists, cloudListSongs } from '@renderer/store/user/state'
import { loadCloudListSongs, removeSongsFromCloudList } from '@renderer/store/user/action'
import useOnlinePlay from '@renderer/components/material/OnlineList/usePlay'
import { dialog } from '@renderer/plugins/Dialog'
import AddSongsModal from './AddSongsModal.vue'

/**
 * 我的歌单 → 云端自建歌单：歌曲表 + 加歌 / 删歌（工单 06）。
 *
 * 取歌走 `getListDetailByCgi`（dir 型歌单也能读），写走 AddSonglist / DelSonglist。
 * 播放复用在线列表那一套（加入试听列表并从该位置播放）——云端的歌不是本地列表成员，
 * 与 `ListMusicTable` 的本地播放语义不同。
 */
export default {
  name: 'CloudListPane',
  components: {
    AddSongsModal,
  },
  props: {
    dirId: {
      type: String,
      required: true,
    },
  },
  setup(props: { dirId: string }) {
    const t = (key: string, params?: any) => window.i18n.t(key as any, params)

    const card = computed(() => createdLists.find(item => String(item.dirId) === props.dirId) ?? null)
    const isLoading = ref(false)
    const isAdding = ref(false)

    /**
     * 取歌用的歌单标识 —— **必须是卡片的 tid**（`createdLists` 的 `id`）。
     * 读歌走 `CgiGetDiss` 的 `disstid`，给它 dirId 服务端恒返回 0 首（实测，见
     * `docs/agents/qq-music-native.md`「读 tid、写 dirId」）；写歌才用 dirId。
     * 卡片没到就什么都不请求——**不要拿 dirId 兜底**，那正是「刷新把列表清空」的成因。
     */
    const listTid = computed(() => String(card.value?.id ?? ''))

    const load = async(page: number, more: boolean) => {
      if (!listTid.value) return
      isLoading.value = true
      try {
        await loadCloudListSongs(listTid.value, page, more)
      } finally {
        isLoading.value = false
      }
    }
    void load(1, false)

    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    const { handlePlayMusic } = useOnlinePlay({
      selectedList,
      // 队列身份（工单 06 方案 B）：云端歌单面板用 dirId，与「歌单详情页」那套 id 区分开
      props: { list: cloudListSongs.list, listId: `cloud_${props.dirId}` },
      removeAllSelect: () => { selectedList.value = [] },
      emit: () => {},
    })
    const handlePlayList = (index: number) => {
      void handlePlayMusic(index, true)
    }

    // 删歌：行内按钮 → 二次确认 → 写 QQ（失败给出明确提示，不静默）
    const handleRemoveSong = async(index: number) => {
      const musicInfo = cloudListSongs.list[index]
      if (musicInfo == null || card.value == null) return
      const confirm = await dialog.confirm({
        message: t('playlists__cloud_remove_song_tip', { name: musicInfo.name }),
        confirmButtonText: t('playlists__cloud_remove_song'),
      })
      if (!confirm) return
      isAdding.value = true
      try {
        await removeSongsFromCloudList(card.value, [musicInfo])
      } catch (err: any) {
        void dialog({ message: err?.message || String(err), type: 'error' })
      } finally {
        isAdding.value = false
      }
    }

    return {
      card,
      cloudListSongs,
      isLoading,
      isAdding,
      isShowAddModal: ref(false),
      load,
      handlePlayList,
      handleRemoveSong,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
}

.header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  .mixin-ellipsis-1();
}
.btns {
  flex: none;
  display: flex;
  gap: 8px;
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
</style>
