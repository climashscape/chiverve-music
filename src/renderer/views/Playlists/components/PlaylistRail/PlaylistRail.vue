<template>
  <div ref="dom_lists" :class="$style.lists">
    <div :class="$style.listHeader">
      <h2 :class="$style.listsTitle">{{ $t('playlists__local_group') }}</h2>
      <div :class="$style.headerBtns">
        <button :class="$style.listsAdd" :aria-label="$t('lists__new_list_btn')" @click="isShowNewList = true">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="70%" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-list-add" />
          </svg>
        </button>
        <button :class="$style.listsAdd" :aria-label="$t('list_update_modal__title')" @click="isShowListUpdateModal = true">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" style="transform: rotate(45deg);" height="70%" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-refresh" />
          </svg>
        </button>
      </div>
    </div>
    <ul ref="dom_lists_list" class="scroll" :class="[$style.listsContent, { [$style.sortable]: isModDown }]">
      <li v-if="userLists.length === 0 && !isShowNewList" :class="$style.railTip">
        <span>{{ $t('playlists__local_empty') }}</span>
      </li>
      <li
        v-for="(item, index) in userLists"
        :key="item.id" class="user-list"
        :class="[$style.listsItem, {[$style.active]: item.id == listId}, {[$style.clicked]: rightClickItemIndex == index}, {[$style.fetching]: fetchingListStatus[item.id]}]"
        :data-index="index" :aria-label="item.name" :aria-selected="item.id == listId" @contextmenu="handleListsItemRigthClick($event, index)"
      >
        <span :class="$style.listsLabel" @click="handleListToggle(item.id)">
          <transition name="list-active">
            <svg-icon v-if="item.id == listId" name="angle-right-solid" :class="$style.activeIcon" />
          </transition>
          {{ item.name }}
        </span>
        <base-input
          :class="$style.listsInput" type="text" :value="item.name"
          :placeholder="item.name" @keyup.enter="handleSaveListName(index, $event)" @blur="handleSaveListName(index, $event)"
        />
      </li>
      <transition enter-active-class="animated-fast slideInLeft" leave-active-class="animated-fast fadeOut" @after-leave="isNewListLeave = false" @after-enter="$refs.dom_listsNewInput.focus()">
        <li v-if="isShowNewList" :class="[$style.listsItem, $style.listsNew, {[$style.newLeave]: isNewListLeave}]">
          <base-input
            ref="dom_listsNewInput" :class="$style.listsInput" type="text" :placeholder="$t('lists__new_list_input')"
            @keyup.enter="handleCreateList" @blur="handleCreateList"
          />
        </li>
      </transition>
    </ul>

    <!-- ── QQ 云端自建歌单（工单 06）─────────────────────────────────────────
         与上面那组是**两套数据、两种写语义**：这组改的是 QQ 云端。只放开已实现的能力
         （建 / 删 / 加歌 / 删歌），重命名、排序、导入导出不出现——点了没反应比没有更糟。 -->
    <div :class="$style.listHeader">
      <h2 :class="$style.listsTitle">{{ $t('playlists__cloud_group') }}</h2>
      <div :class="$style.headerBtns">
        <button :class="$style.listsAdd" :aria-label="$t('playlists__cloud_new')" @click="isShowNewCloudList = true">
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
        :aria-label="item.name" @contextmenu="handleCloudItemRigthClick($event, item)" @click="handleCloudListToggle(item)"
      >
        <span :class="$style.listsLabel">
          <transition name="list-active">
            <svg-icon v-if="String(item.dirId) == cloudDirId" name="angle-right-solid" :class="$style.activeIcon" />
          </transition>
          {{ item.name }}
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
    <base-menu v-model="isShowCloudMenu" :menus="cloudMenus" :xy="cloudMenuLocation" item-name="name" @menu-click="handleCloudMenuClick" />
    <base-menu v-model="isShowMenu" :menus="menus" :xy="menuLocation" item-name="name" @menu-click="handleMenuClick" />
    <DuplicateMusicModal v-model:visible="isShowDuplicateMusicModal" :list-info="duplicateListInfo" />
    <ListSortModal v-model:visible="isShowListSortModal" :list-info="sortListInfo" />
    <ListUpdateModal v-model:visible="isShowListUpdateModal" />
  </div>
