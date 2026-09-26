<template>
  <div :class="$style.container" class="scroll">
    <p v-if="listInfo.noItemLabel && !listInfo.list.length" :class="$style.noitem" v-text="listInfo.noItemLabel" />
    <ul v-show="listInfo.list.length" :class="$style.cards">
      <!-- 歌手：圆形头像 + 歌曲/专辑/MV 数 -->
      <template v-if="type === 'singer'">
        <li v-for="item in listInfo.list" :key="item.id" :class="[$style.card, $style.singer]" @click="toSinger(item)">
          <img :class="[$style.img, $style.round]" loading="lazy" decoding="async" :src="item.img" alt="">
          <h4 :class="$style.name" :title="item.name">{{ item.name }}</h4>
          <p :class="$style.meta">{{ $t('search__singer_stat', { song: item.songNum, album: item.albumNum }) }}</p>
        </li>
      </template>
      <!-- 专辑：方形封面 + 歌手 + 发行日期 -->
      <template v-else-if="type === 'album'">
        <li v-for="item in listInfo.list" :key="item.id" :class="$style.card" @click="toAlbum(item)">
          <img :class="$style.img" loading="lazy" decoding="async" :src="item.img" alt="">
          <h4 :class="$style.name" :title="item.name">{{ item.name }}</h4>
          <p :class="$style.meta" :title="item.singer">{{ item.singer }}</p>
          <p :class="$style.meta">{{ item.publishDate }}</p>
        </li>
      </template>
      <!-- MV：16:9 缩略图 + 时长角标 + 播放量，点开走乐馆 MV 那套播放弹窗 -->
      <template v-else>
        <li v-for="item in listInfo.list" :key="item.id" :class="[$style.card, $style.mv]" @click="openMv(item)">
          <div :class="$style.thumbBox">
            <img :class="$style.thumb" loading="lazy" decoding="async" :src="item.img" alt="">
            <span v-if="item.duration" :class="$style.duration">{{ durationText(item.duration) }}</span>
          </div>
          <h4 :class="$style.name" :title="item.name">{{ item.name }}</h4>
          <p :class="$style.meta" :title="item.singer">{{ item.singer }}</p>
          <p v-if="item.playCount" :class="$style.meta">{{ $t('mv__play_count') }}：{{ playText(item.playCount) }}</p>
        </li>
      </template>
    </ul>
    <div v-if="listInfo.maxPage > 1" :class="$style.more">
      <material-pagination :count="listInfo.total" :limit="listInfo.limit" :page="listInfo.page" @btn-click="togglePage" />
    </div>
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
  </div>
</template>

<script lang="ts">
import { computed, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { searchText } from '@renderer/store/search/state'
import { listInfos, search as searchTyped, type TypedSearchType } from '@renderer/store/search/typed'
import { player, openMv as openMvPlayer, closePlayer, retryUrl, type MvInfo } from '@renderer/store/mv'
import { formatPlayCount } from '@renderer/utils'
import MvPlayerModal from '@renderer/components/common/MvPlayerModal.vue'

/**
 * 搜索页的「歌手 / 专辑 / MV」三类结果（工单 10）。
 *
 * 三类**合成一个组件**（而不是三个几乎相同的文件）：条目形状不同，但取数、翻页、
 * 空态、点击行为完全同构，差别只在卡片布局——三个文件会把同一套逻辑抄三遍。
 * 取数在 `store/search/typed`，三个类型各自一份 listInfo。
 *
 * MV 卡片点开复用乐馆 MV 的播放弹窗与播放器（`store/mv` 是模块级单例），不另造一套。
 */
export default {
  name: 'SearchTypedResultList',
  components: {
    MvPlayerModal,
  },
  props: {
    type: {
      type: String as () => TypedSearchType,
      required: true,
    },
    page: {
      type: Number,
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
  },
  setup(props: { type: TypedSearchType, page: number, sourceId: string }) {
    const router = useRouter()
    const route = useRoute()

    const listInfo = computed(() => listInfos[props.type])

    const runSearch = () => {
      // 收口：`store/search/typed` 的 catch 是「写完可读提示（noItemLabel = list__load_failed）再重抛」，
      // 调用方不接就成了未处理 rejection——dev 下 webpack-dev-server 据此弹全屏浮层（fixed; inset:0），
      // 它会吞掉真实鼠标输入（票 03b）。提示已由 store 写入，这里只吞掉异常。
      void searchTyped(props.type, searchText.value, props.page, props.sourceId).catch((err: any) => {
        console.log(`[search] ${props.type}`, err)
      })
    }
    watch(() => [props.sourceId, props.page, props.type], () => { setTimeout(runSearch) })
    watch(searchText, () => { setTimeout(runSearch) }, { immediate: true })

    const togglePage = (page: number) => {
      void router.replace({ path: route.path, query: { ...route.query, page } })
    }

    const toSinger = (item: { mid: string }) => {
      if (!item.mid) return
      void router.push({ path: '/singer', query: { mid: item.mid } })
    }
    const toAlbum = (item: { mid: string }) => {
      if (!item.mid) return
      void router.push({ path: '/album', query: { mid: item.mid } })
    }
    /** 搜索结果里的 MV 只有列表字段，映射成 `MvInfo` 后交给乐馆那套播放逻辑（同歌手页的做法）。 */
    const openMv = (item: { vid: string, name: string, img: string, singer: string, duration: number, playCount: number, publishDate?: string }) => {
      if (!item.vid) return
      const info: MvInfo = {
        id: item.vid,
        vid: item.vid,
        name: item.name,
        subName: '',
        img: item.img,
        singer: item.singer,
        interval: item.duration ? durationText(item.duration) : null,
        duration: item.duration,
        playCount: item.playCount,
        pubDate: item.publishDate,
      }
      openMvPlayer(info)
    }

    const playText = (num: number) => formatPlayCount(num)
    const durationText = (seconds: number) => {
      const m = Math.floor(seconds / 60)
      const s = Math.floor(seconds % 60)
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    return {
      listInfo,
      player,
      togglePage,
      toSinger,
      toAlbum,
      openMv,
      playText,
      durationText,
      closePlayer,
      retryUrl,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  box-sizing: border-box;
  padding: 4px 0 24px;
  color: var(--color-font);
  overflow-y: auto;
}

.cards {
  display: flex;
  flex-wrap: wrap;
}

.noitem {
  padding: 40px 0;
  text-align: center;
  font-size: 18px;
  color: var(--color-font-label);
}

.card {
  width: 132px;
  margin: 0 16px 16px 0;
  cursor: pointer;

  &:hover .img,
  &:hover .thumb {
    transform: scale(1.04);
  }
}
// 歌手卡片窄一点、名字居中（与歌手页的卡片观感一致）
.singer {
  width: 112px;
  text-align: center;
}
.img {
  width: 132px;
  height: 132px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
.singer .img {
  width: 104px;
  height: 104px;
}
.round {
  border-radius: 50%;
}

.mv {
  width: 208px;
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
// 时长角标压在封面上（同乐馆 MV 面板）
.duration {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 2px 5px;
  font-size: 11px;
  color: #fff;
  background-color: rgba(0, 0, 0, .5);
}

.name {
  margin-top: 6px;
  font-size: 13px;
  .mixin-ellipsis-2();
}
.meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}

.more {
  padding: 10px 0;
  text-align: center;
}
</style>
