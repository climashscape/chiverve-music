<template>
  <div :class="$style.container">
    <ul :class="$style.list">
      <!-- 点歌行 = 从这首开始播（队列 = 本页全部歌曲行）；专辑行的行本身不可点，只有名字可点 -->
      <li
        v-for="item in items" :key="item.id"
        :class="[
          $style.row,
          { [$style.freshRow]: isFresh(item) },
          { [$style.playable]: item.kind === 'song' },
        ]"
        @click="handleRowClick(item)"
        @contextmenu.prevent="showRowMenu($event, item)"
      >
        <!-- 两种行的标签同款同色：只靠文字区分（新专行不值得比新歌行更响） -->
        <span :class="$style.kind">
          {{ item.kind === 'song' ? $t('follow__kind_song') : $t('follow__kind_album') }}
        </span>
        <div :class="$style.body">
          <div :class="$style.nameLine">
            <!-- 专辑行的专辑名可点（进专辑页）；歌名点了由整行承担「从这首开始播」。
                 可点名的 title 写**动作**（跳转提示）、aria-label 写名字——写了 title 就等于占了
                 可访问名，得用 aria-label 拿回来（在线歌曲表那几列同款，AGENTS §2.5.1 第 11 条） -->
            <span
              :class="item.kind === 'album' ? [$style.name, $style.clickable] : $style.name"
              :title="item.kind === 'album' ? $t('list__jump_album') : item.name"
              :aria-label="item.name"
              @click.stop="item.kind === 'album' && jumpToAlbumRow(item)"
            >{{ item.name }}</span>
            <span v-if="isFresh(item)" :class="$style.fresh">{{ $t('follow__fresh') }}</span>
          </div>
          <div :class="$style.meta">
            <!-- `.stop`：点名字是跳转，别把整行的「播放」也带出来 -->
            <span
              :class="$style.singer" :title="$t('list__jump_singer')" :aria-label="item.singerName"
              @click.stop="jumpToSinger(item)"
            >{{ item.singerName }}</span>
            <!-- 曲目数只有新专行有（新歌行为 null）；专辑行理论上一定有，缺失时宁可不画 -->
            <span v-if="item.kind === 'album' && item.trackCount != null">{{ $t('follow__album_tracks', { count: item.trackCount }) }}</span>
            <span :class="$style.time">{{ item.publishTime }}</span>
          </div>
        </div>
      </li>
    </ul>
    <!-- 歌曲行菜单：在线歌曲表那套（`useMenu`，12 项里适用的那些） -->
    <base-menu v-model="isShowItemMenu" :menus="menus" :xy="menuLocation" item-name="name" @menu-click="handleSongMenuClick" />
    <!-- 专辑行菜单：打开专辑 / 复制专辑链接 / 在 QQ 音乐打开 -->
    <base-menu v-model="isShowAlbumMenu" :menus="albumMenus" :xy="albumMenuLocation" item-name="name" @menu-click="handleAlbumMenuClick" />
    <!-- 菜单里「添加到…」「下载」用的单条弹窗（照 OnlineList 的用法，teleport 到 #view） -->
    <common-list-add-modal v-model:show="isShowListAdd" :music-info="selectedAddMusicInfo" teleport="#view" />
    <common-download-modal v-model:show="isShowDownload" :music-info="selectedDownloadMusicInfo" teleport="#view" />
  </div>
</template>

<script lang="ts">
import ListAddModal from '@renderer/components/common/ListAddModal.vue'
import DownloadModal from '@renderer/components/common/DownloadModal.vue'
import { useTimelineActions } from '../useTimelineActions'

/**
 * 时间线（关注动态）：**单页、不分组、不分 tab**，两种行——新歌行与 新专行。
 *
 * 条目与「本次新增」的 id 组都由页面传进来（`items` 已按发布时间倒序，这里**不重排**）；
 * 行上的交互（播放 / 跳转 / 右键菜单）全部在 `useTimelineActions` 里，本文件只管画。
 */
