<template>
  <div :class="$style.container" class="scroll">
    <!-- 不做页头：雷达入口撤掉后（交互批次 2 / 票 06），左栏导航与 feed 里的雷达卡已经够用，
         这里再放一个「进入雷达」按钮只是重复入口 -->
    <!-- 首页推荐：服务端给的楼层（shelf）流，卡片是异构的（单曲/歌单/节目/排行榜入口/功能入口） -->
    <section :class="$style.section">
      <h3 :class="$style.title">{{ $t('discover__feed') }}</h3>
      <div v-show="!feed.noItemLabel">
        <div v-for="group in visibleGroups" :key="group.key" :class="$style.shelf">
          <h4 v-if="group.name" :class="$style.shelfTitle">{{ group.name }}</h4>
          <ul :class="$style.cards">
            <li
              v-for="card in group.cards"
              :key="`${group.key}__${card.kind}__${card.id || card.name}`"
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
import { computed, ref } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import useFeedTab, { type FeedCard } from '../useFeedTab'
import { groupShelves } from '../feedGroups'

/** 音乐雷达入口卡的 id（`tx/recommend.js:48` 的实测记录：type 900、id 22000）。 */
const RADAR_ENTRY_CARD_ID = '22000'

export default {
  name: 'DiscoverFeedPanel',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const { feed, guess, initFeedTab, loadFeed, loadGuess } = useFeedTab()

    void initFeedTab()

    // 播放复用在线列表的同一套逻辑（加入试听列表并从该位置播放）。
    // ⚠️ 传进去的是区块对象本身：usePlay 会把 props.list 的数组引用存下来，
    // 区块内的写回全部走 splice/push 原地改，所以这个引用一直有效。
    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    const { handlePlayMusic } = usePlay({
      selectedList,
      props: guess,
      removeAllSelect: () => { selectedList.value = [] },
      emit: () => {},
    })
    const handlePlayGuess = (index: number) => { void handlePlayMusic(index, true) }

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
        return { path: '/songList/detail', query: { source: 'tx', id: card.id, fromName: 'Discover', fromTab: 'recommend' } }
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
     * 渲染用的卡片组。两件事：
     *
     * 1. **只渲染有点击目标的卡片**（用户 2026-09-23 反馈后定的口径）：「一周听歌排行 / 8月听歌排行」
     *    这类排行榜卡（type 800）点不动、QQ 侧也没有对应端点，整类不渲染；雷达入口卡（type 900，
     *    id=22000）自 2026-09-23 起在 toCardTarget 里有了目标（/radar），于是自动重新出现——过滤器不用改。
     * 2. **连续的无名楼层并成一组**（票 20）：那些单卡槽各自成行会把首页推荐排成一竖列孤零零的小卡，
     *    理由与实测数字见 `../feedGroups.ts` 的文件头。
     */
    const visibleGroups = computed(() => groupShelves(feed.shelves, card => toCardTarget(card) != null))
    return {
      feed,
      guess,
      visibleGroups,
      toCardTarget,
      handleCardClick,
      handlePlayGuess,
      loadFeed,
      loadGuess,
      route,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  box-sizing: border-box;
  padding: 4px 0 30px;
  color: var(--color-font);
  overflow-y: auto;
}

.section {
  margin-top: 18px;

  &:first-child {
    margin-top: 0;
  }
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

// 歌曲区块：material-online-list 内部是绝对定位，父级给固定高度
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
