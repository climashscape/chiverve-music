<template>
  <material-modal :show="show" :bg-close="bgClose" :teleport="teleport" max-width="70%" min-width="200px" @close="handleClose">
    <main :class="$style.main">
      <h2>{{ $t('list_add__' + (isMove ? 'title_first_move' : 'title_first_add')) }}&nbsp;<span :class="$style.name">{{ currentMusicInfo.name }}</span>&nbsp;{{ $t('list_add__title_last') }}</h2>
      <!-- 弹窗只做「加入歌单」（工单 06）：QQ 音乐「我喜欢」已独立成一键开关
           （行内心形键 / 右键菜单 / 播放栏），这里不再有收藏键。两个去处并列：
           本地自建列表 + QQ 云端自建歌单（用户原话「加入歌单（QQ/本地）」） -->
      <div :class="$style.group">
        <h3 :class="$style.groupTitle">{{ $t('playlists__local_group') }}</h3>
        <div class="scroll" :class="$style.btnContent">
          <base-btn v-for="(item, index) in lists" :key="item.id" :class="$style.btn" :aria-label="$t('list_add__btn_title', { name: item.name })" :disabled="item.isExist" @click="handleClick(index)">{{ item.name }}</base-btn>
          <base-btn :class="[$style.btn, $style.newList, isEditing ? $style.editing : null]" :aria-label="$t('lists__new_list_btn')" :title="$t('lists__new_list_btn')" @click="handleEditing($event)">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 42 42" space="preserve">
              <use xlink:href="#icon-addTo" />
            </svg>
            <base-input :class="$style.newListInput" :value="newListName" :placeholder="$t('lists__new_list_input')" @keyup.enter="handleSaveList($event)" @blur="handleSaveList($event)" />
          </base-btn>
          <span v-for="i in spaceNum" :key="i" :class="$style.btn" />
        </div>
      </div>
      <!-- 云端歌单在「移动」模式下不给：移动是本地列表之间的操作，云端那条路没有「从源列表移除」这一步。
           进不来（未登录 / 加载中 / 这一首没有 QQ 歌曲 ID）时不给点了会报错的死键，改说一句为什么 -->
      <div v-if="!isMove" :class="$style.group">
        <h3 :class="$style.groupTitle">{{ $t('playlists__cloud_group') }}</h3>
        <p v-if="cloudTip" :class="$style.groupTip">{{ cloudTip }}</p>
        <div v-else class="scroll" :class="$style.btnContent">
          <base-btn v-for="item in cloudLists" :key="item.id" :class="$style.btn" :aria-label="$t('list_add__btn_title', { name: item.name })" :disabled="!!addingCloudId" @click="handleAddToCloudList(item)">{{ item.name }}</base-btn>
          <span v-for="i in spaceNumCloud" :key="i" :class="$style.btn" />
        </div>
      </div>
    </main>
  </material-modal>
</template>

