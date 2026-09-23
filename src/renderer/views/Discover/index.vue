<template>
  <div :class="$style.container" class="scroll">
    <!-- 顶部入口区：雷达独立成页后（工单 01），这里是它最显眼的入口 -->
    <div :class="$style.header">
      <h3 :class="$style.title">{{ $t('discover') }}</h3>
      <base-btn min @click="toRadar">{{ $t('radar__enter') }}</base-btn>
    </div>

    <!-- 首页推荐：服务端给的楼层（shelf）流，卡片是异构的（单曲/歌单/节目/排行榜入口/功能入口） -->
    <section :class="$style.section">
      <h3 :class="$style.title">{{ $t('discover__feed') }}</h3>
      <div v-show="!feed.noItemLabel">
        <div v-for="shelf in visibleShelves" :key="shelf.id" :class="$style.shelf">
          <h4 v-if="shelf.name" :class="$style.shelfTitle">{{ shelf.name }}</h4>
          <ul :class="$style.cards">
            <li
              v-for="card in shelf.cards"
              :key="`${shelf.id}__${card.kind}__${card.id || card.name}`"
              :class="[$style.card, {[$style.cardLink]: !!toCardTarget(card)}]"
              @click="handleCardClick(card)"
            >
              <img :class="$style.cardImg" loading="lazy" decoding="async" :src="card.img" alt="">
              <h5 :class="$style.cardName" :title="card.name">{{ card.name }}</h5>
              <p :class="$style.cardMeta">{{ card.countText || card.reason || card.subName }}</p>
            </li>
          </ul>
        </div>
      </div>
      <div v-show="feed.noItemLabel" :class="$style.noitem">
        <p v-text="feed.noItemLabel" />
      </div>
      <div v-if="feed.hasMore" :class="$style.more">
        <base-btn min :disabled="feed.isLoading" @click="loadFeed(true)">{{ $t('discover__load_more') }}</base-btn>
      </div>
      <p v-if="feed.moreError" :class="$style.error">{{ feed.moreError }}</p>
    </section>

    <!-- 推荐歌单：直接复用歌单卡片组件（它自带"点卡片进歌单详情"与分页器） -->
    <section :class="$style.section">
      <h3 :class="$style.title">{{ $t('discover__recommend_lists') }}</h3>
      <div :class="$style.gridBox">
        <song-card-grid :list-info="recommend.listInfo" @toggle-page="loadRecommend" />
      </div>
    </section>

    <!-- 新碟上架：area 实测生效，所以做成真筛选 -->
    <section :class="$style.section">
      <div :class="$style.sectionHeader">
        <h3 :class="$style.title">{{ $t('discover__new_albums') }}</h3>
        <base-tab v-model="newAlbumArea" :class="$style.tabs" :list="newAlbumTabs" item-key="area" @change="switchNewAlbumArea" />
      </div>
      <ul v-show="!newAlbums.noItemLabel" :class="$style.albumCards">
        <li v-for="item in newAlbums.list" :key="item.mid || item.id" :class="$style.albumCard" @click="toAlbum(item)">
          <img :class="$style.albumImg" loading="lazy" decoding="async" :src="item.img" alt="">
          <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
          <p :class="$style.cardMeta" :title="item.singer">{{ item.singer }}</p>
          <p :class="$style.cardMeta">{{ item.publishDate }}</p>
        </li>
      </ul>
      <div v-show="newAlbums.noItemLabel" :class="$style.noitem">
        <p v-text="newAlbums.noItemLabel" />
      </div>
      <div v-if="newAlbums.total > newAlbums.limit" :class="$style.more">
        <material-pagination :count="newAlbums.total" :limit="newAlbums.limit" :page="newAlbums.page" @btn-click="loadNewAlbums" />
      </div>
    </section>

    <!-- 新歌：一次一批，切地区 = 重拉（没有页码语义） -->
    <section :class="$style.section">
      <div :class="$style.sectionHeader">
        <h3 :class="$style.title">{{ $t('discover__new_songs') }}</h3>
        <base-tab v-model="newSongType" :class="$style.tabs" :list="newSongTabs" item-key="type" @change="switchNewSongType" />
      </div>
      <div :class="$style.songList">
        <material-online-list
          :list="newSongs.list"
          :page="newSongs.page"
          :limit="newSongs.limit"
          :total="newSongs.total"
          :no-item="newSongs.noItemLabel"
          check-api-source
          @play-list="handlePlayNewSong"
        />
      </div>
    </section>

    <!-- 猜你喜欢：服务端单批最多 5 首且每次都换，所以「换一批 = 再调一次并替换」 -->
    <section :class="$style.section">
      <div :class="$style.sectionHeader">
        <h3 :class="$style.title">{{ $t('discover__guess') }}</h3>
        <base-btn min :disabled="guess.isLoading" @click="loadGuess">{{ $t('discover__refresh') }}</base-btn>
      </div>
      <div :class="$style.songList">
        <material-online-list
          :list="guess.list"
          :page="guess.page"
          :limit="guess.limit"
          :total="guess.total"
          :no-item="guess.noItemLabel"
          check-api-source
          @play-list="handlePlayGuess"
        />
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { ref, computed } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import SongCardGrid from '@renderer/views/songList/List/components/SongList.vue'
import useDiscover, { type AlbumCard, type FeedCard } from './useDiscover'

/** 音乐雷达入口卡的 id（`tx/recommend.js:48` 的实测记录：type 900、id 22000）。 */
const RADAR_ENTRY_CARD_ID = '22000'

