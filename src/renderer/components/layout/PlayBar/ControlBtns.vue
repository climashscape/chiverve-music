<template>
  <div :class="$style.controlBtn">
    <!-- <common-volume-bar /> -->
    <!-- 定位到正在播放（ui-polish-3 工单 08）：当前页的列表里就有这一行 → 原地把它滚到列表中间；
         否则跳到这首歌所在的本地列表并居中。为什么不做成「无论如何都原地滚」：当前页的列表未必是
         这首歌所在的队列（在收藏页播的是歌单里的歌），那一行的行号在本列表里没有意义。 -->
    <button :class="$style.titleBtn" :disabled="!canLocate" :aria-label="locateTitle" :title="locateTitle" @click="locatePlaying">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="90%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-locate-playing" />
      </svg>
    </button>
    <!-- 「我喜欢」一键开关（工单 06）：与「+」拆开——收藏当前这首是高频动作，不该先进弹窗再点一次。
         状态问云端（本地收藏已取消）；未登录时点它在 toggleFav 里弹「请先登录 QQ 音乐」；
         当前这首没有 QQ 歌曲 ID（本地文件）→ 禁用，并在悬停里说明原因。
         空心/实心按状态切（工单 10）。宽度 **72%**（不是同排的 90%）：心形的 viewBox 贴着墨迹裁、
         宽高比 1.137，照 90% 会撑出 21.6px 宽，比同排那一排显大一圈；72% ↔ 墨迹 17.28×15.19
         （面积 262.5 = 同排面积中位数 259.65）。
         ⚠️ **别再把「显得比邻居大 / 悬得高」归到宽度上**（2026-09-24 用户两次反馈的复盘）：
         观感的主因是这一排**没有垂直居中**——各键高度由自己的 svg 撑出、顶边对齐而中心线不齐，
         爱心看着就「float 在邻居上面」。根因已在 `.controlBtn` 的 `align-items: center` 修掉，
         宽度**保持 72% 不动**：详情页那颗是 80%（墨迹比同排「加入」还高 27%），用户明确说
         「本来是合适的」——可见高度差本身不是问题，位置才是。
         空心/实心同一副剪影、同一尺寸——**不给实心单独内缩**：两态共用这一个 svg，
         内缩等于每次点收藏都跳一次大小（工单 10 明确要避免） -->
    <button :class="[$style.titleBtn, { [$style.favOn]: isFav }]" :disabled="!canFav" :aria-label="favActionTitle" :title="favTitle" @click="handleToggleFav">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="72%" viewBox="0 0 444.87 391.18" space="preserve">
        <use :xlink:href="favIcon" />
      </svg>
    </button>
    <button :class="$style.titleBtn" :aria-label="$t('player__add_music_to')" :title="$t('player__add_music_to')" @click="addMusicTo">
      <!-- `#icon-list-add`（Material 的 playlist_add：三条目 + 加号）——语义就是「加入歌单」。
           工单 10 之前这里是 `#icon-add-2`，那是个**心形带加号**的图形，用户看到「添加到…」下面
           一颗心，报「不要用爱心的图标」 -->
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="90%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-list-add" />
      </svg>
    </button>
    <button :class="$style.titleBtn" :aria-label="toggleDesktopLyricBtnTitle" :title="toggleDesktopLyricBtnTitle" @click="toggleDesktopLyric" @contextmenu="toggleLockDesktopLyric">
      <svg v-show="appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-on" />
      </svg>
      <svg v-show="!appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-off" />
      </svg>
    </button>
    <common-volume-btn />
    <common-toggle-play-mode-btn />
    <common-list-add-modal v-model:show="isShowAddMusicTo" :music-info="playMusicInfo.musicInfo" />
  </div>
</template>

<script>
import { ref, computed, nextTick, watchEffect } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { useI18n } from '@renderer/plugins/i18n'
import useToggleDesktopLyric from '@renderer/utils/compositions/useToggleDesktopLyric'
import useFavSong, { favIconOf } from '@renderer/utils/compositions/useFavSong'
import { canLocatePlayingRow, findJumpableListId, hasPlayingRowLocator, locatePlayingRow } from '@renderer/utils/playingRowLocate'
import { canFavSongInCloud, isFavSongInCloud } from '@renderer/store/user/action'
import { musicInfo, playMusicInfo, playInfo } from '@renderer/store/player/state'
import { userLists } from '@renderer/store/list/state'
import { appSetting } from '@renderer/store/setting'

