<template>
  <div :class="$style.carousel">
    <p v-if="!list.length" :class="$style.empty" v-text="noItem" />

    <template v-else>
      <!-- 舞台：中央主视觉 + 左右两翼；按住拖动左右滑，松手按位移换一张 -->
      <div
        :class="$style.stage"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @contextmenu="handleStageRightClick"
      >
        <div :class="$style.deck" :style="{ transform: `translateX(${dragX}px)` }">
          <div
            v-for="item in visibleItems"
            :key="item.song.id"
            :class="[$style.item, { [$style.centerItem]: item.offset === 0 }]"
            :style="itemStyle(item)"
            @click.stop="handleItemClick(item)"
          >
            <img v-if="item.song.meta.picUrl" :class="$style.cover" loading="lazy" decoding="async" :src="item.song.meta.picUrl" alt="" draggable="false">
            <svg v-else :class="$style.coverFallback" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 425.2 425.2" space="preserve">
              <use xlink:href="#icon-album" />
            </svg>
          </div>
        </div>

        <!-- 中央的巨型播放/暂停键：正在播这首就是暂停键，否则是播放键 -->
        <button :class="$style.playBtn" :aria-label="isCurrentPlaying ? $t('player__pause') : $t('player__play')" @click.stop="handlePlayClick" @pointerdown.stop>
          <svg v-if="isCurrentPlaying" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" space="preserve">
            <use xlink:href="#icon-pause" />
          </svg>
          <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" space="preserve">
            <use xlink:href="#icon-play" />
          </svg>
        </button>
      </div>

      <!-- 中央这一首的信息（歌手名可点，工单 02） -->
      <div :class="$style.info">
        <h2 :class="$style.name" :title="current?.name">{{ current?.name }}</h2>
        <p
          :class="[$style.singer, { [$style.jumpable]: current && canJumpToSinger(current) }]"
          :title="current && canJumpToSinger(current) ? $t('list__jump_singer') : (current?.singer || '')"
          @click="handleSingerClick"
        >{{ current?.singer }}</p>
      </div>

      <!-- 按钮组：居中的下方（换一批 / 播放雷达；到底了才需要手动加载） -->
      <div :class="$style.actions">
        <base-btn min :disabled="isLoading" @click="$emit('refresh')">{{ $t('discover__refresh') }}</base-btn>
        <base-btn :disabled="isLoading" @click="handlePlayAll">{{ $t('radar__play_all') }}</base-btn>
        <base-btn v-if="needMore" min :disabled="isLoading" @click="$emit('load-more')">{{ $t('discover__load_more') }}</base-btn>
      </div>
      <p v-if="moreError" :class="$style.error" v-text="moreError" />
    </template>

    <base-menu v-model="isShowItemMenu" :menus="menus" :xy="menuLocation" item-name="name" @menu-click="handleMenuClick" />
    <!-- 多位歌手时让用户挑（工单 02）：与歌曲表同一套 base-menu -->
    <base-menu v-model="isShowSingerPicker" :menus="singerPickerMenus()" :xy="singerPickerXy" item-name="name" @menu-click="handleSingerPickerClick" />
    <common-list-add-modal v-model:show="isShowListAdd" :music-info="selectedAddMusicInfo" teleport="#view" />
    <common-download-modal v-model:show="isShowDownload" :music-info="selectedDownloadMusicInfo" />
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { playMusicList, togglePlay } from '@renderer/core/player'
import { musicInfo, isPlay } from '@renderer/store/player/state'
import { addTempPlayList } from '@renderer/store/player/action'
import { LIST_IDS } from '@common/constants'
import useMusicActions from '@renderer/components/material/OnlineList/useMusicActions'
import useMusicAdd from '@renderer/components/material/OnlineList/useMusicAdd'
import useMusicDownload from '@renderer/components/material/OnlineList/useMusicDownload'
import useMenu from '@renderer/components/material/OnlineList/useMenu'
import { assertApiSupport } from '@renderer/store/utils'
import { RADAR_QUEUE_ID, type RadarBlock } from '../useRadar'

/**
 * 雷达的「居中轮播」形态（工单 07 的形态迭代，2026-09-23 用户要求：
 * 主视觉居中、中央一个巨大的播放/暂停键、左右滑动挑选、按钮放居中下方、不要列表铺开）。
 *
 * 分工与约束：
 * - **播放语义不回归**（工单 06 方案 B）：点中央播放键 = 从这一首开始连播雷达整串；
 *   卡片右键菜单仍与歌曲表完全一致（复用 OnlineList 的 useMenu / useMusicActions / useMusicAdd /
 *   useMusicDownload，不另写一套判定）；翻页拿到的新歌仍由 useRadar 的 appendToPlayQueue 接到队列尾部。
 * - **滑动挑选 ≠ 播放**：左右滑动只换「当前选中的那一张」，不自动开播（用户的动作要能预期）。
 * - 有意丢掉的能力（表格有、轮播没有）：多选与批量操作、列排序。雷达是「一张一张推给你」的场景。
 * - 两翼只渲染 ±2 张，其余靠滑动到达；到接近末尾时自动请求下一页（`needMore`），失败才露出按钮。
 */
