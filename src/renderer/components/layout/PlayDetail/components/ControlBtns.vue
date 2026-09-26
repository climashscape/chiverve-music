<template lang="pug">
div(:class="$style.footerLeftControlBtns")
  button(:class="[$style.footerLeftControlBtn, $style.lrcBtn]" :aria-label="toggleDesktopLyricBtnTitle" :title="toggleDesktopLyricBtnTitle" @click="toggleDesktopLyric" @contextmenu="toggleLockDesktopLyric")
    svg(v-show="appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="125%" viewBox="0 0 512 512" space="preserve")
      use(xlink:href="#icon-desktop-lyric-on")
    svg(v-show="!appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="125%" viewBox="0 0 512 512" space="preserve")
      use(xlink:href="#icon-desktop-lyric-off")
  button(:class="[$style.footerLeftControlBtn, { [$style.active]: appSetting['player.audioVisualization'] }]" :aria-label="$t('audio_visualization')" :title="$t('audio_visualization')" @click="toggleAudioVisualization")
    svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="95%" viewBox="0 0 24 24" space="preserve")
      use(xlink:href="#icon-audio-wave")
  button(:class="[$style.footerLeftControlBtn, { [$style.active]: isShowLrcSelectContent }]" :aria-label="$t('lyric__select')" :title="$t('lyric__select')" @click="toggleVisibleLrc")
    svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="95%" viewBox="0 0 24 24" space="preserve")
      use(xlink:href="#icon-text")
  button(:class="[$style.footerLeftControlBtn, {[$style.active]: isShowPlayComment}]" :aria-label="$t('comment__show')" :title="$t('comment__show')" @click="toggleVisibleComment")
    svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="95%" viewBox="0 0 24 24" space="preserve")
      use(xlink:href="#icon-comment")
  common-sound-effect-btn
  common-playback-rate-btn
  common-volume-btn
  common-toggle-play-mode-btn
  // 「我喜欢」一键开关（工单 06）：与「+」拆开——收藏当前这首不必先进弹窗。
  // 状态问云端；未登录时点了会弹「请先登录 QQ 音乐」；本地文件没有 QQ 歌曲 ID → 禁用并说明原因。
  // 空心/实心按状态切（工单 10）；宽度 80%（不是同排的 95%）：心形的 viewBox 贴着墨迹裁、
  // 宽高比 1.137，95% 会撑出 19px 宽，比同排的频谱/评论键（墨迹 15.8）大一圈
  // ⚠️ 这一排**不要**跟着播放栏一起改小（2026-09-24 用户：本页「本来是合适的」）：
  // 两排的按钮盒尺寸不同（本排 btnH≈19-20、播放栏 21.6-24），同一百分比在两边不是一个观感
  button(:class="[$style.footerLeftControlBtn, { [$style.active]: isFav }]" :disabled="!canFav" :aria-label="favActionTitle" :title="favTitle" @click="handleToggleFav")
    svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="80%" viewBox="0 0 444.87 391.18" space="preserve")
      use(:xlink:href="favIcon")
  // `#icon-list-add`（Material 的 playlist_add：三条目 + 加号）——语义就是「加入歌单」。
  // 工单 10 之前这里是 `#icon-add-2`，那是个**心形带加号**的图形，用户看到「添加到…」下面一颗心，
  // 报「不要用爱心的图标」。宽度补上 95%，与同排的频谱/歌词/评论三个键同一口径（原来没写，
  // 默认 100% → 比邻居宽 1px）
  button(:class="$style.footerLeftControlBtn" :aria-label="$t('player__add_music_to')" :title="$t('player__add_music_to')" @click="isShowAddMusicTo = true")
    svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="95%" viewBox="0 0 24 24" space="preserve")
      use(xlink:href="#icon-list-add")
  common-list-add-modal(v-model:show="isShowAddMusicTo" :music-info="playMusicInfo.musicInfo")

</template>

<script>
import { ref, computed } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'

import {
  isShowLrcSelectContent,
  isShowPlayComment,
  playMusicInfo,
} from '@renderer/store/player/state'
import {
  setShowPlayLrcSelectContentLrc,
  setShowPlayComment,
} from '@renderer/store/player/action'