<script>
// import { mapMutations } from 'vuex'
import { watch, ref, computed, onBeforeUnmount } from '@common/utils/vueTools'
import { userLists } from '@renderer/store/list/state'
import { addListMusics, moveListMusics, createUserList, getMusicExistListIds } from '@renderer/store/list/action'
import { createdLists, labels as userLabels } from '@renderer/store/user/state'
import { addSongsToCloudList, canFavSongInCloud, initUserCenter } from '@renderer/store/user/action'
import useKeyDown from '@renderer/utils/compositions/useKeyDown'
import { dialog } from '@renderer/plugins/Dialog'

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    musicInfo: {
      type: [Object, null],
      required: true,
    },
    bgClose: {
      type: Boolean,
      default: true,
    },
    excludeListId: {
      type: Array,
      default() {
        return []
      },
    },
    // listName: {
    //   type: String,
    //   default: '',
    // },
    fromListId: {
      type: String,
      default: null,
    },
    isMove: {
      type: Boolean,
      default: false,
    },
    teleport: {
      type: String,
      default: '#root',
    },
  },
  emits: ['update:show'],
  setup(props) {
    const keyModDown = useKeyDown('mod')
    const lists = ref([])

    const currentMusicInfo = ref({})

    // QQ 云端自建歌单（工单 06）：直接读 store/user 那份（「我的歌单」页存的就是它），
    // 写走 `addSongsToCloudList`（它按 dirId 写、tid 比对，并且正在看这个歌单时会自动刷新）
    const cloudLists = computed(() => createdLists)
    // 云端那一组进不去时的原因：没歌单 / 拉不动（未登录等）时显示 store 的文案，
    // 这一首本身不能进云端（本地文件没有 QQ 歌曲 ID）就说这一条——不给点了会报错的死键
    const cloudTip = computed(() => {
      if (!canFavSongInCloud(currentMusicInfo.value)) return window.i18n.t('list_add__cloud_no_song_id')
      if (!cloudLists.value.length) return userLabels.createdLists || window.i18n.t('no_item')
      return ''
    })

    const checkMusicExist = (musicInfo) => {
      const mid = musicInfo.id
      void getMusicExistListIds(mid).then(ids => {
        if (mid != musicInfo.id) return
        for (const list of lists.value) {
          if (ids.includes(list.id)) list.isExist = true
        }
      })
    }

    let stopWatchUserList = null

    const getList = () => {
      // 候选只有本地自建列表：试听列表已从界面退场（工单 07 / ADR 0006）、
      // 「我的收藏」也不再是本地去处（收藏只写 QQ 的我喜欢，2026-09-24），
      // 留着它们用户仍能往那两处写歌，退场就只是表面功夫
      lists.value = userLists
        .filter(l => !props.excludeListId.includes(l.id))
        .map(l => ({ ...l, isExist: false }))
      checkMusicExist(currentMusicInfo.value)
    }

    watch(() => props.show, show => {
      if (!show) {
        if (stopWatchUserList) {
          stopWatchUserList()
          stopWatchUserList = null
        }
        return
      }
      if (!props.musicInfo) return lists.value = []

      currentMusicInfo.value = 'progress' in props.musicInfo ? props.musicInfo.metadata.musicInfo : props.musicInfo
      getList()

      // 云端歌单列表：还没到手就懒加载一次（initUserCenter 自带「一个会话一次」的守卫，
      // 与「我的歌单」页的左栏同一条路）。拉不动（未登录等）时 cloudTip 会说为什么
      if (!createdLists.length) void initUserCenter()

      stopWatchUserList = watch(userLists, getList)
    })

    onBeforeUnmount(() => {
      if (stopWatchUserList) {
        stopWatchUserList()
        stopWatchUserList = null
      }
    })

    return {
      keyModDown,
      lists,
      checkMusicExist,
      currentMusicInfo,
      cloudLists,
      cloudTip,
    }
  },
  data() {
    return {
      isEditing: false,
      newListName: '',
      rowNum: 3,
      // 正在往云端歌单加的那张卡片的 id（'' = 空闲）：期间所有云端键都禁用，防连点加两次
      addingCloudId: '',
    }
  },
  computed: {
    spaceNum() {
      return this.lists.length < 2 ? 0 : (this.rowNum - this.lists.length % this.rowNum - 1)
    },
    spaceNumCloud() {
      return this.cloudLists.length < 2 ? 0 : (this.rowNum - this.cloudLists.length % this.rowNum - 1)
    },
  },
  mounted() {
    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
  },
  methods: {
    handleResize() {
      const width = window.innerWidth
      this.rowNum = width < 1920
        ? 3
        : width < 2560
          ? 4
          : width < 3840 ? 5 : 6
    },
    handleClick(index) {
      if (this.isMove) void moveListMusics(this.fromListId, this.lists[index].id, [this.currentMusicInfo])
      else void addListMusics(this.lists[index].id, [this.currentMusicInfo])

      this.lists[index].isExist = true
      if (this.keyModDown && !this.isMove) return
      this.$nextTick(() => {
        this.handleClose()
      })
    },
    handleClose() {
      this.$emit('update:show', false)
    },
    /** 加到 QQ 云端自建歌单（卡片就是 store 里那张：dirId 写、id=tid 比对）。
     *  写接口失败必须弹出来——它是用户主动发起的动作，静默失败会让人以为已经加进去了。 */
    async handleAddToCloudList(card) {
      if (this.addingCloudId) return
      this.addingCloudId = card.id
      try {
        await addSongsToCloudList(card, [this.currentMusicInfo])
        if (this.keyModDown) return
        void this.$nextTick(() => {
          this.handleClose()
        })
      } catch (err) {
        void dialog({ message: err?.message || String(err), type: 'error' })
      } finally {
        this.addingCloudId = ''
      }
    },
    handleEditing(event) {
      if (this.isEditing) return
      // if (!this.newListName) this.newListName = this.listName
      this.isEditing = true
      this.$nextTick(() => event.currentTarget.querySelector('.' + this.$style.newListInput).focus())
    },
    async handleSaveList(event) {
      let name = event.target.value
      this.newListName = event.target.value = ''
      this.isEditing = false
      if (!name || (
        userLists.some(l => l.name == name) && !(await dialog.confirm(window.i18n.t('list_duplicate_tip'))))
      ) return
      void createUserList({ name })
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  // padding: 15px 0;
  // max-width: 70%;
  // min-width: 200px;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    font-size: 13px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
    padding: 15px;
  }
}

