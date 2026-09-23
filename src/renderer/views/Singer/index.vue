<template>
  <div :class="$style.container" class="scroll">
    <div :class="$style.header">
      <div :class="$style.avatarBox">
        <img v-if="detail.avatar" :class="$style.avatar" loading="lazy" decoding="async" :src="detail.avatar" alt="">
      </div>
      <div :class="$style.info">
        <h2 :class="$style.name" :title="detail.name">{{ detail.name || $t('music_singer') }}</h2>
        <p :class="$style.meta">
          <span v-if="detail.musicCount">{{ $t('singer__songs') }} {{ detail.musicCount }}</span>
          <span v-if="detail.albumCount">{{ $t('singer__albums') }} {{ detail.albumCount }}</span>
        </p>
        <p v-if="detail.desc" :class="$style.desc">{{ detail.desc }}</p>
      </div>
      <div :class="$style.actions">
        <base-btn @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>

    <!-- 歌手不存在（多半是 mid 失效）时只显示这一处文案，不再让四个区块重复同一句话 -->
    <div v-if="headerLabel" :class="$style.noitemFull">
      <p v-text="headerLabel" />
    </div>
    <template v-else>
      <!-- 歌曲：分页器用不了（见 useSinger.ts 文件头第 3 条），所以自己给「加载更多」 -->
      <section :class="$style.section">
        <h3 :class="$style.title">
          {{ $t('singer__songs') }}
          <span v-if="detail.musicCount" :class="$style.count">{{ detail.musicCount }}</span>
        </h3>
        <div :class="$style.songList">
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
      </section>

      <!-- 专辑 -->
      <section :class="$style.section">
        <h3 :class="$style.title">
          {{ $t('singer__albums') }}
          <span v-if="detail.albumCount" :class="$style.count">{{ detail.albumCount }}</span>
        </h3>
        <ul v-show="!albums.noItemLabel" :class="$style.cards">
          <li v-for="item in albums.list" :key="item.mid || item.id" :class="$style.albumCard" @click="toAlbum(item)">
            <img :class="$style.albumImg" loading="lazy" decoding="async" :src="item.img" alt="">
            <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
          </li>
        </ul>
        <div v-show="albums.noItemLabel" :class="$style.noitem">
          <p v-text="albums.noItemLabel" />
        </div>
        <div v-if="albums.hasMore" :class="$style.more">
          <base-btn min :disabled="albums.isLoading" @click="loadMoreAlbums">{{ $t('singer__load_more') }}</base-btn>
        </div>
        <p v-if="albums.moreError" :class="$style.error">{{ albums.moreError }}</p>
      </section>

      <!-- MV：点卡片用 MV 页已有的播放弹窗（复用 views/Mv 的 player，不另造播放器） -->
      <section :class="$style.section">
        <h3 :class="$style.title">{{ $t('singer__mvs') }}</h3>
        <ul v-show="!mvs.noItemLabel" :class="$style.cards">
          <li v-for="item in mvs.list" :key="item.vid" :class="$style.mvCard" @click="openMv(item)">
            <div :class="$style.thumbBox">
              <img :class="$style.thumb" loading="lazy" decoding="async" :src="item.img" alt="">
              <span v-if="item.interval" :class="$style.duration">{{ item.interval }}</span>
            </div>
            <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
            <p v-if="item.playCount" :class="$style.cardMeta">{{ $t('mv__play_count') }}：{{ playText(item.playCount) }}</p>
          </li>
        </ul>
        <div v-show="mvs.noItemLabel" :class="$style.noitem">
          <p v-text="mvs.noItemLabel" />
        </div>
        <div v-if="mvs.hasMore" :class="$style.more">
          <base-btn min :disabled="mvs.isLoading" @click="loadMoreMvs">{{ $t('singer__load_more') }}</base-btn>
        </div>
        <p v-if="mvs.moreError" :class="$style.error">{{ mvs.moreError }}</p>
      </section>

      <!-- 相似歌手 -->
      <section :class="$style.section">
        <h3 :class="$style.title">{{ $t('singer__similar') }}</h3>
        <ul v-show="!similar.noItemLabel" :class="$style.cards">
          <li v-for="item in similar.list" :key="item.id" :class="$style.singerCard" @click="toSimilar(item)">
            <img :class="$style.singerImg" loading="lazy" decoding="async" :src="item.img" alt="">
            <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
          </li>
        </ul>
        <div v-show="similar.noItemLabel" :class="$style.noitem">
          <p v-text="similar.noItemLabel" />
        </div>
      </section>
    </template>

    <!-- MV 播放弹窗：组件与取流逻辑都在 MV 页，这里只负责把 show/url/详情接上 -->
    <player-modal
      :show="mvPlayer.show"
      :mv="mvPlayer.mv"
      :detail="mvPlayer.detail"
      :url="mvPlayer.url"
      :url-error="mvPlayer.urlError"
      :is-loading="mvPlayer.isLoading"
      :size-text="mvPlayer.sizeText"
      @close="closeMv"
      @retry="retryMvUrl"
    />
  </div>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { formatPlayCount } from '@renderer/utils'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import PlayerModal from '@renderer/views/Mv/components/PlayerModal.vue'
