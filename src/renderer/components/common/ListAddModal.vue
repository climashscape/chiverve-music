<template>
  <material-modal :show="show" :bg-close="bgClose" :teleport="teleport" max-width="70%" min-width="200px" @close="handleClose">
    <main :class="$style.main">
      <h2>{{ $t('list_add__' + (isMove ? 'title_first_move' : 'title_first_add')) }}&nbsp;<span :class="$style.name">{{ currentMusicInfo.name }}</span>&nbsp;{{ $t('list_add__title_last') }}</h2>
      <!-- 收藏只有一个去处：QQ 音乐的「我喜欢」（本地收藏已取消，2026-09-24）。
           不限登录态：未登录时按下会走接口报错并弹出「请先登录 QQ 音乐」（有可见反馈，
           比藏掉按钮好）；本地歌曲没有 QQ 歌曲 ID、移动模式不是收藏，这两种不显示。 -->
      <div v-if="canAddToCloud" :class="$style.sourceRow">
        <base-btn :class="$style.sourceBtn" :disabled="isAddingCloud" @click="handleAddToCloud">
          {{ $t('list_add__cloud_fav') }}
        </base-btn>
      </div>
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
    </main>
  </material-modal>
</template>

<script>
// import { mapMutations } from 'vuex'
import { watch, ref, computed, onBeforeUnmount } from '@common/utils/vueTools'
import { userLists } from '@renderer/store/list/state'
import { addListMusics, moveListMusics, createUserList, getMusicExistListIds } from '@renderer/store/list/action'
import { addFavSongToCloud, favErrorText } from '@renderer/store/user/action'
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

    // 能加到 QQ「我喜欢」的条件：不是移动模式 + 确实是 QQ 在线歌曲
    // （本地歌曲没有 meta.id/songType，写接口拿不到 songId）。不看登录态——未登录时
    // 写接口会抛「QQ 音乐未登录」，由 handleAddToCloud 弹出来（有可见反馈，不静默）。
    const canAddToCloud = computed(() => (
      !props.isMove &&
      currentMusicInfo.value.source == 'tx' &&
      currentMusicInfo.value.meta?.id != null
    ))

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
      canAddToCloud,
    }
  },
  data() {
    return {
      isEditing: false,
      newListName: '',
      rowNum: 3,
      isAddingCloud: false,
    }
  },
  computed: {
    spaceNum() {
      return this.lists.length < 2 ? 0 : (this.rowNum - this.lists.length % this.rowNum - 1)
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
    /** 收藏到 QQ 音乐的「我喜欢」（云端 dirId=201）——**唯一**的收藏去处（本地收藏已取消）。
     *  写云端这条路径未做过真机验证，所以失败必须弹出来让用户知道，不能像只读接口那样只落一段文案。 */
    async handleAddToCloud() {
      if (this.isAddingCloud) return
      this.isAddingCloud = true
      try {
        await addFavSongToCloud(this.currentMusicInfo)
        void this.$nextTick(() => {
          this.handleClose()
        })
      } catch (err) {
        void dialog({ message: favErrorText(err) })
      } finally {
        this.isAddingCloud = false
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

// 收藏按钮那一条（只剩 QQ 音乐「我喜欢」一个去处，本地收藏已取消）
.sourceRow {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  gap: 10px;
  padding: 0 15px 15px;
}
.sourceBtn {
  flex: 1;
  .mixin-ellipsis-1();
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