export default {
  components: {
    SongCardGrid,
  },
  setup() {
    const router = useRouter()
    const {
      feed,
      recommend,
      newAlbums,
      newSongs,
      guess,
      newSongTabs,
      newAlbumTabs,
      initDiscover,
      loadFeed,
      loadRecommend,
      loadNewAlbums,
      loadNewSongs,
      loadGuess,
      switchNewSongType,
      switchNewAlbumArea,
    } = useDiscover()

    void initDiscover()

    // 播放复用在线列表的同一套逻辑（加入试听列表并从该位置播放）。
    // ⚠️ 传进去的是区块对象本身（不是 `{ list: block.list }`）：usePlay 会把 props.list 的
    // 数组引用存下来，区块内的写回全部走 splice/push 原地改，所以这个引用一直有效。
    const createPlay = (block: { list: LX.Music.MusicInfoOnline[] }) => {
      const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
      const { handlePlayMusic } = usePlay({
        selectedList,
        props: block,
        removeAllSelect: () => { selectedList.value = [] },
        emit: () => {},
      })
      return (index: number) => { void handlePlayMusic(index, true) }
    }
    const handlePlayNewSong = createPlay(newSongs)
    const handlePlayGuess = createPlay(guess)

    // 新歌的 v-model 与区块状态分开：切换地区靠 @change 触发重拉，加载中也不该被外部改掉
    const newSongType = ref(newSongs.type)
    const newAlbumArea = ref(newAlbums.area)

    /**
     * 卡片能跳到哪儿 —— 卡片是异构的，而**只有三种卡片有可验证的目标**（数据层文件头第 5 条）：
     *   · 歌单卡（kind=playlist，id 是歌单 tid）→ 歌单详情页
     *   · 单曲卡（kind=song，带从封面里解析出的专辑 mid）→ 专辑页
     *   · 音乐雷达入口卡（kind=entry，id=22000）→ 雷达页（工单 01 起有了落地页）
     * 其余（节目卡、排行榜入口、未知类型）的服务端字段对不上本仓任何路由，
     * 一律不响应点击 —— 宁可不点，也不做点了没反应或跳错地方的假交互。
     */
    const toCardTarget = (card: FeedCard) => {
      if (card.kind === 'playlist' && card.id) {
        return { path: '/songList/detail', query: { source: 'tx', id: card.id, fromName: 'Discover' } }
      }
      if (card.kind === 'song' && card.albumMid) {
        return { path: '/album', query: { mid: card.albumMid } }
      }
      if (card.kind === 'entry' && card.id === RADAR_ENTRY_CARD_ID) {
        return { path: '/radar' }
      }
      return null
    }
    const handleCardClick = (card: FeedCard) => {
      const target = toCardTarget(card)
      if (target) void router.push(target)
    }
    /**
     * 只渲染**有点击目标**的卡片（用户 2026-09-23 反馈后定的口径）：
     * 「一周听歌排行 / 8月听歌排行」这类排行榜卡（type 800）点不动，且 QQ 侧**没有对应端点**
     * （参考实现 QQMusicApi 当前版 + 全历史 + 上游最新版穷举均无个人听歌排行；卡上只有
     * id="0_8"/"0_9"、subtype=810/811、jumptype=10042，没有目标 URL），做不出真交互，
     * 所以整类不渲染；雷达入口卡（type 900，id=22000）自 2026-09-23 起在 toCardTarget
     * 里有了目标（/radar），于是自动重新出现——过滤器不用改。
     */
    const visibleShelves = computed(() =>
      feed.shelves
        .map(shelf => ({ ...shelf, cards: shelf.cards.filter(card => toCardTarget(card) != null) }))
        .filter(shelf => shelf.cards.length > 0),
    )
    const toAlbum = (item: AlbumCard) => {
      // mid 优先（详情接口两种参数都收，见 tx/album.js 文件头第 2 条）
      void router.push({ path: '/album', query: { mid: item.mid || item.id } })
    }
    const toRadar = () => {
      void router.push({ path: '/radar' })
    }

    return {
      feed,
      visibleShelves,
      recommend,
      newAlbums,
      newSongs,
      guess,
      newSongTabs,
      newAlbumTabs,
      newSongType,
      newAlbumArea,
      toCardTarget,
      handleCardClick,
      toAlbum,
      toRadar,
      handlePlayNewSong,
      handlePlayGuess,
      loadFeed,
      loadRecommend,
      loadNewAlbums,
      loadNewSongs,
      loadGuess,
      switchNewSongType,
      switchNewAlbumArea,
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

.section {
  margin-top: 18px;

  &:first-child {
    margin-top: 0;
  }
}
// 顶部入口区（页面标题 + 进入雷达），不是 section 的成员，所以单独给间距
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}
.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
// base-tab 自带 15px 内边距，这里抵消掉，让 tab 与区块标题左对齐
.tabs {
  margin: 0 -15px 4px 0;
}

.shelf {
  margin-bottom: 12px;
}
.shelfTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-font-label);
  margin-bottom: 8px;
}
.cards {
  display: flex;
  flex-wrap: wrap;
}
.card {
  width: 104px;
  margin: 0 12px 12px 0;
}
.cardLink {
  cursor: pointer;

  &:hover .cardImg {
    transform: scale(1.04);
  }
}
.cardImg {
  width: 104px;
  height: 104px;
  border-radius: @radius-border;
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

// 歌单卡片组件内部是绝对定位 + 自滚动的，父级必须给出确定的高度：
// 高度按「9 条 = 每行 3 张 × 3 行」配（见 useDiscover.ts 的 RECOMMEND_PAGE_SIZE）
.gridBox {
  height: 660px;
  position: relative;
}

.albumCards {
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

// 歌曲区块：material-online-list 内部同样是绝对定位，父级给固定高度
.songList {
  height: 320px;
  position: relative;
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
.noitem {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 90px;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
</style>
