<template>
  <div :class="$style.container" class="scroll">
    <div :class="$style.header">
      <base-btn @click="handleBack">{{ $t('back') }}</base-btn>
    </div>

    <div v-if="detail.errorLabel" :class="$style.error" v-text="detail.errorLabel" />

    <template v-else>
      <!-- 头部：封面 + 歌名/歌手/专辑/时长（点专辑名进专辑页） -->
      <div :class="$style.song">
        <img :class="$style.cover" loading="lazy" decoding="async" :src="detail.img" alt="">
        <div :class="$style.songInfo">
          <h2 :class="$style.name" :title="detail.name">{{ detail.name }}</h2>
          <!-- `.stop` 不能删（工单 23）：多歌手时这次点击打开选择菜单，而 base-menu 的「点空白收起」挂在
               document 上——不停住冒泡，菜单会被打开它的这次点击立刻关掉（详见 useMusicJump 里 picker 的注释） -->
          <p
            :class="[$style.meta, ...(detail.singers.length ? [$style.link] : [])]"
            :title="detail.singers.length ? $t('list__jump_singer') : $t('list__jump_singer_disabled')"
            @click.stop="handleSingerClick"
          >{{ detail.singer }}</p>
          <p v-if="detail.albumMid" :class="[$style.meta, $style.link]" @click="toAlbum">{{ detail.albumName }}</p>
          <p v-else-if="detail.albumName" :class="$style.meta">{{ detail.albumName }}</p>
          <p :class="$style.meta">{{ detail.interval }}</p>
          <p :class="[$style.meta, $style.link]" @click="handleOpenPlayDetail">{{ $t('song_detail__open_play_detail') }}</p>
        </div>
      </div>

      <!-- 歌曲详情：唱片公司 / 流派 / 发行时间 / 语言 + 简介 -->
      <section :class="$style.section">
        <h3 :class="$style.title">{{ $t('song_detail__info') }}</h3>
        <ul :class="$style.infoList">
          <li v-for="item in infoRows" :key="item.label" :class="$style.infoRow">
            <span :class="$style.infoLabel">{{ item.label }}</span>
            <span :class="$style.infoValue">{{ item.value }}</span>
          </li>
        </ul>
        <p v-if="detail.desc" :class="$style.desc">{{ detail.desc }}</p>
      </section>

      <!-- 相似歌曲：可播（加入试听列表并从该位置播放，与在线列表同一套） -->
      <section :class="$style.section">
        <h3 :class="$style.title">{{ $t('song_detail__similar') }}</h3>
        <div :class="$style.songList">
          <material-online-list
            :list="similar.list"
            :page="similar.page"
            :limit="similar.limit"
            :total="similar.total"
            :no-item="similar.noItemLabel"
            check-api-source
            @play-list="handlePlaySimilar"
          />
        </div>
      </section>

      <!-- 相关歌单：卡片 → 本仓歌单详情页 -->
      <section :class="$style.section">
        <h3 :class="$style.title">{{ $t('song_detail__playlists') }}</h3>
        <p v-if="relatedPlaylists.noItemLabel" :class="$style.empty" v-text="relatedPlaylists.noItemLabel" />
        <ul v-else :class="$style.cards">
          <li v-for="item in relatedPlaylists.list" :key="item.id" :class="$style.card" @click="toPlaylist(item)">
            <img :class="$style.cardImg" loading="lazy" decoding="async" :src="item.img" alt="">
            <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
            <p :class="$style.cardMeta">{{ item.total }} 首</p>
          </li>
        </ul>
      </section>

      <!-- 相关 MV：卡片 → 复用乐馆 MV 的播放弹窗 -->
      <section :class="$style.section">
        <h3 :class="$style.title">{{ $t('song_detail__mvs') }}</h3>
        <p v-if="relatedMvs.noItemLabel" :class="$style.empty" v-text="relatedMvs.noItemLabel" />
        <ul v-else :class="$style.cards">
          <li v-for="item in relatedMvs.list" :key="item.id" :class="[$style.card, $style.mvCard]" @click="openMv(item)">
            <div :class="$style.thumbBox">
              <img :class="$style.thumb" loading="lazy" decoding="async" :src="item.img" alt="">
            </div>
            <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
            <p :class="$style.cardMeta" :title="item.singer">{{ item.singer }}</p>
          </li>
        </ul>
      </section>

      <!-- 其他版本：可播 -->
      <section :class="$style.section">
        <h3 :class="$style.title">{{ $t('song_detail__other_versions') }}</h3>
        <div :class="$style.songList">
          <material-online-list
            :list="otherVersions.list"
            :page="otherVersions.page"
            :limit="otherVersions.limit"
            :total="otherVersions.total"
            :no-item="otherVersions.noItemLabel"
            check-api-source
            @play-list="handlePlayOther"
          />
        </div>
      </section>
    </template>

    <mv-player-modal
      :show="player.show"
      :mv="player.mv"
      :detail="player.detail"
      :url="player.url"
      :url-error="player.urlError"
      :is-loading="player.isLoading"
      :size-text="player.sizeText"
      @close="closePlayer"
      @retry="retryUrl"
    />
    <!-- 多位歌手时让用户挑（工单 02）：与歌曲表同一套 base-menu -->
    <base-menu v-model="isShowSingerPicker" :menus="singerPickerMenus()" :xy="singerPickerXy" item-name="name" @menu-click="handleSingerPickerClick" />
  </div>