</template>

<script>
import { openUrl, clipboardWriteText } from '@common/utils/electron'

import musicSdk from '@renderer/utils/musicSdk'
import DuplicateMusicModal from './components/DuplicateMusicModal.vue'
import ListSortModal from './components/ListSortModal.vue'
import ListUpdateModal from './components/ListUpdateModal.vue'

import { defaultList, userLists, fetchingListStatus } from '@renderer/store/list/state'
import { removeUserList } from '@renderer/store/list/action'
import { createdLists, labels as userLabels } from '@renderer/store/user/state'
import { createCloudList, initUserCenter, removeCloudList } from '@renderer/store/user/action'

import { computed, nextTick, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { LIST_IDS } from '@common/constants'

import { dialog } from '@renderer/plugins/Dialog'

import { saveListPrevSelectId } from '@renderer/utils/data'

import { useI18n } from '@renderer/plugins/i18n'


import useShare from './useShare'
import useMenu from './useMenu'
import useListUpdate from './useListUpdate'
import useSort from './useSort'
import useDarg from './useDarg'
import useEditList from './useEditList'
import useListScroll from './useListScroll'
import useDuplicate from './useDuplicate'

export default {
  name: 'PlaylistRail',
  components: {
    DuplicateMusicModal,
    ListSortModal,
    ListUpdateModal,
  },
  props: {
    listId: {
      type: String,
      required: true,
    },
    cloudDirId: {
      type: String,
      default: '',
    },
  },
  emits: ['show-menu'],
  setup(props, { emit }) {
    const router = useRouter()
    const route = useRoute()
    const t = useI18n()

    const dom_lists_list = ref(null)
    const rightClickItemIndex = ref(-10)

    // ── QQ 云端自建歌单（工单 06）───────────────────────────────────────────
    // 只读列表 + 建/删两个写操作；「我喜欢」（dirId=201）在「我的收藏」页里，不在这里重复
    void initUserCenter()
    const I_LIKE_DIR_ID = '201'
    const cloudLists = computed(() => createdLists.filter(item => item.dirId !== I_LIKE_DIR_ID))
    const cloudListsLabel = computed(() => userLabels.createdLists || t('no_item'))
    const isShowNewCloudList = ref(false)
    const isNewCloudListLeave = ref(false)
    const rightClickCloudItem = ref(null)

    const handleCloudListToggle = (item) => {
      void router.replace({ path: route.path, query: { cloud: String(item.dirId) } })
    }
    const handleCreateCloudList = async(event) => {
      const target = event.target
      if (target.readOnly) return
      const name = target.value.trim()
      target.readOnly = true
      if (!name) {
        isShowNewCloudList.value = false
        return
      }
      try {
        await createCloudList(name)
      } catch (err) {
        void dialog({ message: err?.message || String(err), type: 'error' })
      }
      isNewCloudListLeave.value = true
      void nextTick(() => { isShowNewCloudList.value = false })
    }
    const cloudMenus = [{ name: t('playlists__cloud_remove'), action: 'remove' }]
    const isShowCloudMenu = ref(false)
    const cloudMenuLocation = ref({ x: 0, y: 0 })
    const handleCloudItemRigthClick = (event, item) => {
      event.preventDefault()
      rightClickCloudItem.value = item
      cloudMenuLocation.value = { x: event.clientX, y: event.clientY }
      isShowCloudMenu.value = true
    }
    // ⚠️ base-menu 的 menu-click 传的是**整个菜单项对象**（仓库既有写法都是取 `action.action`，
    // 见 components/material/OnlineList/useMenu.js:105），不是 action 字符串
    const handleCloudMenuClick = (menuItem) => {
      const item = rightClickCloudItem.value
      rightClickCloudItem.value = null
      if (menuItem?.action !== 'remove' || item == null) return
      void dialog.confirm({
        message: t('playlists__cloud_remove_tip', { name: item.name }),
        confirmButtonText: t('lists__remove_tip_button'),
      }).then(async(isRemove) => {
        if (!isRemove) return
        try {
          await removeCloudList(item)
          // 删掉的正是当前选中的那个 → 回到本地第一组（否则右侧会停在已不存在的歌单上）
          if (String(item.dirId) === props.cloudDirId) {
            void router.replace({ path: route.path, query: { id: userLists[0]?.id ?? LIST_IDS.DEFAULT } })
          }
        } catch (err) {
          void dialog({ message: err?.message || String(err), type: 'error' })
        }
      })
    }

    const { handleImportList, handleExportList } = useShare()
    const { isShowListUpdateModal, handleUpdateSourceList } = useListUpdate()
    const { isShowListSortModal, sortListInfo, handleSortList } = useSort()
    const { isShowDuplicateMusicModal, duplicateListInfo, handleDuplicateList } = useDuplicate()
    const { handleRename, handleSaveListName, isShowNewList, isNewListLeave, handleCreateList } = useEditList({ dom_lists_list })
    useListScroll({ dom_lists_list })

    // 歌单 / 榜单在 QQ 侧的网页链接：本仓原有的两个生成器（歌单那个是异步的，要取 id）
    const getSourceDetailUrl = async(listInfo) => {
      const { source, sourceListId } = listInfo
      if (!sourceListId) return ''
      if (/board__/.test(sourceListId)) {
        const id = sourceListId.replace(/board__/, '')
        return musicSdk[source].leaderboard.getDetailPageUrl(id) ?? ''
      }
      if (musicSdk[source]?.songList?.getDetailPageUrl) {
        return (await musicSdk[source].songList.getDetailPageUrl(sourceListId)) ?? ''
      }
      return ''
    }

    const handleOpenSourceDetailPage = async(listInfo) => {
      const url = await getSourceDetailUrl(listInfo)
      if (!url) return
      void openUrl(url)
    }
    // 「复制歌单链接」（工单 02）：与上面同一条 URL，只是不打开
    const handleCopySourceLink = async(listInfo) => {
      const url = await getSourceDetailUrl(listInfo)
      if (url) clipboardWriteText(url)
    }

    const handleRemove = (listInfo) => {
      void dialog.confirm({
        message: t('lists__remove_tip', { name: listInfo.name }),
        confirmButtonText: t('lists__remove_tip_button'),
      }).then(isRemove => {
        if (!isRemove) return
        void removeUserList([listInfo.id])
        if (props.listId == listInfo.id) {
          handleListToggle(LIST_IDS.DEFAULT)
        }
      })
    }

    const {
      menus,
      menuLocation,
      isShowMenu,
      showMenu,
      menuClick,
    } = useMenu({
      emit,

      handleImportList,
      handleExportList,
      handleUpdateSourceList,
      handleOpenSourceDetailPage,
      handleCopySourceLink,
      handleSortList,
      handleDuplicateList,
      handleRename,
      handleRemove,
    })

    const handleListsItemRigthClick = (event, index) => {
      rightClickItemIndex.value = index
      showMenu(event, index)
    }

    const handleListToggle = (id) => {
      if (id == props.listId) return
      // 选中本地列表时清掉 cloud：两个参数只该有一个生效
      void router.replace({
        path: route.path,
        query: { id },
      })
    }

    const handleMenuClick = (action) => {
      if (rightClickItemIndex.value < -2) return
      let index = rightClickItemIndex.value
      rightClickItemIndex.value = -10
      menuClick(action, index)
    }

    const { isModDown } = useDarg({ dom_lists_list, handleMenuClick, handleSaveListName })


    watch(() => props.listId, (listId) => {
      if (listId) saveListPrevSelectId(listId)
    })

    watch(() => userLists, (lists) => {
      if (lists.some(l => l.id == props.listId)) return
      void router.replace({
        path: route.path,
        query: {
          id: lists[0]?.id ?? defaultList.id,
        },
      })
    })

    return {
      rightClickItemIndex,
      userLists,
      fetchingListStatus,
      dom_lists_list,
      cloudLists,
      cloudListsLabel,
      isShowNewCloudList,
      isNewCloudListLeave,
      cloudMenus,
      isShowCloudMenu,
      cloudMenuLocation,
      handleCloudListToggle,
      handleCreateCloudList,
      handleCloudItemRigthClick,
      handleCloudMenuClick,
      isShowListUpdateModal,
      isShowListSortModal,
      sortListInfo,
      isShowDuplicateMusicModal,
      duplicateListInfo,
      handleSaveListName,
      isShowNewList,
      isNewListLeave,
      handleCreateList,
      handleListsItemRigthClick,
      isShowMenu,
      handleMenuClick,
      menus,
      menuLocation,
      handleListToggle,
      isModDown,
      hideMenu: handleMenuClick,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

@lists-item-height: 36px;
.lists {
  flex: none;
  width: 16%;
  display: flex;
  flex-flow: column nowrap;
}
// 两组各自滚动：本地组**不参与收缩**（flex: none）——否则云端那组内容一多，按比例分走的
// 收缩量会把本地组压到只剩几像素（实测：提示条只剩 12px，文字被裁掉）。
// 本地列表很长时用 max-height 封顶，内部自己滚。
.listsContent:first-of-type {
  flex: none;
  max-height: 40%;
}
// 云端组吃掉剩余高度，并允许被压到容器高度以内（min-height: 0）
.listsContent:last-of-type {
  flex: 1 1 auto;
  min-height: 0;
}
.railTip {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--color-font-label);
  .mixin-ellipsis-2();
}
.listHeader {
  position: relative;
  display: flex;
  flex-flow: row nowrap;
  border-bottom: var(--color-list-header-border-bottom);
  &:hover {
    .listsAdd {
      opacity: 1;
    }
  }
}
.listsTitle {
  flex: auto;
  font-size: 12px;
  line-height: 38px;
  padding: 0 10px;
  .mixin-ellipsis-1();
}
.headerBtns {
  flex: none;
  display: flex;
}
.listsAdd {
  // position: absolute;
  // right: 0;
  margin-top: 6px;
  background: none;
  height: 30px;
  border: none;
  outline: none;
  border-radius: @radius-border;
  cursor: pointer;
  opacity: .1;
  transition: opacity @transition-normal;
  color: var(--color-button-font);
  svg {
    vertical-align: bottom;
  }
  &:active {
    opacity: .7 !important;
  }
  &:hover {
    opacity: .6 !important;
  }
}
.listsContent {
  flex: auto;
  min-width: 0;
  overflow-y: scroll !important;
  // border-right: 1px solid rgba(0, 0, 0, 0.12);

  &.sortable {
    * {
      -webkit-user-drag: element;
    }

    .listsItem {
      &:hover, &.active, &.selected, &.clicked {
        background-color: transparent !important;
      }

      &.dragingItem {
        background-color: var(--color-primary-background-hover) !important;
      }
    }
  }
}
.listsItem {
  position: relative;
  transition: .3s ease;
  transition-property: color, background-color, opacity;
  background-color: transparent;
  &:not(.active) {
    &:hover {
      background-color: var(--color-primary-background-hover);
      cursor: pointer;
    }
  }
  &.active {
    // background-color:
    color: var(--color-primary);
  }
  &.selected {
    background-color: var(--color-primary-font-active);
  }
  &.clicked {
    background-color: var(--color-primary-background-hover);
  }
  &.fetching {
    opacity: .5;
  }
  &.editing {
    padding: 0 10px;
    background-color: var(--color-primary-background-hover);
    .listsLabel {
      display: none;
    }
    .listsInput {
      display: block;
    }
  }
}
.activeIcon {
  height: .9em;
  width: .9em;
  margin-left: -0.45em;
  vertical-align: -0.05em;
}
.listsLabel {
  display: block;
  height: @lists-item-height;
  padding: 0 10px;
  font-size: 13px;
  line-height: @lists-item-height;
  .mixin-ellipsis-1();
}
.listsInput {
  width: 100%;
  height: @lists-item-height;
  // border: none;
  padding: 0;
  // padding-bottom: 1px;
  line-height: @lists-item-height;
  background: none !important;
  border-radius: 0;
  // outline: none;
  font-size: 13px;
  display: none;
  // font-family: inherit;
}

.listsNew {
  padding: 0 10px;
  background-color: var(--color-primary-background-hover) !important;
  .listsInput {
    display: block;
  }
}
.newLeave {
  margin-top: -@lists-item-height;
  z-index: -1;
}


</style>
