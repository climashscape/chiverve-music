<template>
  <div :class="$style.btns">
    <button v-if="playBtn" type="button" :aria-label="$t('list__play')" :title="$t('list__play')" @contextmenu.capture.stop @click.stop="handleClick('play')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 287.386 287.386" space="preserve">
        <use xlink:href="#icon-testPlay" />
      </svg>
    </button>
    <button v-if="favBtn && canFav" type="button" :aria-label="favTitle" :title="favTitle" @contextmenu.capture.stop @click.stop="handleClick('fav')">
      <!-- 「我喜欢」的一键开关（工单 06）：文案与配色都跟着当前状态走——已在我喜欢里 →
          主色 +「取消喜欢」，不在 → 普通色 +「收藏到…」。仓库里没有实心心形，状态靠颜色区分
           （与雷达页底部那个收藏键同款做法）；这里**不能**加 `v-once`，否则 class 冻在第一帧。
           不能收藏的歌（本地文件等）由 v-if 的 canFav 拦掉，不显示死键 -->
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 444.87 391.18" space="preserve" :class="isFav ? $style.favOn : null">
        <use xlink:href="#icon-love" />
      </svg>
    </button>
    <button v-if="listAddBtn" type="button" :aria-label="$t('list__add_to')" :title="$t('list__add_to')" @contextmenu.capture.stop @click.stop="handleClick('listAdd')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 42 42" space="preserve">
        <use xlink:href="#icon-addTo" />
      </svg>
    </button>
    <button v-if="downloadBtn && appSetting['download.enable']" type="button" :aria-label="$t('list__download')" :title="$t('list__download')" @contextmenu.capture.stop @click.stop="handleClick('download')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 475.078 475.077" space="preserve">
        <use xlink:href="#icon-download" />
      </svg>
    </button>
    <button v-if="startBtn" type="button" :aria-label="$t('list__start')" :title="$t('list__start')" @contextmenu.capture.stop @click.stop="handleClick('start')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-play" />
      </svg>
    </button>
    <button v-if="pauseBtn" type="button" :aria-label="$t('list__pause')" :title="$t('list__pause')" @contextmenu.capture.stop @click.stop="handleClick('pause')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-pause" />
      </svg>
    </button>
    <button v-if="fileBtn" type="button" :aria-label="$t('list__file')" :title="$t('list__file')" @contextmenu.capture.stop @click.stop="handleClick('file')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="-61 0 512 512" space="preserve">
        <use xlink:href="#icon-musicFile" />
      </svg>
    </button>
    <button v-if="searchBtn" type="button" :aria-label="$t('list__search')" :title="$t('list__search')" @contextmenu.capture.stop @click.stop="handleClick('search')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 30.239 30.239" space="preserve">
        <use xlink:href="#icon-search" />
      </svg>
    </button>
    <button v-if="removeBtn" type="button" :aria-label="removeLabel || $t('list__remove')" :title="removeLabel || $t('list__remove')" @click.stop="handleClick('remove')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 212.982 212.982" space="preserve">
        <use xlink:href="#icon-delete" />
      </svg>
    </button>
  </div>
</template>

<script>
import { appSetting } from '@renderer/store/setting'
import { canFavSongInCloud, isFavSongInCloud } from '@renderer/store/user/action'

export default {
  props: {
    index: {
      type: Number,
      required: true,
    },
    // 「我喜欢」键与「加入歌单」键是两件事（工单 06）：前者是状态开关，后者开弹窗。
    // 心形键要知道是哪一首才能显示对状态，所以要把歌传进来（不传就不显示这个键）。
    musicInfo: {
      type: Object,
      default: null,
    },
    // 默认关：本地文件表（ListMusicTable / 下载页）不传 musicInfo，传了也没用
    favBtn: {
      type: Boolean,
      default: false,
    },
    startBtn: {
      type: Boolean,
      default: false,
    },
    pauseBtn: {
      type: Boolean,
      default: false,
    },
    removeBtn: {
      type: Boolean,
      default: false,
    },
    // 「移除」按钮的语义随场景变（本地列表=移除，QQ 我喜欢=取消喜欢），文案由调用方给
    removeLabel: {
      type: String,
      default: '',
    },
    downloadBtn: {
      type: Boolean,
      default: true,
    },
    playBtn: {
      type: Boolean,
      default: true,
    },
    listAddBtn: {
      type: Boolean,
      default: true,
    },
    searchBtn: {
      type: Boolean,
      default: false,
    },
    fileBtn: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['btn-click'],
  setup() {
    return {
      appSetting,
    }
  },
  computed: {
    /** 这一首能写进 QQ「我喜欢」吗（本地文件 / 非 tx 源没有 QQ 歌曲 ID）。 */
    canFav() {
      return canFavSongInCloud(this.musicInfo)
    },
    /** 当前状态：读的是 store/user 的收藏全量 id 集合（shallowReactive，写入后就地更新）。 */
    isFav() {
      return this.canFav && isFavSongInCloud(this.musicInfo)
    },
    /** 悬停提示 + 无障碍名，随状态变（复用既有 key，不另造一套文案）。 */
    favTitle() {
      return this.isFav ? this.$t('list__unlove') : this.$t('list_add__cloud_fav')
    },
  },
  methods: {
    handleClick(action) {
      this.$emit('btn-click', { action, index: this.index })
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.btns {
  line-height: 1.2;

  button {
    background-color: transparent;
    border: none;
    border-radius: @form-radius;
    margin-right: 5px;
    cursor: pointer;
    padding: 4px 7px;
    color: var(--color-button-font);
    outline: none;
    transition: background-color 0.2s ease;
    line-height: 0;
    &:last-child {
      margin-right: 0;
    }

    svg {
      height: 16px;
    }

    &:hover {
      background-color: var(--color-button-background-hover);
    }
    &:active {
      background-color: var(--color-button-background-active);
    }
  }
}

// 已在我喜欢里：心形用主色（唯一的状态提示，图标本身没有实心版本）
.favOn {
  color: var(--color-primary);
}

</style>
