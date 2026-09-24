<template>
  <!-- QQ 云端自建歌单（工单 06 / 拆 tab 见工单 09）：这组改的是 QQ 云端（与本地组是两套数据、
       两种写语义），只放开已实现的能力（建 / 删）——重命名、排序、导入导出不出现，
       点了没反应比没有更糟。加歌 / 删歌 / 刷新在右栏的 CloudListPane。 -->
  <div :class="$style.lists">
    <div :class="$style.listHeader">
      <h2 :class="$style.listsTitle">{{ $t('playlists__cloud_group') }}</h2>
      <div :class="$style.headerBtns">
        <button :class="$style.listsAdd" :aria-label="$t('playlists__cloud_new')" :title="$t('playlists__cloud_new')" @click="isShowNewCloudList = true">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="70%" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-list-add" />
          </svg>
        </button>
      </div>
    </div>
    <ul class="scroll" :class="$style.listsContent">
      <li v-if="cloudLists.length === 0 && !isShowNewCloudList" :class="$style.railTip">
        <span v-text="cloudListsLabel" />
      </li>
      <li
        v-for="item in cloudLists"
        :key="`cloud__${item.dirId}`" class="cloud-list"
        :class="[$style.listsItem, {[$style.active]: String(item.dirId) == cloudDirId}, {[$style.clicked]: rightClickCloudItem?.dirId === item.dirId}]"
        :aria-label="item.name" @contextmenu="handleCloudItemRigthClick($event, item)" @click="handleSelect(String(item.dirId))"
      >
        <span :class="$style.listsLabel" :title="item.name">
          <span :class="$style.markerSlot">
            <transition name="list-active">
              <svg-icon v-if="String(item.dirId) == cloudDirId" name="angle-right-solid" :class="$style.activeIcon" />
            </transition>
          </span>
          <!-- 封面来自卡片的 `img`（`getCreatedSonglist` 的 logo / picUrl）；空或加载失败时组件内部落占位图 -->
          <playlist-cover :src="item.img" />
          <span :class="$style.listsName">{{ item.name }}</span>
        </span>
      </li>
      <transition enter-active-class="animated-fast slideInLeft" leave-active-class="animated-fast fadeOut" @after-leave="isNewCloudListLeave = false" @after-enter="$refs.dom_cloudNewInput.focus()">
        <li v-if="isShowNewCloudList" :class="[$style.listsItem, $style.listsNew, {[$style.newLeave]: isNewCloudListLeave}]">
          <base-input
            ref="dom_cloudNewInput" :class="$style.listsInput" type="text" :placeholder="$t('playlists__cloud_new_input')"
            @keyup.enter="handleCreateCloudList" @blur="handleCreateCloudList"
          />
        </li>
      </transition>
    </ul>

    <!-- 右键删除云端歌单（含二次确认） -->
    <base-menu v-model="isShowCloudMenu" :menus="cloudMenus" :xy="cloudMenuLocation" item-name="name" @menu-click="handleCloudMenuClick" />
  </div>
</template>

<script lang="ts">
import { toRef } from '@common/utils/vueTools'
import PlaylistCover from './PlaylistCover.vue'
import useCloudLists from './useCloudLists'

/**
 * 我的歌单 →「QQ 音乐·歌单」tab 的左栏（工单 09）：云端自建歌单那一组。
 *
 * 拆自原来的 `PlaylistRail.vue`：本组**不带**本地那一套（useMenu/useDarg/useShare/useEditList
 * 都是本地库专用，`useDarg` 还会挂全局按键监听），逻辑只有取数与建 / 删，见 `useCloudLists.ts`。
 * 样式与本地组共用 `rail.less`。
 */
export default {
  name: 'PlaylistRailCloud',
  components: {
    PlaylistCover,
  },
  props: {
    cloudDirId: {
      type: String,
      default: '',
    },
  },
  setup(props: { cloudDirId: string }) {
    return {
      ...useCloudLists({ cloudDirId: toRef(props, 'cloudDirId') }),
    }
  },
}
</script>

<style lang="less" module>
@import './rail.less';
</style>
