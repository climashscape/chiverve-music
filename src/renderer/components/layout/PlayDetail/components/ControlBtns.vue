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
  // 状态问云端；未登录时点了会弹「请先登录 QQ 音乐」；本地文件没有 QQ 歌曲 ID → 禁用并说明原因
  button(:class="[$style.footerLeftControlBtn, { [$style.active]: isFav }]" :disabled="!canFav" :aria-label="favActionTitle" :title="favTitle" @click="handleToggleFav")
    svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="95%" viewBox="0 0 444.87 391.18" space="preserve")
      use(xlink:href="#icon-love")
  button(:class="$style.footerLeftControlBtn" :aria-label="$t('player__add_music_to')" :title="$t('player__add_music_to')" @click="isShowAddMusicTo = true")
    svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" space="preserve")
      use(xlink:href="#icon-add-2")
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
import useFavSong from '@renderer/utils/compositions/useFavSong'
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
    /** 键名（无障碍名）：说了要做什么，与行内/菜单/播放栏那三处同一套文案 */
    const favActionTitle = computed(() => isFav.value ? t('list__unlove') : t('list_add__cloud_fav'))
    /** 悬停提示：灰掉时改说「为什么灰」（没歌 / 这首不能收藏） */
    const favTitle = computed(() => {
      if (currentMusic.value == null) return ''
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