import useNextTogglePlay from '@renderer/utils/compositions/useNextTogglePlay'
import useToggleDesktopLyric from '@renderer/utils/compositions/useToggleDesktopLyric'
import useFavSong, { favIconOf } from '@renderer/utils/compositions/useFavSong'
import { canFavSongInCloud, isFavSongInCloud } from '@renderer/store/user/action'
import { dialog } from '@renderer/plugins/Dialog'
import { setMediaDeviceId } from '@renderer/plugins/player'
import { appSetting, saveMediaDeviceId, setEnableAudioVisualization } from '@renderer/store/setting'

export default {
  setup() {
    const t = useI18n()
    // const setting = useRefGetter('setting')
    // const setAudioVisualization = useCommit('setAudioVisualization')
    // const saveMediaDeviceId = useCommit('setMediaDeviceId')

    const toggleVisibleLrc = () => {
      setShowPlayLrcSelectContentLrc(!isShowLrcSelectContent.value)
    }
    const toggleVisibleComment = () => {
      setShowPlayComment(!isShowPlayComment.value)
    }
    const {
      nextTogglePlayName,
      toggleNextPlayMode,
    } = useNextTogglePlay()

    const {
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
    } = useToggleDesktopLyric()

    const isShowAddMusicTo = ref(false)

    // 「我喜欢」：当前播放的这一首（`progress` 包装时取里面的歌，同 usePlayStatus 的取法）
    const { toggleFav } = useFavSong()
    const currentMusic = computed(() => playMusicInfo.musicInfo == null
      ? null
      : ('progress' in playMusicInfo.musicInfo ? playMusicInfo.musicInfo.metadata.musicInfo : playMusicInfo.musicInfo))
    const canFav = computed(() => canFavSongInCloud(currentMusic.value))
    const isFav = computed(() => canFav.value && isFavSongInCloud(currentMusic.value))
    /** 心形按状态取空心/实心（工单 10）：映射在 `favIconOf` 一处，三处入口共用 */
    const favIcon = computed(() => favIconOf(isFav.value))
    /** 键名（无障碍名）：说了要做什么，与行内/菜单/播放栏那三处同一套文案 */
    const favActionTitle = computed(() => isFav.value ? t('list__unlove') : t('list_add__cloud_fav'))
    /**
     * 悬停提示：灰掉时改说「为什么灰」（没歌 / 这首不能收藏）。
     * 没歌时不能返回空串：禁用键没有任何提示，用户看不出是「坏了」还是「现在不能用」。
     */
    const favTitle = computed(() => {
      if (currentMusic.value == null) return t('player__love_disabled_no_music')
      return canFav.value ? favActionTitle.value : t('list_add__cloud_no_song_id')
    })
    // 状态不在这里拉：播放链路（usePlayStatus）已会拉一次并缓存住，
    // 且点下去时 `toggleFav` 会再等一次（所以不会出现「看到的和点的相反」）
    const handleToggleFav = () => { void toggleFav(currentMusic.value) }

    const toggleAudioVisualization = async() => {
      const newSetting = !appSetting['player.audioVisualization']
      if (newSetting && appSetting['player.mediaDeviceId'] != 'default') {
        const confirm = await dialog.confirm({
          message: t('setting__player_audio_visualization_tip'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        })
        if (!confirm) return
        await setMediaDeviceId('default').catch(_ => _)
        saveMediaDeviceId('default')
      }
      setEnableAudioVisualization(newSetting)
    }

    return {
      appSetting,
      isShowLrcSelectContent,
      toggleVisibleLrc,
      isShowPlayComment,
      toggleVisibleComment,
      nextTogglePlayName,
      toggleNextPlayMode,
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
      toggleAudioVisualization,
      isShowAddMusicTo,
      playMusicInfo,
      canFav,
      isFav,
      favIcon,
      favActionTitle,
      favTitle,
      handleToggleFav,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.footerLeftControlBtns {
  display: flex;
  flex-flow: row nowrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;

  button {
    width: 20px;
    color: var(--color-font);
  }

  .footerLeftControlBtn {
    // width: 18px;
    // height: 18px;
    opacity: .5;
    cursor: pointer;
    transition: opacity @transition-normal;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: transparent;
    border: none;
    padding: 0;

    &:hover {
      opacity: .9;
    }

    &.active {
      color: var(--color-primary);
      opacity: .8;
    }

    // 没有歌在播 / 这首不能收藏（本地文件）时的样子：灰掉，别让人以为点了没反应
    &:disabled {
      opacity: .25;
      cursor: default;
    }
  }

  .lrcBtn {
    width: 20px;
  }
}

</style>
