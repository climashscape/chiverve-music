<template>
  <div :class="$style.carousel" @wheel="handleWheel">
    <p v-if="!list.length" :class="$style.empty" v-text="noItem" />

    <template v-else>
      <!-- 舞台：中央主视觉 + 左右两翼；按住拖动左右滑，松手按位移换一张 -->
      <div
        :class="$style.stage"
        @pointerdown="handlePointerDown"
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
          <!-- ⚠️ 这两个图标的坐标系是 1024×1024（见 Icons.vue 的注释），按 512 渲染会把图形裁掉一半 -->
          <svg v-if="isCurrentPlaying" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024" space="preserve">
            <use xlink:href="#icon-pause" />
          </svg>
          <svg v-else :class="$style.playGlyph" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024" space="preserve">
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

      <!-- 按钮组：居中的下方。五个按键**固定等宽 + 图标统一尺寸 + 内容居中**
           （等宽靠 .btnAction；内容居中靠内部 flex 撑满——inline-block 按钮里的短内容会靠左） -->
      <div :class="$style.actions">
        <base-btn min :class="$style.btnAction" :disabled="isLoading" @click="$emit('refresh')">
          <span :class="$style.btnInner">
            <!-- ⚠️ 每个图标的坐标系不同，取自 Icons.vue 里各自的注释：refresh 是 24×24（按 448 渲染会缩成一个小点） -->
            <svg :class="$style.btnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve"><use xlink:href="#icon-refresh" /></svg>
            <span>{{ $t('discover__refresh') }}</span>
          </span>
        </base-btn>
        <base-btn min :class="$style.btnAction" :disabled="!current" @click="handleToggleLove">
          <span :class="$style.btnInner">
            <svg :class="[$style.btnIcon, { [$style.btnIconOn]: isLoved }]" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 444.87 391.18" space="preserve"><use xlink:href="#icon-love" /></svg>
            <span>{{ isLoved ? $t('list__unlove') : $t('list__love') }}</span>
          </span>
        </base-btn>
        <base-btn min :class="$style.btnAction" :disabled="!current || !canDownload" @click="handleDownload">
          <span :class="$style.btnInner">
            <svg :class="$style.btnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 425.2 425.2" space="preserve"><use xlink:href="#icon-download-2" /></svg>
            <span>{{ $t('list__download') }}</span>
          </span>
        </base-btn>
        <!-- 两个跳转（工单 02 的能力搬到按钮上）：多位歌手时会在按钮处弹出选择菜单 -->
        <base-btn min :class="$style.btnAction" :disabled="!current || !canJumpToSinger(current)" @click="handleJumpSingerClick">
          <span :class="$style.btnInner">
            <svg :class="$style.btnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 448 456" space="preserve"><use xlink:href="#icon-user" /></svg>
            <span>{{ $t('radar__to_singer') }}</span>
          </span>
        </base-btn>
        <base-btn min :class="$style.btnAction" :disabled="!current || !canJumpToAlbum(current)" @click="handleJumpAlbumClick">
          <span :class="$style.btnInner">
            <svg :class="$style.btnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 425.2 425.2" space="preserve"><use xlink:href="#icon-album" /></svg>
            <span>{{ $t('radar__to_album') }}</span>
          </span>
        </base-btn>
        <!-- 只在自动续页失败时露出：正常运行不需要手动翻页 -->
        <base-btn v-if="needMore" min :class="$style.btnAction" :disabled="isLoading" @click="$emit('load-more')">
          <span :class="$style.btnInner">
            <svg :class="$style.btnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 448 448" space="preserve"><use xlink:href="#icon-down" /></svg>
            <span>{{ $t('discover__load_more') }}</span>
          </span>
        </base-btn>
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
import { addListMusics, getListMusics, removeListMusics } from '@renderer/store/list/action'
import { loveList } from '@renderer/store/list/state'
import { addDislikeInfo, hasDislike } from '@renderer/core/dislikeList'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { LIST_IDS } from '@common/constants'
import useMusicActions from '@renderer/components/material/OnlineList/useMusicActions'
import useMusicAdd from '@renderer/components/material/OnlineList/useMusicAdd'
import useMusicDownload from '@renderer/components/material/OnlineList/useMusicDownload'
import useMenu from '@renderer/components/material/OnlineList/useMenu'
import { assertApiSupport } from '@renderer/store/utils'
import useRadar, { RADAR_QUEUE_ID, type RadarBlock } from '../useRadar'

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

    // 游标放在模块级（useRadar 的分槽状态）：路由页没有 keep-alive，切走再回来本组件会重建，
    // 游标留在组件内 `ref` 里就会归零——「跳去歌手页再回来位置重置」就是这么来的（票 02）
    const cursorSlot = 'radar'
    const { getCursor, setCursor } = useRadar()
    const centerIndex = computed({
      get: () => getCursor(cursorSlot),
      set: (index: number) => { setCursor(index, cursorSlot) },
    })
    const current = computed(() => list.value[Math.min(centerIndex.value, Math.max(list.value.length - 1, 0))])

    // 列表变短（换一批）时把游标拉回范围；immediate 是因为切回来时列表可能已经变短了
    watch(() => list.value.length, (len) => {
      if (centerIndex.value > len - 1) centerIndex.value = Math.max(len - 1, 0)
    }, { immediate: true })

    // 正在播放的就是「中央这一首」时，大按钮变成暂停键
    const isCurrentPlaying = computed(() => !!current.value && musicInfo.id === current.value.id && isPlay.value)

    // ── 滑动 / 滚轮：动作都是「换一张」────────────────────────────────────
    const dragX = ref(0)
    let dragStartX = 0
    let isDragging = false
    /** 拖动刚结束的那次 click 不算点击（否则滑一下就把中央这首播了）。 */
    let ignoreNextClick = false
    const SWIPE_THRESHOLD = 60
    /** 位移超过它就算「拖过」，这次交互不再当点击处理。 */
    const DRAG_SLOP = 6

    const canGoNext = computed(() => centerIndex.value < list.value.length - 1)
    const canGoPrev = computed(() => centerIndex.value > 0)

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) return
      dragX.value = event.clientX - dragStartX
      if (Math.abs(dragX.value) > DRAG_SLOP) ignoreNextClick = true
    }
    const handlePointerUp = () => {
      if (!isDragging) return
      isDragging = false
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerUp)
      const dx = dragX.value
      dragX.value = 0
      if (dx <= -SWIPE_THRESHOLD && canGoNext.value) centerIndex.value++
      else if (dx >= SWIPE_THRESHOLD && canGoPrev.value) centerIndex.value--
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return // 右键留给菜单
      isDragging = true
      dragStartX = event.clientX
      dragX.value = 0
      ignoreNextClick = false
      // 不用 setPointerCapture：capture 之后 Chromium 会把 click 的 target 重定向到捕获元素，
      // 卡片自己的 @click 就失灵了（播放键当初靠 @pointerdown.stop 绕开的就是这个）。
      // 改挂 document 监听：照样能拖出舞台，但不动 click 的语义。
      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
      document.addEventListener('pointercancel', handlePointerUp)
    }

    /**
     * 滚轮 / 触控板横滚 = 换一张（用户 2026-09-23 报：雷达页原先只认鼠标拖动）。
     * 触控板会连发一串 wheel（还有惯性），所以加冷却——一次滚动只走一张。
     */
    const WHEEL_COOLDOWN = 220
    let lastWheelAt = 0
    const handleWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      const now = Date.now()
      if (now - lastWheelAt < WHEEL_COOLDOWN) return
      if (delta > 0) {
        if (!canGoNext.value) return
        centerIndex.value++
      } else {
        if (!canGoPrev.value) return
        centerIndex.value--
      }
      lastWheelAt = now
    }

    /** 点两翼 = 把那一张挪到中间（不播放） */
    const handleItemClick = (item: { offset: number }) => {
      if (ignoreNextClick) {
        ignoreNextClick = false
        return
      }
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

    // ── 底部按键都作用于「中央这一首」────────────────────────────────────
    const t = useI18n()

    // 收藏 = 收进本地「我的收藏」（与播放栏的收藏键、快捷键 music_love 同一套语义）。
    // 「是否已收藏」要拿整张列表比：本地收藏是个真实列表，走 getListMusics 读（命中缓存就不发请求）
    const lovedIds = ref<Set<string>>(new Set())
    const refreshLoved = async() => {
      const loved = await getListMusics(loveList.id)
      lovedIds.value = new Set(loved.map(item => item.id))
    }
    void refreshLoved()
    const isLoved = computed(() => !!current.value && lovedIds.value.has(current.value.id))
    const handleToggleLove = async() => {
      const song = current.value
      if (!song) return
      if (isLoved.value) {
        await removeListMusics({ listId: loveList.id, ids: [song.id] })
      } else {
        await addListMusics(loveList.id, [song])
      }
      // Set 原地改不会触发 computed，替换成新 Set
      const next = new Set(lovedIds.value)
      if (isLoved.value) next.delete(song.id)
      else next.add(song.id)
      lovedIds.value = next
    }

    /**
     * 不喜欢：确认后写进不喜欢列表并**把游标挪到下一首**（推荐流里这一步才是重点）。
     * 底部按钮按用户 2026-09-23 的要求去掉了「不喜欢」，但卡片右键菜单里还有这一项——
     * 菜单那一路也接到这里（而不是 OnlineList 的 `useMusicActions.handleDislikeMusic`），
     * 因为那个实现不告诉调用方「用户是否真的确认了」，而我们据此决定要不要前进。
     */
    const handleDislike = async() => {
      const song = current.value
      if (!song) return
      if (hasDislike(song)) {
        void dialog({ message: t('lists__dislike_music_tip', { name: song.name }), confirmButtonText: t('ok') })
        return
      }
      const confirm = await dialog.confirm({
        message: song.singer
          ? t('lists__dislike_music_singer_tip', { name: song.name, singer: song.singer })
          : t('lists__dislike_music_tip', { name: song.name }),
        cancelButtonText: t('cancel_button_text_2'),
        confirmButtonText: t('confirm_button_text'),
      })
      if (!confirm) return
      await addDislikeInfo([{ name: song.name, singer: song.singer }])
      if (canGoNext.value) centerIndex.value++
    }

    // 雷达列表只有在线的 tx 歌（`MusicInfoOnline` 的类型就是 tx），所以不必再判 local
    const canDownload = computed(() => !!current.value && assertApiSupport(current.value.source))

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

    // 下载按键复用这个弹窗（`single=true` → 对「中央这一首」操作）
    const handleDownload = () => { handleShowDownloadModal(centerIndex.value, true) }

    // 两个跳转按钮（工单 02 的能力搬到按钮上）：多位歌手时把选择菜单弹在按钮处
    const handleJumpSingerClick = (event: MouseEvent) => {
      if (!current.value) return
      void actions.handleJumpSinger(centerIndex.value, { x: event.pageX, y: event.pageY })
    }
    const handleJumpAlbumClick = () => {
      if (!current.value) return
      actions.handleJumpAlbum(centerIndex.value)
    }

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
      // 菜单的「不喜欢」接本组件的实现（确认后前进一张），见 handleDislike 的注释
      handleDislikeMusic: () => { void handleDislike() },

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
      handleWheel,
      handleItemClick,
      handlePlayClick,
      handleStageRightClick,
      handleMenuClick,
      handleSingerClick,
      handleToggleLove,
      isLoved,
      handleDislike,
      handleDownload,
      handleJumpSingerClick,
      handleJumpAlbumClick,
      canJumpToSinger: actions.canJumpToSinger,
      canJumpToAlbum: actions.canJumpToAlbum,
      canDownload,

      menus,
      menuLocation,
      isShowItemMenu,

      isShowListAdd,
      selectedAddMusicInfo,
      isShowDownload,
      selectedDownloadMusicInfo,

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
  // 主视觉的尺寸（滑动时两翼按百分比位移，单位就是它的宽）。
  // 随窗口高度收缩：矮窗口（最小 920×600）下底部按键原本会被播放栏压住、点不到（票 01），
  // clamp 的下限 180px 保证再矮也不会缩没。
  --cover: clamp(180px, calc(100vh - 380px), 300px);
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

// 中央巨型播放/暂停键：**白底 + 深色图形**（Spotify / Apple Music 那一路），压在任意封面上都干净。
// 别用半透明黑底（发灰发脏）、也别加白色描边（像贴纸）——用户 2026-09-23 连着否掉这两版。
.playBtn {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 84px;
  height: 84px;
  margin: -42px 0 0 -42px;
  padding: 0;
  border: none;
  outline: none;
  cursor: pointer;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #14161a;
  background-color: rgba(255, 255, 255, .94);
  box-shadow: 0 4px 18px 0 rgba(0, 0, 0, .28);
  transition: @transition-fast;
  transition-property: transform, box-shadow, background-color;
  svg {
    width: 36%;
    height: 36%;
    fill: currentColor;
  }
  &:hover {
    transform: scale(1.05);
    background-color: #fff;
    box-shadow: 0 6px 22px 0 rgba(0, 0, 0, .34);
  }
  &:active {
    transform: scale(.97);
  }
}
// 三角形重心偏左，视觉居中要往右挪一点（暂停键的两条竖条不需要）
.playGlyph {
  transform: translateX(7%);
}

// 底部按键：**固定等宽**（大小不统一被用户点过两次），内容用内部 flex 撑满后居中
.btnAction {
  width: 96px;
}
.btnInner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
}
// 图标统一 14×14：不同图标的 viewBox 内留白不一样，给定尺寸才不至于有的看着像没有图标
.btnIcon {
  width: 14px;
  height: 14px;
  flex: none;
  fill: currentColor;
}
.btnIconOn {
  fill: var(--color-primary);
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
