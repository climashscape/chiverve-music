<template>
  <!-- 播放栏封面的右键菜单（当前播放这一首）：替代上游「右击封面跳列表」——那一下会莫名跳页
       （2026-09-28 用户反馈），且「定位所在列表」已有 ControlBtns 的准星键（工单 08）。
       菜单项与判据见 usePlayingSongMenu.js：全部沿用歌曲表那份，不自造第二套。 -->
  <base-menu v-model="isShowSongMenu" :menus="menus" :xy="menuLocation" item-name="name" @menu-click="menuClick" />
  <!-- 多位歌手时让用户挑（工单 02）：用仓库既有的 base-menu，弹在歌曲菜单原位 -->
  <base-menu v-model="isShowSingerPicker" :menus="singerPickerMenus()" :xy="singerPickerXy" item-name="name" @menu-click="handleSingerPickerClick" />
  <!-- 弹窗挂在这里而不是三个宽度变体里：右键菜单在哪开的，弹窗就归谁管 -->
  <common-list-add-modal v-model:show="isShowAddMusicTo" :music-info="currentMusic" />
  <common-download-modal v-model:show="isShowDownload" :music-info="currentMusic" teleport="#root" />
</template>

<script>
import usePlayingSongMenu from './usePlayingSongMenu'

export default {
  name: 'PlayBarSongMenu',
  setup() {
    return {
      ...usePlayingSongMenu(),
    }
  },
}
</script>