export default {
  setup() {
    const isShowAddMusicTo = ref(false)
    const {
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
    } = useToggleDesktopLyric()
    const addMusicTo = () => {
      if (!musicInfo.id) return
      isShowAddMusicTo.value = true
    }

    // 「我喜欢」：当前播放的这一首（`progress` 包装时取里面的歌，同 usePlayStatus 的取法）
    const t = useI18n()
    const { toggleFav } = useFavSong()
    const currentMusic = computed(() => playMusicInfo.musicInfo == null
      ? null
      : ('progress' in playMusicInfo.musicInfo ? playMusicInfo.musicInfo.metadata.musicInfo : playMusicInfo.musicInfo))
    const canFav = computed(() => canFavSongInCloud(currentMusic.value))
    const isFav = computed(() => canFav.value && isFavSongInCloud(currentMusic.value))
    /** 心形按状态取空心/实心（工单 10）：映射在 `favIconOf` 一处，三处入口共用 */
    const favIcon = computed(() => favIconOf(isFav.value))
    /** 键名（无障碍名）：说了要做什么，与行内/菜单那两处同一套文案 */
    const favActionTitle = computed(() => isFav.value ? t('list__unlove') : t('list_add__cloud_fav'))
    /** 悬停提示：灰掉时改说「为什么灰」（没歌 / 这首不能收藏），与雷达页的跳转键同款处理 */
    const favTitle = computed(() => {
      if (currentMusic.value == null) return ''
      return canFav.value ? favActionTitle.value : t('list_add__cloud_no_song_id')
    })
    // 状态不在这里拉：播放链路（usePlayStatus）已经会拉一次并缓存住，
    // 且点下去时 `toggleFav` 会再等一次（所以不会出现「看到的和点的相反」）
    const handleToggleFav = () => { void toggleFav(currentMusic.value) }

    // ── 定位到正在播放（工单 08）───────────────────────────────────────────
    const router = useRouter()
    /** 键名（无障碍名）：说了要做什么 */
    const locateTitle = computed(() => t('player__locate_playing'))
    /** 这首歌所在的**本地列表** id；没有则空串（在线队列没有可跳的列表页，判定见 `findJumpableListId`） */
    const playingLocalListId = computed(() => findJumpableListId(playMusicInfo.listId, userLists.map(list => list.id)))
    /**
     * 有没有可定位 / 可跳转的目标：没有就灰掉（同这一排其它键的处理）。
     *
     * ⚠️ 不能写成 computed，也不能「算一次就完事」（工单 11 的真机 bug）：`hasPlayingRowLocator()`
     * 的可见性判据读的是真实 DOM（`offsetParent`），它不在响应式系统里，算一次就定格；而唯一会改
     * 它的东西——`v-show` 的 display——Vue 是**推迟到 post 队列**才写的（指令的 updated 钩子走
     * `queuePostRenderEffect`，见 `patchElement`），比播放栏自己的更新更晚。播放栏的组件 uid 比
     * 路由页小、又排在同一个批次前面，于是列表数据刚到那一批读到的还是「藏起来」的旧值，之后没有
     * 任何依赖再变化 → 键永远灰着（用户报的「切走页面再切换回来就无法定位了」）。
     * 所以：依赖照旧在这里订阅，值等**本帧 DOM 落定之后**再读一次。
     */
    const canLocate = ref(false)
    const readCanLocate = () => {
      canLocate.value = canLocatePlayingRow(playInfo.playIndex, playMusicInfo.musicInfo) &&
        (hasPlayingRowLocator() || !!playingLocalListId.value)
    }
    const syncCanLocate = () => {
      // 先用当前 DOM 算一次（多数时候是对的，不必等一帧），再在 DOM 落定后补一次（理由见上）
      readCanLocate()
      void nextTick(readCanLocate)
    }
    watchEffect(syncCanLocate)

    /** 点它：能原地定位就原地滚到中间，否则跳到这首歌所在的列表（带 `center=1`，目标列表居中而不是留上边距） */
    const locatePlaying = () => {
      if (!canLocate.value) return
      if (locatePlayingRow()) return
      if (!playingLocalListId.value) return
      void router.push({
        path: '/list',
        query: {
          id: playingLocalListId.value,
          scrollIndex: playInfo.playIndex,
          center: 1,
        },
      })
    }

    return {
      appSetting,
      isShowAddMusicTo,
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
      addMusicTo,
      playMusicInfo,
      canFav,
      isFav,
      favIcon,
      favActionTitle,
      favTitle,
      handleToggleFav,
      locateTitle,
      canLocate,
      locatePlaying,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.controlBtn {
  padding-left: 20px;
  padding-right: 10px;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  // ⚠️ 必须有：这一排各键的高度是**各自 svg 撑出来的**（`.titleBtn` 的 height:100% 在本行
  // height:auto 时解析不出高度，退化成按内容），而 svg 高度 = 宽度% × 24 ÷ 宽高比——
  // 于是各键高度不同（实测 12.66 / 21.6 / 24）。没有 align-items，默认的 `normal` 让它们
  // **顶边对齐**，中心线就差出 4.5~5.7px：爱心看着「悬在邻居上面」（2026-09-24 用户两次反馈）。
  align-items: center;
  gap: 10px;

  button {
    color: var(--color-button-font);
  }
}

.titleBtn {
  flex: none;
  height: 100%;
  width: 24px;
  transition: @transition-fast;
  transition-property: color, opacity;
  // color: var(--color-button-font);
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  border: none;
  width: 24px;
  padding: 0;

  opacity: .6;
  cursor: pointer;

  svg {
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.2));
  }
  &:hover {
    opacity: 1;
  }
  &:active {
    opacity: 1;
  }
  // 没有歌在播 / 这首不能收藏（本地文件）时的样子：灰掉，别让人以为点了没反应
  &:disabled {
    opacity: .25;
    cursor: default;
  }
}

// 已在我喜欢里：心形换实心（形状，见 favIconOf）+ 主色（颜色）。
// 颜色是叠加的一层提示，不是唯一判据——灰度/高对比主题下也要能看出状态
.favOn {
  color: var(--color-primary);
  opacity: .9;
}


</style>