.name {
  color: var(--color-primary);
}

// 一个去处一组（本地自建列表 / QQ 云端自建歌单）：组头 + 组内按钮网格
.group {
  flex: 1 1 auto;
  min-height: 0;
  // 两组各自最多三成半视口高，超出在组内滚（.btnContent 带 .scroll）。
  // 不封顶的话弹窗会随列表条数无限长，而外层 .content 是 overflow: hidden —— 超出的部分会**看不见**
  max-height: 35vh;
  display: flex;
  flex-flow: column nowrap;
}
.groupTitle {
  flex: none;
  padding: 0 15px 10px;
  font-size: 12px;
  font-weight: normal;
  color: var(--color-font-label);
}
// 这一组进不去时的说明（未登录 / 加载中 / 这一首没有 QQ 歌曲 ID）
.groupTip {
  flex: none;
  padding: 0 15px 15px;
  font-size: 12px;
  color: var(--color-font-label);
}

.btnContent {
  flex: auto;
  max-height: 100%;
  padding-right: 15px;
  display: flex;
  flex-flow: row wrap;
  justify-content: space-evenly;
}

@item-width: (100% / 3);
.btn {
  position: relative;
  box-sizing: border-box;
  margin-left: 15px;
  margin-bottom: 15px;
  height: 36px;
  line-height: 36px;
  padding: 0 10px !important;
  width: calc(@item-width - 15px);
  min-width: 160px;
  .mixin-ellipsis-1();
}

.newList {
  border: 1px dashed var(--color-primary-font-hover);
  // background-color: var(--color-main-background);
  color: var(--color-primary-font-hover);
  opacity: .7;

  svg {
    height: 18px;
    margin-top: 9px;
  }

  &.editing {
    opacity: 1;

    svg {
      display: none;
    }
    .newListInput {
      display: block;
    }
  }
}
.newListInput {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 34px;
  line-height: 34px;
  background: none !important;
  font-size: 14px;
  text-align: center;
  font-family: inherit;
  box-sizing: border-box;
  padding: 0 10px;
  border-radius: 0;
  display: none;
}

@item-width2: (100% / 4);
@media (min-width: 1920px){
  .btn {
    width: calc(@item-width2 - 15px);
  }
}
@item-width3: (100% / 5);
@media (min-width: 2560px){
  .btn {
    width: calc(@item-width3 - 15px);
  }
}
@item-width4: (100% / 6);
@media (min-width: 3840px){
  .btn {
    width: calc(@item-width4 - 15px);
  }
}

</style>