import useSinger, { type SimilarSinger, type SingerAlbum } from './useSinger'

export default {
  components: {
    PlayerModal,
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const {
      detail, headerLabel, songs, albums, mvs, similar, mvPlayer,
      initSinger, loadMoreSongs, loadMoreAlbums, loadMoreMvs, openMv, closeMv, retryMvUrl,
    } = useSinger()

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

    // 路由页没有 keep-alive，但 /singer?mid=A → /singer?mid=B 是同组件复用（setup 不会再跑），
    // 所以靠 watch 路由参数驱动取数，进入与更新两种情况都能覆盖
    watch(() => route.query.mid, (mid) => {
      void initSinger(mid)
    }, { immediate: true })

    const handleBack = () => { router.back() }
    // 专辑 mid 优先（详情接口两种参数都收）；相似歌手那边 mid 就在 id 上（数据层如此）
    const toAlbum = (item: SingerAlbum) => {
      void router.push({ path: '/album', query: { mid: item.mid || item.id } })
    }
    const toSimilar = (item: SimilarSinger) => {
      void router.push({ path: '/singer', query: { mid: item.id } })
    }
    const playText = (num: number) => formatPlayCount(num)

    return {
      detail,
      headerLabel,
      songs,
      albums,
      mvs,
      similar,
      mvPlayer,
      handlePlaySongs,
      handleBack,
      toAlbum,
      toSimilar,
      playText,
      loadMoreSongs,
      loadMoreAlbums,
      loadMoreMvs,
      openMv,
      closeMv,
      retryMvUrl,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  // 根容器带左右 padding 时必须 border-box，否则溢出窗口右侧（见 userCenter/index.vue 同名注释）
  box-sizing: border-box;
  padding: 16px 22px 30px;
  color: var(--color-font);
  overflow-y: auto;
}

.header {
  display: flex;
  flex-flow: row nowrap;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}
.avatarBox {
  flex: none;
  width: 120px;
  height: 120px;
  // 歌手头像是圆形（专辑封面是方的，两边故意不一样）
  border-radius: 50%;
  overflow: hidden;
  background-color: var(--color-button-background);
}
.avatar {
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
.meta {
  margin-top: 6px;
  font-size: 12px;
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
  .mixin-ellipsis(4);
}
.actions {
  flex: none;
  display: flex;
  align-items: flex-start;
}

.section {
  margin-top: 18px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
.count {
  margin-left: 6px;
  font-weight: 400;
  font-size: 12px;
  color: var(--color-font-label);
}

// material-online-list 内部是绝对定位 + 自滚动，父级要给出确定的高度
.songList {
  height: 360px;
  position: relative;
}

.cards {
  display: flex;
  flex-wrap: wrap;
}
.albumCard {
  width: 132px;
  margin: 0 14px 14px 0;
  cursor: pointer;

  &:hover .albumImg {
    transform: scale(1.04);
  }
}
.albumImg {
  width: 132px;
  height: 132px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
.mvCard {
  width: 208px;
  margin: 0 16px 16px 0;
  cursor: pointer;

  &:hover .thumb {
    transform: scale(1.04);
  }
}
.thumbBox {
  position: relative;
  width: 208px;
  height: 117px;
  border-radius: @radius-border;
  overflow: hidden;
  background-color: var(--color-button-background);
}
.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform @transition-fast;
}
// 时长角标压在封面上：封面图深浅不可控，必须自带反差底色（与 /mv 卡片同样处理）
.duration {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 2px 5px;
  font-size: 11px;
  color: #fff;
  background-color: rgba(0, 0, 0, .5);
}
.singerCard {
  width: 104px;
  margin: 0 12px 12px 0;
  cursor: pointer;

  &:hover .singerImg {
    transform: scale(1.04);
  }
}
.singerImg {
  width: 104px;
  height: 104px;
  border-radius: 50%;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
.cardName {
  margin-top: 6px;
  font-size: 12px;
  .mixin-ellipsis-2();
}
.cardMeta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}

.more {
  margin-top: 10px;
  text-align: center;
}
.error {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--color-font-label);
}
.noitem,
.noitemFull {
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
// 区块级空态（该区块没内容）
.noitem {
  min-height: 90px;
}
// 整页级空态（歌手不存在）：落在页面中部，别贴着顶部
.noitemFull {
  min-height: 320px;
}
</style>
