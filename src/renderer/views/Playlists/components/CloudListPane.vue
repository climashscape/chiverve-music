<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <h3 :class="$style.title" :title="card?.name">{{ card?.name }}</h3>
      <div :class="$style.btns">
        <base-btn min :disabled="isAdding" @click="isShowAddModal = true">{{ $t('playlists__cloud_add_songs') }}</base-btn>
        <base-btn min :disabled="isLoading" @click="loadCloudListSongs(dirId, 1, false)">{{ $t('user_center__refresh') }}</base-btn>
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
        check-api-source
        show-remove-btn
        :remove-label="$t('playlists__cloud_remove_song')"
        @play-list="handlePlayList"
        @remove-music="handleRemoveSong"
      />
    </div>
    <div v-if="cloudListSongs.list.length && cloudListSongs.list.length < cloudListSongs.total" :class="$style.more">
      <base-btn min @click="loadCloudListSongs(dirId, cloudListSongs.page + 1, true)">{{ $t('user_center__load_more') }}</base-btn>
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

    const load = async(page: number, more: boolean) => {
      isLoading.value = true
      try {
        await loadCloudListSongs(String(card.value?.id ?? props.dirId), page, more)
      } finally {
        isLoading.value = false
      }
    }
    void load(1, false)

    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    const { handlePlayMusic } = useOnlinePlay({
      selectedList,
      props: { list: cloudListSongs.list },
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
      loadCloudListSongs,
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
