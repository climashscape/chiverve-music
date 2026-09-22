<template>
  <material-modal :show="show" :max-width="'86%'" teleport="#view" @close="handleClose">
    <div :class="$style.container">
      <div :class="$style.videoBox">
        <video
          v-if="url"
          :class="$style.video"
          :src="url"
          controls
          autoplay
          @error="handlePlayError"
        />
        <div v-else :class="$style.placeholder">
          <p v-text="isLoading ? $t('list__loading') : (urlError || $t('no_item'))" />
        </div>
      </div>

      <div :class="$style.info">
        <h3 :class="$style.name" :title="name">{{ name }}</h3>
        <p v-if="singer" :class="$style.singer" :title="singer">{{ singer }}</p>
        <p :class="$style.meta">
          <span v-if="playCount">{{ $t('mv__play_count') }}：{{ playText }}</span>
          <span v-if="interval">{{ $t('music_time') }}：{{ interval }}</span>
          <span v-if="pubDate">{{ $t('mv__pub_date') }}：{{ pubDate }}</span>
          <span v-if="uploaderName">{{ $t('mv__uploader') }}：{{ uploaderName }}</span>
        </p>
        <p v-if="desc" :class="$style.desc">{{ desc }}</p>
        <p v-if="playError" :class="$style.tip">{{ $t('mv__url_expired') }}</p>
        <p v-else-if="sizeText" :class="$style.tip">{{ sizeText }}</p>
        <div :class="$style.actions">
          <base-btn min :disabled="isLoading" @click="$emit('retry')">{{ $t('mv__retry') }}</base-btn>
          <base-btn min :disabled="!url" @click="handleOpenExternal">{{ $t('mv__open_external') }}</base-btn>
        </div>
      </div>
    </div>
  </material-modal>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { openUrl } from '@common/utils/electron'
import { formatPlayCount } from '@renderer/utils'
import type { MvDetail, MvInfo } from '../useMv'

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    /** 列表项：详情还没回来时先用它把信息区填上 */
    mv: {
      type: Object as () => MvInfo | null,
      default: null,
    },
    detail: {
      type: Object as () => MvDetail | null,
      default: null,
    },
    url: {
      type: String,
      default: '',
    },
    urlError: {
      type: String,
      default: '',
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    sizeText: {
      type: String,
      default: '',
    },
  },
  emits: ['close', 'retry'],
  // 显式标注参数类型：本文件是 <script lang="ts"> 的 Options 组件，而仓库不用
  // defineComponent（见 AGENTS §2.5），不标注会触发 TS7006/TS7031 让构建失败
  setup(props: {
    show: boolean
    mv: MvInfo | null
    detail: MvDetail | null
    url: string
    urlError: string
    isLoading: boolean
    sizeText: string
  }, { emit }: { emit: (event: 'close' | 'retry') => void }) {
    // <video> 自己的播放失败（多半是直链过期）：只标记，不自动重取——自动重取会在
    // 「地址有效但编码不支持」这类错误上死循环。重新获取由用户点按钮触发。
    const playError = ref(false)

    // 换地址（重新获取成功）或重新打开时清掉上一次的播放错误
    watch(() => props.url, () => {
      playError.value = false
    })

    const info = computed<Partial<MvDetail & MvInfo>>(() => props.detail ?? props.mv ?? {})
    const name = computed(() => info.value.name ?? '')
    const singer = computed(() => info.value.singer ?? '')
    const playCount = computed(() => Number(info.value.playCount ?? 0))
    const playText = computed(() => playCount.value ? formatPlayCount(playCount.value) : '')
    const interval = computed(() => info.value.interval ?? '')
    const pubDate = computed(() => info.value.pubDate ?? '')
    const desc = computed(() => info.value.desc ?? '')
    const uploaderName = computed(() => info.value.uploader?.name ?? '')

    const handlePlayError = () => { playError.value = true }
    // 「用系统播放器打开」= 交给系统默认处理程序：这里复用仓库的 openUrl 包装
    // （内部就是 `shell.openExternal`，另外带 http(s) 校验，@common/utils/electron.ts:19）。
    // ⚠️ https 直链在 Linux 上是由默认浏览器接管，不一定是桌面播放器。
    const handleOpenExternal = () => { void openUrl(props.url) }
    const handleClose = () => { emit('close') }

    return {
      playError,
      name,
      singer,
      playCount,
      playText,
      interval,
      pubDate,
      desc,
      uploaderName,
      handlePlayError,
      handleOpenExternal,
      handleClose,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  width: 680px;
  max-width: 80vw;
}
.videoBox {
  // 视频画布尺寸固定 16:9：MV 封面与画面都是 640x360 这一档，按钮区不受画面比例影响
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  // 播放器底色必须是黑（硬编码理由）：这是视频黑边，不是主题色；深色主题下用灰阶 token
  // 会发灰、浅色主题下会变成白框，两种主题都不对
  background-color: #000;
}
.video {
  width: 100%;
  height: 100%;
}
.placeholder p {
  font-size: 14px;
  color: #fff;
}
.info {
  padding: 12px 15px 15px;
}
.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-font);
  .mixin-ellipsis-1();
}
.singer {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-font);
  .mixin-ellipsis-1();
}
.meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-font-label);

  span {
    margin-right: 12px;
  }
}
.desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-font-label);
  .mixin-ellipsis(3);
}
.tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-font-label);
}
.actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}
</style>
