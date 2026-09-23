<template>
  <div :class="$style.container" class="scroll">
    <!-- 只留排序：area / version 实测不生效（见 useMv.ts 文件头第 1 条），不做假筛选 -->
    <div :class="$style.header">
      <base-tab v-model="order" :class="$style.tabs" :list="orderTabs" item-key="order" @change="switchOrder" />
    </div>

    <ul v-show="!list.noItemLabel" :class="$style.cards">
      <li v-for="item in list.list" :key="item.vid" :class="$style.card" @click="openMv(item)">
        <div :class="$style.thumbBox">
          <img :class="$style.thumb" loading="lazy" decoding="async" :src="item.img" alt="">
          <span v-if="item.interval" :class="$style.duration">{{ item.interval }}</span>
        </div>
        <h4 :class="$style.name" :title="item.name">{{ item.name }}</h4>
        <p :class="$style.meta" :title="item.singer">
          <!-- 歌手名可点进歌手页；点名字不该顺带打开 MV，所以这里 stop -->
          <template v-if="singersOf(item).length">
            <template v-for="(singer, index) in singersOf(item)" :key="singer.mid || singer.name">
              <span v-if="index" :class="$style.singerGap">、</span>
              <span v-if="singer.mid" :class="$style.singerLink" @click.stop="toSinger(singer)">{{ singer.name }}</span>
              <span v-else>{{ singer.name }}</span>
            </template>
          </template>
          <template v-else>{{ item.singer }}</template>
        </p>
        <p v-if="item.playCount" :class="$style.meta">{{ $t('mv__play_count') }}：{{ playText(item.playCount) }}</p>
      </li>
    </ul>

    <div v-show="list.noItemLabel" :class="$style.noitem">
      <p v-text="list.noItemLabel" />
    </div>

    <div v-if="list.hasMore" :class="$style.more">
      <base-btn min :disabled="list.isLoading" @click="loadMvs(list.page + 1, true)">{{ $t('mv__load_more') }}</base-btn>
    </div>
    <p v-if="list.moreError" :class="$style.error">{{ list.moreError }}</p>

    <!-- 详情 + 播放：一个弹窗搞定（列表项信息先显示，详情回来再补全） -->
    <player-modal
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
import { computed, ref } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { formatPlayCount } from '@renderer/utils'
import PlayerModal from './components/PlayerModal.vue'
import useMv, { type MvInfo } from './useMv'

/**
 * MV 列表项**运行时**带 `singers`（`tx/mv.js` 的 toMvInfo 会塞进来），但 `MvInfo` 类型里没声明
 * （那个接口是给弹窗与详情用的）。这里按需取「能跳歌手页」的那部分，类型上不假装它一定存在。
 */
const singersOf = (item: MvInfo): Array<{ mid: string, name: string }> => {
  const list = (item as MvInfo & { singers?: Array<{ mid: string, name: string }> }).singers
  return Array.isArray(list) ? list : []
}

export default {
  components: {
    PlayerModal,
  },
  setup() {
    const router = useRouter()
    const { list, player, loadMvs, switchOrder, openMv, closePlayer, retryUrl } = useMv()
    // 列表状态在模块级：切走再回来直接显示上次的内容，不必再打一次请求（发现页同样处理）
    if (!list.list.length) void loadMvs(1, false)

    // 排序 tab 的 v-model 与区块状态分开：加载中不该被外部改掉
    const order = ref(list.order)
    const orderTabs = computed(() => [
      { order: 0, label: window.i18n.t('mv__order_latest') },
      { order: 1, label: window.i18n.t('mv__order_hot') },
    ])
    const playText = (num: number) => formatPlayCount(num)
    const toSinger = (singer: { mid: string, name: string }) => {
      if (!singer.mid) return
      void router.push({ path: '/singer', query: { mid: singer.mid } })
    }

    return {
      list,
      player,
      order,
      orderTabs,
      playText,
      singersOf,
      toSinger,
      loadMvs,
      switchOrder,
      openMv,
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
  // 根容器带左右 padding 时必须 border-box，否则溢出窗口右侧（见 userCenter/index.vue 同名注释）
  box-sizing: border-box;
  padding: 16px 22px 30px;
  color: var(--color-font);
  overflow-y: auto;
}

.header {
  display: flex;
  align-items: center;
}
// base-tab 自带 15px 内边距，这里抵消掉，与卡片网格左对齐
.tabs {
  margin-left: -15px;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  margin-top: 10px;
}
.card {
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
// 时长角标压在封面上：与 songList/Detail 的播放量角标同样的处理（封面图上必须有反差底色）
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
// 歌手名可点（M6）
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
  min-height: 240px;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
</style>
