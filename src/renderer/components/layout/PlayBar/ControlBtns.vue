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
         当前这首没有 QQ 歌曲 ID（本地文件）→ 禁用，并在悬停里说明原因 -->
    <button :class="[$style.titleBtn, { [$style.favOn]: isFav }]" :disabled="!canFav" :aria-label="favActionTitle" :title="favTitle" @click="handleToggleFav">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="90%" viewBox="0 0 444.87 391.18" space="preserve">
        <use xlink:href="#icon-love" />
      </svg>
    </button>
    <button :class="$style.titleBtn" :aria-label="$t('player__add_music_to')" :title="$t('player__add_music_to')" @click="addMusicTo">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="90%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-add-2" />
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
import { ref, computed } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { useI18n } from '@renderer/plugins/i18n'
import useToggleDesktopLyric from '@renderer/utils/compositions/useToggleDesktopLyric'
import useFavSong from '@renderer/utils/compositions/useFavSong'
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
    /** 有没有可定位 / 可跳转的目标：没有就灰掉（同这一排其它键的处理） */
    const canLocate = computed(() =>
      canLocatePlayingRow(playInfo.playIndex, playMusicInfo.musicInfo) &&
      (hasPlayingRowLocator() || !!playingLocalListId.value),
    )

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

// 已在我喜欢里：心形用主色（图标没有实心版本，状态靠颜色区分）
.favOn {
  color: var(--color-primary);
  opacity: .9;
}


</style>