export default {
  name: 'RadarCarousel',
  props: {
    block: {
      type: Object as () => RadarBlock,
      required: true,
    },
  },
  emits: ['load-more', 'refresh'],
  setup(props: { block: RadarBlock }, { emit }: { emit: (event: 'load-more' | 'refresh') => void }) {
    const list = computed(() => props.block.list)
    const noItem = computed(() => props.block.noItemLabel)
    const isLoading = computed(() => props.block.isLoading)
    const moreError = computed(() => props.block.moreError)

    const centerIndex = ref(0)
    const current = computed(() => list.value[Math.min(centerIndex.value, Math.max(list.value.length - 1, 0))])

    // 列表变短（换一批）时把游标拉回范围
    watch(() => list.value.length, (len) => {
      if (centerIndex.value > len - 1) centerIndex.value = Math.max(len - 1, 0)
    })

    // 正在播放的就是「中央这一首」时，大按钮变成暂停键
    const isCurrentPlaying = computed(() => !!current.value && musicInfo.id === current.value.id && isPlay.value)

    // ── 滑动 ────────────────────────────────────────────────────────────────
    const dragX = ref(0)
    let dragStartX = 0
    let isDragging = false
    const SWIPE_THRESHOLD = 60

    const canGoNext = computed(() => centerIndex.value < list.value.length - 1)
    const canGoPrev = computed(() => centerIndex.value > 0)

    const handlePointerDown = (event: PointerEvent) => {
      isDragging = true
      dragStartX = event.clientX
      dragX.value = 0
      ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) return
      dragX.value = event.clientX - dragStartX
    }
    const handlePointerUp = () => {
      if (!isDragging) return
      isDragging = false
      const dx = dragX.value
      dragX.value = 0
      if (dx <= -SWIPE_THRESHOLD && canGoNext.value) centerIndex.value++
      else if (dx >= SWIPE_THRESHOLD && canGoPrev.value) centerIndex.value--
    }

    /** 点两翼 = 把那一张挪到中间（不播放） */
    const handleItemClick = (item: { offset: number }) => {
      if (item.offset === 0) {
        handlePlayClick()
        return
      }
      const next = centerIndex.value + item.offset
      if (next >= 0 && next < list.value.length) centerIndex.value = next
    }

    // 两翼只渲染 ±2：每张的位移/缩放/透明度由 offset 派生
    const visibleItems = computed(() => {
      const items: Array<{ song: LX.Music.MusicInfoOnline, offset: number }> = []
      for (let offset = -2; offset <= 2; offset++) {
        const song = list.value[centerIndex.value + offset]
        if (song) items.push({ song, offset })
      }
      return items
    })
    const itemStyle = (item: { offset: number }) => {
      const offset = item.offset
      const scale = offset === 0 ? 1 : offset === 1 || offset === -1 ? 0.76 : 0.6
      const x = offset === 0 ? 0 : offset === 1 || offset === -1 ? 62 : 106
      const opacity = offset === 0 ? 1 : offset === 1 || offset === -1 ? 0.8 : 0.4
      return {
        transform: `translate(-50%, -50%) translateX(${x * Math.sign(offset)}%) scale(${scale})`,
        opacity,
        zIndex: 10 - Math.abs(offset),
      }
    }

    // ── 播放 ────────────────────────────────────────────────────────────────
    const handlePlayClick = () => {
      if (!current.value) return
      if (musicInfo.id === current.value.id) {
        // 已经是这一首：大按钮就是播放/暂停开关
        togglePlay()
        return
      }
      void playMusicList(RADAR_QUEUE_ID, [...list.value], centerIndex.value)
    }
    const handlePlayAll = () => {
      if (!list.value.length) return
      centerIndex.value = 0
      void playMusicList(RADAR_QUEUE_ID, [...list.value], 0)
    }

    // ── 到底了就自动续（流式推荐），失败才露出「加载更多」──────────────
    const needMore = computed(() => !!moreError.value)
    watch(centerIndex, (index) => {
      if (!props.block.hasMore || props.block.isLoading) return
      if (index >= list.value.length - 2) emit('load-more')
    })

    // ── 右键菜单：与表格同源（工单 02 的跳转/分享一并复用）────────────────
    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    const actions = useMusicActions({ props: { list: props.block.list, listId: RADAR_QUEUE_ID } })
    const { isShowListAdd, selectedAddMusicInfo, handleShowMusicAddModal } = useMusicAdd({ selectedList, props: props.block })
    const { isShowDownload, selectedDownloadMusicInfo, handleShowDownloadModal } = useMusicDownload({ selectedList, props: props.block })

    const handlePlayMusicLater = (index: number) => {
      addTempPlayList([{ listId: LIST_IDS.PLAY_LATER, musicInfo: props.block.list[index] }])
    }

    const { menus, menuLocation, isShowItemMenu, showMenu, menuClick } = useMenu({
      props: props.block,
      assertApiSupport,
      emit: () => {},

      handleShowDownloadModal,
      handlePlayMusic: (index: number) => { void playMusicList(RADAR_QUEUE_ID, [...list.value], index) },
      handlePlayMusicLater,
      handleSearch: actions.handleSearch,
      handleShowMusicAddModal,
      handleOpenMusicDetail: actions.handleOpenMusicDetail,
      handleDislikeMusic: actions.handleDislikeMusic,

      handleJumpAlbum: actions.handleJumpAlbum,
      handleJumpSinger: actions.handleJumpSinger,
      handleCopyLink: actions.handleCopyLink,
      handleOpenInQqMusic: actions.handleOpenInQqMusic,
    })

    const handleStageRightClick = (event: MouseEvent) => {
      if (!current.value) return
      showMenu(event, current.value)
    }
    const handleMenuClick = (action: { action: string } | null) => {
      menuClick(action, centerIndex.value, menuLocation)
    }
    const handleSingerClick = (event: MouseEvent) => {
      if (!current.value) return
      actions.handleSingerNameClick(current.value, event)
    }

    return {
      list,
      noItem,
      isLoading,
      moreError,
      needMore,
      current,
      isCurrentPlaying,
      centerIndex,
      dragX,
      visibleItems,
      itemStyle,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleItemClick,
      handlePlayClick,
      handlePlayAll,
      handleStageRightClick,
      handleMenuClick,
      handleSingerClick,

      menus,
      menuLocation,
      isShowItemMenu,

      isShowListAdd,
      selectedAddMusicInfo,
      isShowDownload,
      selectedDownloadMusicInfo,

      canJumpToSinger: actions.canJumpToSinger,
      isShowSingerPicker: actions.isShowSingerPicker,
      singerPickerXy: actions.singerPickerXy,
      singerPickerMenus: actions.singerPickerMenus,
      handleSingerPickerClick: actions.handleSingerPickerClick,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.carousel {
  flex: auto;
  min-height: 0;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
}
.empty {
  padding: 40px 0;
  text-align: center;
  font-size: 16px;
  color: var(--color-font-label);
}

// 舞台：定高，主视觉居中；两翼超出部分裁掉
.stage {
  position: relative;
  flex: none;
  width: 100%;
  max-width: 900px;
  // 主视觉的尺寸（滑动时两翼按百分比位移，单位就是它的宽）
  --cover: 300px;
  height: calc(var(--cover) + 24px);
  overflow: hidden;
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
  // 拖动时不要选中文字/触发浏览器拖图
  user-select: none;
}
.deck {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  transition: transform @transition-fast;
}
.item {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--cover);
  height: var(--cover);
  // 居中靠 transform 的 translate(-50%,-50%)（itemStyle 里拼的），这里**不要**再加负 margin，
  // 两者叠加会把封面推到舞台左上方 150px（实测踩过）
  border-radius: 10px;
  overflow: hidden;
  background-color: var(--color-button-background);
  box-shadow: 0 6px 22px 0 rgba(0, 0, 0, .22);
  transition: transform @transition-normal, opacity @transition-normal;
  img {
    -webkit-user-drag: none;
  }
}
.centerItem {
  cursor: default;
}
.sideItem {
  cursor: pointer;
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.coverFallback {
  position: absolute;
  left: 28%;
  top: 28%;
  width: 44%;
  height: 44%;
  fill: var(--color-font-label);
}

// 中央巨型播放/暂停键：压在封面正中
.playBtn {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 96px;
  height: 96px;
  margin: -48px 0 0 -48px;
  border-radius: 50%;
  border: none;
  outline: none;
  cursor: pointer;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  // 半透明黑底 + 白图标：压在任意封面上都看得清（跟随主题色会在浅色封面上糊掉）
  background-color: rgba(0, 0, 0, .52);
  backdrop-filter: blur(2px);
  transition: @transition-fast;
  transition-property: transform, background-color;
  svg {
    width: 44%;
    height: 44%;
    fill: currentColor;
  }
  &:hover {
    transform: scale(1.06);
    background-color: rgba(0, 0, 0, .66);
  }
  &:active {
    transform: scale(.96);
  }
}

.info {
  flex: none;
  width: 100%;
  max-width: 640px;
  padding: 14px 16px 0;
  box-sizing: border-box;
  text-align: center;
}
.name {
  font-size: 18px;
  font-weight: 600;
  .mixin-ellipsis-1();
}
.singer {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
.jumpable {
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}

// 按钮组：居中的下方（用户要求「按键放到居中的下方」）
.actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 18px;
}
.error {
  padding-top: 8px;
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
