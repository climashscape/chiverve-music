<template>
  <div :class="$style.container">
    <!-- 账号卡：昵称/头像/关注粉丝访客 + VIP。**固定在顶部**（工单 02）：它是 flex 列里
         不可伸缩的第一行，下面的内容区自己滚动——不是 sticky（那会在滚动时露出下面的内容） -->
    <div :class="$style.profile">
      <div :class="$style.avatarBox">
        <img v-if="profile.avatar" :class="$style.avatar" :src="profile.avatar" alt="">
        <svg v-else :class="$style.avatarEmpty" viewBox="0 0 448 456"><use xlink:href="#icon-user" /></svg>
      </div>
      <div :class="$style.info">
        <h2 :class="$style.nick">{{ profile.name || $t('user_center__not_logged_in') }}</h2>
        <p :class="$style.meta">
          <span v-if="vip.hires || vip.dolby" :class="$style.vipBadge">{{ $t('user_center__vip') }}</span>
          <span>{{ $t('user_center__follow') }} {{ profile.follow }}</span>
          <span>{{ $t('user_center__fans') }} {{ profile.fans }}</span>
          <span>{{ $t('user_center__visitor') }} {{ profile.visitor }}</span>
        </p>
        <p v-if="labels.profile" :class="$style.tip">{{ labels.profile }}</p>
      </div>
      <base-btn min :disabled="isLoading" @click="handleRefresh">{{ $t('user_center__refresh') }}</base-btn>
    </div>

    <div :class="$style.content" class="scroll">
      <!-- 听歌基因：接口与状态早就有了（store/user 的 musicGene），这里把它显示出来 -->
      <section v-if="hasGene || labels.musicGene" :class="$style.section">
        <h3 :class="$style.title">{{ $t('user_center__music_gene') }}</h3>
        <p v-if="musicGene.mainDescription" :class="$style.geneDesc">{{ musicGene.mainDescription }}</p>
        <div v-if="musicGene.singers.length" :class="$style.geneRow">
          <h4 :class="$style.geneLabel">{{ $t('user_center__gene_singers') }}</h4>
          <ul :class="$style.geneList">
            <li v-for="item in musicGene.singers" :key="`singer__${item.id}`" :class="$style.geneItem" :title="item.slogan || item.name">
              <img :class="$style.geneImg" loading="lazy" decoding="async" :src="item.img" alt="">
              <span :class="$style.geneName">{{ item.name }}</span>
            </li>
          </ul>
        </div>
        <div v-if="musicGene.genres.length" :class="$style.geneRow">
          <h4 :class="$style.geneLabel">{{ $t('user_center__gene_genres') }}</h4>
          <ul :class="$style.geneList">
            <li v-for="item in musicGene.genres" :key="`genre__${item.id}`" :class="$style.geneItem" :title="item.slogan || item.name">
              <img :class="$style.geneImg" loading="lazy" decoding="async" :src="item.img" alt="">
              <span :class="$style.geneName">{{ item.name }}</span>
            </li>
          </ul>
        </div>
        <p v-if="labels.musicGene" :class="$style.tip">{{ labels.musicGene }}</p>
      </section>

      <!-- 我喜欢：直接可播（分页加载更多） -->
      <section :class="$style.section">
      <h3 :class="$style.title">
        {{ $t('user_center__fav_songs') }}
        <span v-if="favSongs.total" :class="$style.count">{{ favSongs.total }}</span>
      </h3>
      <div :class="$style.songList">
        <material-online-list
          :list="favSongs.list"
          :no-item="labels.favSongs"
          :page="favSongs.page"
          :limit="favSongs.total || favSongs.limit"
          :total="favSongs.total"
          check-api-source
          @play-list="handlePlayFav"
        />
      </div>
      <div v-if="favSongs.list.length && favSongs.list.length < favSongs.total" :class="$style.more">
        <base-btn min @click="loadMoreFavSongs">{{ $t('user_center__load_more') }}</base-btn>
      </div>
    </section>

      <!--
        「我的歌单」「收藏的歌单」「收藏的专辑」「关注的歌手」四个板块已迁出（工单 05/06）：
        收藏类归「我的收藏」页（/favorites），歌单归「我的歌单」页（/playlists）。
        留在这里就等于同一个东西散落两处——那正是本次 IA 重组要解决的问题。
      -->
    </div>
  </div>
</template>

<script>
import { ref } from '@common/utils/vueTools'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import {
  favSongs, isLoading, labels, musicGene, profile, vip,
} from '@renderer/store/user/state'
import {
  initUserCenter, loadMoreFavSongs,
} from '@renderer/store/user/action'

