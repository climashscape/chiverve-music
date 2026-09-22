<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <div :class="$style.coverBox">
        <img v-if="detail.img" :class="$style.cover" loading="lazy" decoding="async" :src="detail.img" alt="">
      </div>
      <div :class="$style.info">
        <h2 :class="$style.name" :title="detail.name">{{ detail.name || $t('music_album') }}</h2>
        <p v-if="detail.singers.length || detail.singer" :class="$style.singer" :title="detail.singer">
          <!-- 歌手名可点进歌手页：优先用接口给的 singers（带 mid），拿不到 mid 的名字保持纯文本 -->
          <template v-if="detail.singers.length">
            <template v-for="(singer, index) in detail.singers" :key="singer.mid || singer.name">
              <span v-if="index" :class="$style.singerGap">、</span>
              <span v-if="singer.mid" :class="$style.singerLink" @click.stop="toSinger(singer)">{{ singer.name }}</span>
              <span v-else>{{ singer.name }}</span>
            </template>
          </template>
          <template v-else>{{ detail.singer }}</template>
        </p>
        <p :class="$style.meta">
          <span v-if="detail.publishDate">{{ $t('album__publish_date') }}：{{ detail.publishDate }}</span>
          <span v-if="detail.company">{{ $t('album__company') }}：{{ detail.company }}</span>
          <span v-if="detail.language">{{ $t('album__language') }}：{{ detail.language }}</span>
          <span v-if="detail.albumType">{{ $t('album__type') }}：{{ detail.albumType }}</span>
          <span v-if="detail.genre">{{ $t('album__genre') }}：{{ detail.genre }}</span>
        </p>
        <p v-if="detail.desc" :class="$style.desc">{{ detail.desc }}</p>
      </div>
      <div :class="$style.actions">
        <base-btn @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>

    <!-- 详情失败（多半是专辑不存在）时只显示这一处文案，不再让歌曲列表重复同一句话 -->
    <div v-if="headerLabel" :class="$style.noitem">
      <p v-text="headerLabel" />
    </div>
    <template v-else>
      <h3 :class="$style.title">
        {{ $t('album__songs') }}
        <span v-if="songs.total" :class="$style.count">{{ songs.total }}</span>
      </h3>
      <div :class="$style.list">
        <material-online-list
          :list="songs.list"
          :page="songs.page"
          :limit="songs.limit"
          :total="songs.total"
          :no-item="songs.noItemLabel"
          check-api-source
          @toggle-page="handleTogglePage"
          @play-list="handlePlayList"
        />
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import useAlbum from './useAlbum'

export default {
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { detail, songs, headerLabel, initAlbum, loadSongPage } = useAlbum()

    // 播放复用在线列表的同一套逻辑。
    // ⚠️ 传歌曲区块对象本身（不是 `{ list: songs.list }`）：usePlay 存的是 props.list 的数组
    // 引用，区块内写回全部走 splice，所以引用一直有效。
    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    const { handlePlayMusic } = usePlay({
      selectedList,
      props: songs,
      removeAllSelect: () => { selectedList.value = [] },
      emit: () => {},
    })
    const handlePlayList = (index: number) => { void handlePlayMusic(index, true) }

    // 路由页没有 keep-alive，但 /album?mid=A → /album?mid=B 是同组件复用（setup 不会再跑），
    // 所以靠 watch 路由参数驱动取数，进入与更新两种情况都能覆盖
    watch(() => route.query.mid, (mid) => {
      void initAlbum(mid)
    }, { immediate: true })

    const handleTogglePage = (page: number) => {
      loadSongPage(page)
    }
    const handleBack = () => { router.back() }
    // 专辑详情的歌手条目带 mid（tx/album.js 的 toSinger），据此跳歌手页
    const toSinger = (singer: { mid: string, name: string }) => {
      if (!singer.mid) return
      void router.push({ path: '/singer', query: { mid: singer.mid } })
    }

    return {
      detail,
      songs,
      headerLabel,
      handleTogglePage,
      handlePlayList,
      handleBack,
      toSinger,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  padding: 16px 22px 0;
  color: var(--color-font);
  display: flex;
  flex-flow: column nowrap;
}

.header {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}
.coverBox {
  flex: none;
  width: 120px;
  height: 120px;
  border-radius: @radius-border;
  overflow: hidden;
  background-color: var(--color-button-background);
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info {
  flex: auto;
  min-width: 0;
  padding: 0 14px;
}
.name {
  font-size: 17px;
  font-weight: 600;
  .mixin-ellipsis-1();
}
.singer {
  margin-top: 6px;
  font-size: 13px;
  .mixin-ellipsis-1();
}
// 歌手名可点（M6）：只做颜色过渡，不加下划线——专辑页是信息区，下划线会显得很吵
.singerLink {
  cursor: pointer;
  transition: color @transition-fast;

  &:hover {
    color: var(--color-primary);
  }
}
.singerGap {
  color: var(--color-font-label);
}
.meta {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-font-label);

  span {
    margin-right: 12px;
  }
}
.desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-font-label);
  .mixin-ellipsis(3);
}
.actions {
  flex: none;
  display: flex;
  align-items: flex-start;
}

.title {
  flex: none;
  margin-top: 14px;
  font-size: 14px;
  font-weight: 600;
}
.count {
  margin-left: 6px;
  font-weight: 400;
  font-size: 12px;
  color: var(--color-font-label);
}

// material-online-list 内部是绝对定位 + 自滚动，父级要给出确定的高度
.list {
  flex: auto;
  min-height: 0;
  position: relative;
}
.noitem {
  flex: auto;
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
</style>