export default {
  name: 'FollowFeedTimeline',
  components: {
    CommonListAddModal: ListAddModal,
    CommonDownloadModal: DownloadModal,
  },
  props: {
    items: {
      type: Array as () => LX.FollowFeed.Item[],
      default: () => [],
    },
    /** 「本次进入页面时还是未读」的条目 id（页内标记用，来自 store 的 freshIds） */
    freshIds: {
      type: Array as () => number[],
      default: () => [],
    },
  },
  setup(props: { items: LX.FollowFeed.Item[], freshIds: number[] }) {
    const isFresh = (item: LX.FollowFeed.Item): boolean => props.freshIds.includes(item.id)

    const {
      handleRowClick,
      jumpToSinger,
      jumpToAlbumRow,
      menus,
      menuLocation,
      isShowItemMenu,
      showRowMenu,
      handleSongMenuClick,
      albumMenus,
      albumMenuLocation,
      isShowAlbumMenu,
      handleAlbumMenuClick,
      isShowListAdd,
      selectedAddMusicInfo,
      isShowDownload,
      selectedDownloadMusicInfo,
    } = useTimelineActions(props)

    return {
      isFresh,
      handleRowClick,
      jumpToSinger,
      jumpToAlbumRow,
      menus,
      menuLocation,
      isShowItemMenu,
      showRowMenu,
      handleSongMenuClick,
      albumMenus,
      albumMenuLocation,
      isShowAlbumMenu,
      handleAlbumMenuClick,
      isShowListAdd,
      selectedAddMusicInfo,
      isShowDownload,
      selectedDownloadMusicInfo,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  position: relative;
}

.list {
  padding-bottom: 30px;
}

.row {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: 10px 0 10px 12px;
  transition: background-color @transition-fast;
  // 分隔线用 `--color-primary-alpha-900`：它在 `index.less` 的 :root 与 15 份内置主题里都有定义
  // （另有几处老页面写的是 `--color-000-alpha-700`，那个 token 全仓**没有定义**——是上游留下的
  // 悬空引用，声明会被整条丢掉；本页不跟着抄，见 AGENTS §2.5.1 第 3 条的口径）
  border-bottom: 1px solid var(--color-primary-alpha-900);

  &:last-child {
    border-bottom: none;
  }
}

// 可点样式：歌行整行点了就播。专辑行**不给** pointer / hover——它只有名字可点，
// 整行看着能点却点了没反应比没有样式更糟
.playable {
  cursor: pointer;

  &:hover {
    background-color: var(--color-primary-alpha-900);
  }
}

// 「本次新增」的标记：左侧一个主色小圆点。**可见但不刺眼**——不加整行底色、不加动画
// （进入页面时未读已全部置已读，那个状态在库里已经不在了，全屏高亮反而像报错）
.freshRow:before {
  content: '';
  position: absolute;
  left: 0;
  top: 16px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--color-primary);
}

.kind {
  flex: none;
  margin-right: 10px;
  padding: 1px 6px;
  border-radius: @radius-border;
  font-size: 11px;
  // 两种行只靠文字区分，底色同一档——新专行不值得比新歌行更响
  background-color: var(--color-primary-alpha-900);
  color: var(--color-primary);
}

.body {
  flex: auto;
  min-width: 0;
}

.nameLine {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name {
  font-size: 14px;
  color: var(--color-font);
  .mixin-ellipsis-1();
}

// 名字的可点样式（跳转由点击处理器做：走路由，不是 <a>——在线歌曲表那几列也是 span + click，
// 用 <a> 会把「右键菜单 / 选中文本」这些行为带进来）
.clickable,
.singer {
  color: var(--color-primary-font);
  cursor: pointer;
}

.singer {
  font-size: 13px;
  .mixin-ellipsis-1();
}

.fresh {
  flex: none;
  font-size: 11px;
  color: var(--color-primary);
}

.meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  min-width: 0;
  font-size: 12px;
  color: var(--color-font-label);
}

.time {
  flex: none;
}
</style>