export default {
  setup() {
    void initUserCenter()

    // 播放复用「在线列表」组件的同一套逻辑（加入默认列表并从该位置播放），不另写一份
    const selectedList = ref([])
    const { handlePlayMusic } = usePlay({
      selectedList,
      props: { list: favSongs.list },
      removeAllSelect: () => { selectedList.value = [] },
      emit: () => {},
    })

    const handleRefresh = () => { void initUserCenter(true) }
    const handlePlayFav = (index) => { void handlePlayMusic(index, true) }

    // 「无数据时不出现空白块」：有歌手或曲风才算有基因（接口未登录时会抛错，那时只留 labels 文案）
    const hasGene = computed(() => !!(musicGene.singers.length || musicGene.genres.length || musicGene.mainDescription))

    return {
      profile,
      vip,
      labels,
      isLoading,
      musicGene,
      hasGene,
      favSongs,
      handleRefresh,
      handlePlayFav,
      loadMoreFavSongs,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  // 路由页根容器带左右 padding 时必须 border-box：View.vue 给的是 width:100% + 默认 content-box，
  // 否则整块比窗口宽出 2×padding，右侧内容（按钮等）被挤出可视区
  box-sizing: border-box;
  padding: 16px 22px 0;
  color: var(--color-font);
  // 账号卡固定、内容区自己滚（工单 02）——整页滚动的写法是 sticky 或整块 overflow，
  // 这里用最省事的 flex 列：第一行不可伸缩，第二行吃掉剩余高度并滚动
  display: flex;
  flex-flow: column nowrap;
}

// 内容区：`.scroll` 是全局类（滚动条样式），这里只负责高度与滚动
.content {
  flex: auto;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 30px;
}

.profile {
  flex: none;
  display: flex;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}
.avatarBox {
  flex: none;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  overflow: hidden;
  background-color: var(--color-button-background);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatarEmpty {
  width: 55%;
  height: 55%;
  color: var(--color-font-label);
}
.info {
  flex: auto;
  min-width: 0;
  padding: 0 14px;
}
.nick {
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
.vipBadge {
  padding: 1px 6px;
  border-radius: @radius-border;
  background-color: var(--color-primary-alpha-800);
  color: var(--color-primary);
}
.tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-font-label);
}

.section {
  margin-top: 18px;
}

// ---------- 听歌基因 ----------
.geneDesc {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--color-font-label);
}
.geneRow {
  margin-top: 8px;
}
.geneLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-font-label);
  margin-bottom: 6px;
}
.geneList {
  display: flex;
  flex-wrap: wrap;
}
.geneItem {
  display: flex;
  align-items: center;
  width: 168px;
  margin: 0 12px 10px 0;
  padding: 4px 8px 4px 4px;
  border-radius: @radius-border;
  background-color: var(--color-button-background);
}
.geneImg {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  background-color: var(--color-content-background);
}
.geneName {
  min-width: 0;
  padding-left: 8px;
  font-size: 12px;
  .mixin-ellipsis-1();
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
.songList {
  height: 320px;
  position: relative;
}
// 歌单卡片组件（views/songList/List/components/SongList.vue）内部是"绝对定位的滚动区
// + height:100%"，必须给它一个**定高**父级，否则 height 链条塌成 0、卡片被裁掉（实测踩过）
.grid {
  height: 316px;
  position: relative;
}
.more {
  margin-top: 10px;
  text-align: center;
}

.cards {
  display: flex;
  flex-wrap: wrap;
}
.card {
  width: 132px;
  margin: 0 14px 14px 0;
  cursor: pointer;

  &:hover .cardImg {
    transform: scale(1.04);
  }
}
.cardImg {
  width: 132px;
  height: 132px;
  border-radius: @radius-border;
  object-fit: cover;
  transition: transform @transition-fast;
}
.cardName {
  margin-top: 6px;
  font-size: 13px;
  .mixin-ellipsis-1();
}
.cardMeta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}

.singers {
  display: flex;
  flex-wrap: wrap;
}
.singer {
  display: flex;
  align-items: center;
  width: 220px;
  margin: 0 16px 12px 0;
  cursor: pointer;

  &:hover .singerImg {
    transform: scale(1.05);
  }
}
.singerImg {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: cover;
  transition: transform @transition-fast;
}
.singerInfo {
  min-width: 0;
  padding-left: 10px;
}
</style>