</template>

<script lang="ts">
import { computed, ref } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import MvPlayerModal from '@renderer/components/common/MvPlayerModal.vue'
import { player, openMv as openMvPlayer, closePlayer, retryUrl, type MvInfo } from '@renderer/store/mv'
import { setShowPlayerDetail } from '@renderer/store/player/action'
import useMusicJump from '@renderer/utils/compositions/useMusicJump'
import useSongDetail, { relatedMvs, relatedPlaylists } from './useSongDetail'

/**
 * 歌曲详情页（工单 09）：`/songDetail?source=tx&mid=<songmid>`。
 *
 * 从歌曲右键菜单的「歌曲详情」进来（原来那一项是**打开 QQ 网页**，现在进本页）。
 * 五个块各自独立三段式：详情失败时四个关联块不发请求、只落空态；某个关联块失败不拖累其它块。
 */
export default {
  name: 'SongDetail',
  components: {
    MvPlayerModal,
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { detail, similar, otherVersions, load } = useSongDetail()

    const mid = computed(() => (route.query.mid as string) ?? '')
    if (mid.value) void load(mid.value)

    const infoRows = computed(() => [
      { label: window.i18n.t('song_detail__company' as any), value: detail.info.company },
      { label: window.i18n.t('song_detail__genre' as any), value: detail.info.genre },
      { label: window.i18n.t('song_detail__pub_time' as any), value: detail.info.pubTime },
      { label: window.i18n.t('song_detail__lan' as any), value: detail.info.lan },
    ].filter(row => row.value))

    // 播放复用在线列表那一套（工单 06 方案 B：点一首 = 从这首开始连播这个列表，
    // 所以队列身份要带上本页的上下文，见 usePlay 的 queueId）
    const createPlay = (block: { list: LX.Music.MusicInfoOnline[] }, listId: string) => {
      const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
      const { handlePlayMusic } = usePlay({
        selectedList,
        props: { list: block.list, listId },
        removeAllSelect: () => { selectedList.value = [] },
        emit: () => {},
      })
      return (index: number) => { void handlePlayMusic(index, true) }
    }
    const handlePlaySimilar = createPlay(similar, `songDetail__similar__${mid.value}`)
    const handlePlayOther = createPlay(otherVersions, `songDetail__versions__${mid.value}`)

    const handleBack = () => { router.back() }
    // 头部的歌手名可点（工单 02）：详情接口已经给了每位歌手的 mid（trackRaw.singer[]），
    // 所以这里不用再发请求；多位歌手时弹出选择菜单（与歌曲表同一套 base-menu）
    const { jumpToSingerList, isShowSingerPicker, singerPickerXy, singerPickerMenus, handleSingerPickerClick } = useMusicJump()
    const handleSingerClick = (event: MouseEvent) => {
      if (!detail.singers.length) return
      jumpToSingerList(detail.singers, event)
    }
    // 回到播放详情（工单 02 的互跳；这一页原来整页没有可点元素）。
    // 播放详情是覆盖层（不是路由），打开它即可——它显示的永远是「正在播放的那首」。
    const handleOpenPlayDetail = () => {
      setShowPlayerDetail(true)
    }
    const toAlbum = () => {
      if (detail.albumMid) void router.push({ path: '/album', query: { mid: detail.albumMid } })
    }
    const toPlaylist = (item: { id: string }) => {
      if (!item.id) return
      void router.push({ path: '/songList/detail', query: { source: 'tx', id: item.id } })
    }
    /** 相关 MV 只有列表字段，映射成 `MvInfo` 交给乐馆那套播放逻辑（同歌手页 / 搜索页）。 */
    const openMv = (item: { vid: string, name: string, img: string, singer: string, playCount: number }) => {
      if (!item.vid) return
      const info: MvInfo = {
        id: item.vid,
        vid: item.vid,
        name: item.name,
        subName: '',
        img: item.img,
        singer: item.singer,
        interval: null,
        duration: 0,
        playCount: item.playCount,
      }
      openMvPlayer(info)
    }

    return {
      detail,
      similar,
      otherVersions,
      relatedPlaylists,
      relatedMvs,
      infoRows,
      player,
      handlePlaySimilar,
      handlePlayOther,
      handleBack,
      toAlbum,
      toPlaylist,
      openMv,
      closePlayer,
      retryUrl,
      handleSingerClick,
      handleOpenPlayDetail,
      isShowSingerPicker,
      singerPickerXy,
      singerPickerMenus,
      handleSingerPickerClick,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  // 根容器带左右 padding 时必须 border-box，否则溢出窗口右侧（AGENTS §2.5.1 第 10 条）
  box-sizing: border-box;
  padding: 16px 22px 30px;
  color: var(--color-font);
  overflow-y: auto;
}

// 头部区域与歌手页**同一套**（工单 24，以歌手页为准）：
// 返回键靠右（票 14：`.actions` 在歌手页 header 的末位、专辑页动作条的末位，都贴容器右缘）、
// `padding-bottom: 14px` + 同一条分隔线、`.song` 与 header 之间留 18px（歌手页 `.section` 的取值）。
// 量测对照表见 .scratch/ui-polish-2/issues/24-song-detail-header-alignment.md
.header {
  display: flex;
  flex-flow: row nowrap;
  justify-content: flex-end;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}

.error {
  padding: 30px 0;
  text-align: center;
  font-size: 14px;
  color: var(--color-font-label);
}

// 封面/歌名这一块与 header 之间留 18px：歌手页第一块（`.section`）就是 18px，原来这里是 0，
// 封面紧贴分隔线（工单 24 的「上方排版和歌手页没对齐」）
.song {
  display: flex;
  align-items: center;
  margin-top: 18px;
}
.cover {
  flex: none;
  width: 120px;
  height: 120px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: var(--color-button-background);
}
.songInfo {
  min-width: 0;
  padding-left: 16px;
}
.name {
  font-size: 18px;
  font-weight: 600;
  .mixin-ellipsis-2();
}
.meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
.link {
  cursor: pointer;
  transition: color @transition-fast;

  &:hover {
    color: var(--color-primary);
  }
}

.section {
  margin-top: 20px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

.infoList {
  font-size: 12px;
}
.infoRow {
  display: flex;
  margin-bottom: 4px;
}
.infoLabel {
  flex: none;
  width: 72px;
  color: var(--color-font-label);
}
.infoValue {
  min-width: 0;
  .mixin-ellipsis-2();
}
.desc {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-font-label);
  white-space: pre-wrap;
}

// material-online-list 内部是绝对定位自滚动，父级必须给定高
.songList {
  height: 320px;
  position: relative;
}

.empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--color-font-label);
}

.cards {
  display: flex;
  flex-wrap: wrap;
}
.card {
  width: 132px;
  margin: 0 14px 14px 0;
  cursor: pointer;

  &:hover .cardImg,
  &:hover .thumb {
    transform: scale(1.04);
  }
}
.cardImg {
  width: 132px;
  height: 132px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
.mvCard {
  width: 208px;
}
.thumbBox {
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
.cardName {
  margin-top: 6px;
  font-size: 13px;
  .mixin-ellipsis-2();
}
.cardMeta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
</style>
