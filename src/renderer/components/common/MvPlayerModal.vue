<template>
  <material-modal :show="show" :max-width="'86%'" :max-height="'92%'" teleport="#view" @close="handleClose">
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
        <!--
          歌手名可点（工单 02）。这里**不用歌手选择菜单**：弹窗的层级（Modal.vue 的 z-index 99/100）
          压得住 base-menu（z-index 10），菜单点不到。MV 数据本身带 singers[]，逐位渲染成链接，
          要挑谁直接点谁——比「先弹菜单再挑」更直接。
        -->
        <p v-if="singers.length" :class="$style.singer">
          <template v-for="(item, index) in singers" :key="item.mid">
            <span v-if="index" :class="$style.singerGap"> / </span>
            <span :class="$style.singerLink" :title="$t('list__jump_singer')" @click.stop="handleSingerJump(item)">{{ item.name || item.mid }}</span>
          </template>
        </p>
        <p v-else-if="singer" :class="$style.singer" :title="singer">{{ singer }}</p>
        <p :class="$style.meta">
          <span v-if="playCount">{{ $t('mv__play_count') }}：{{ playText }}</span>
          <span v-if="interval">{{ $t('music_time') }}：{{ interval }}</span>
          <span v-if="pubDate">{{ $t('mv__pub_date') }}：{{ pubDate }}</span>
          <span v-if="uploaderName">{{ $t('mv__uploader') }}：{{ uploaderName }}</span>
        </p>
        <p v-if="desc" :class="$style.desc">{{ desc }}</p>
        <!--
          失败提示分两类：「编码解不开」与「直链/网络失效」要分开说——旧实现一律说「地址已失效，
          可重新获取」，而 H.265 档在本机根本不是重取能解决的（见 tx/mv.js 的 MV_REQUEST_FORMAT）。
        -->
        <p v-if="playError === 'codec'" :class="$style.tip">{{ $t('mv__codec_unsupported') }}</p>
        <p v-else-if="playError === 'expired'" :class="$style.tip">{{ $t('mv__url_expired') }}</p>
        <!-- 编码/体积在失败时也要能看到（所以不是 v-else-if）：真机排查就靠这一行认「拿到的是哪条流」 -->
        <p v-if="sizeText" :class="$style.tip">{{ sizeText }}</p>
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
import { normalizeSingers, type JumpSinger } from '@common/utils/musicLink'
import useMusicJump from '@renderer/utils/compositions/useMusicJump'
import type { MvDetail, MvInfo } from '@renderer/store/mv'

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
    // <video> 自己的播放失败：分两类显示，只标记不自动重取——自动重取会在
    // 「地址有效但编码不支持」这类错误上死循环（换多少条流都解不开）。重取由用户点按钮触发。
    //
    // 分类依据是 `MediaError.code`（媒体层给的，比我们猜可靠）：
    //   3 = MEDIA_ERR_DECODE / 4 = MEDIA_ERR_SRC_NOT_SUPPORTED → 编码/容器解不开，
    //   换个直链也没用（本机常见的 H.265 档就是这条，见 tx/mv.js 的 MV_REQUEST_FORMAT）；
    //   其它（1 中止 / 2 网络）→ 原来的「直链失效，可重新获取」是对的。
    const playError = ref<'' | 'codec' | 'expired'>('')

    // 换地址（重新获取成功）或重新打开时清掉上一次的播放错误
    watch(() => props.url, () => {
      playError.value = ''
    })

    const info = computed<Partial<MvDetail & MvInfo>>(() => props.detail ?? props.mv ?? {})
    const name = computed(() => info.value.name ?? '')
    const singer = computed(() => info.value.singer ?? '')
    // 运行期带 singers[]（tx/mv.js 的 toSinger），但 MvInfo/MvDetail 类型里没有声明——这里按运行期数据取
    const singers = computed(() => normalizeSingers((info.value as MvInfo & { singers?: any[] }).singers))
    const playCount = computed(() => Number(info.value.playCount ?? 0))
    const playText = computed(() => playCount.value ? formatPlayCount(playCount.value) : '')
    const interval = computed(() => info.value.interval ?? '')
    const pubDate = computed(() => info.value.pubDate ?? '')
    const desc = computed(() => info.value.desc ?? '')
    const uploaderName = computed(() => info.value.uploader?.name ?? '')

    const handlePlayError = (e: Event) => {
      // 事件从 <video> 冒上来；拿不到 code 时按「直链/网络」算（保守：保留可重取的动作）
      const code = (e.target as HTMLVideoElement | null)?.error?.code
      playError.value = code === 3 || code === 4 ? 'codec' : 'expired'
    }
    // 点歌手名进歌手页：每一位自带 mid（详情/列表数据里就有），不用再请求
    const { jumpToSingerList } = useMusicJump()
    /**
     * 点歌手名先关弹窗，再跳（ui-polish-followups 工单 04）。
     *
     * 不关的话它会**悬在歌手页上挡屏**：弹窗状态是 `store/mv` 的 `player.show`（四个调用方共用），
     * 而 `material-modal` 是 `teleport="#view"`——路由切换不会卸载它，只有 `player.show` 变 false 才会关。
     * 所以由弹窗自己 `emit('close')`（四个调用方都接了 `@close="closePlayer"`，一处改全部覆盖），
     * 而不是去四个视图里各加一遍；顺带也停掉了正在播的 MV（`closePlayer` 会清 url）。
     */
    const handleSingerJump = (item: JumpSinger) => {
      emit('close')
      jumpToSingerList([item])
    }
    // 「用系统播放器打开」= 交给系统默认处理程序：这里复用仓库的 openUrl 包装
    // （内部就是 `shell.openExternal`，另外带 http(s) 校验，@common/utils/electron.ts:19）。
    // ⚠️ https 直链在 Linux 上是由默认浏览器接管，不一定是桌面播放器。
    const handleOpenExternal = () => { void openUrl(props.url) }
    const handleClose = () => { emit('close') }

    return {
      playError,
      name,
      singer,
      singers,
      handleSingerJump,
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
  // 竖向 flex + 可滚动：让容器能被 material-modal 的 max-height 压住。
  // ⚠️ 不写 `min-height: 0` 的话，flex 项的最小尺寸是内容高度，视频区+信息区超高时
  // 会被 Modal 的 `overflow: hidden` 从底部裁掉——旧实现就是这样：1114×718 的窗口下
  // #view 只有 582px，内容要 575px 而 max-height（默认 76%）只给 442px，底部按钮整排看不见
  // （工单 01 的「太挤」就是它）。所以本弹窗显式传 `max-height="92%"`，再配下面这两条兜住。
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  // 视频区压到 200px 后还不够高时（最小窗口 828×540），由这一层滚动兜底，保证按钮够得着
}
.videoBox {
  // 高度自适应：16:9 是理想值（680 → 382.5px），窗口不够高时由 flex 收缩，
  // 画面交给 <video> 的 object-fit: contain 留黑边（.videoBox 底色本来就是黑）
  flex: 0 1 auto;
  // 不许再矮：再矮就不是「画面」而是一条缝了，剩下的高度缺口交给 .container 滚动
  min-height: 200px;
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
  // contain 而不是默认的拉伸：视频区被压扁时保持画幅比例，黑边由底色接上
  object-fit: contain;
}
.placeholder p {
  font-size: 14px;
  color: #fff;
}
.info {
  // 不参与收缩（flex: none）：信息区自己保持舒适高度，缺口全由视频区让——
  // 反过来（让信息区先被压）就会出现「视频很大、按钮挤没了」，正是本轮要修的那个观感
  flex: none;
  padding: 18px 20px 20px;
}
.name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-font);
  .mixin-ellipsis-1();
}
.singer {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-font);
  .mixin-ellipsis-1();
}
// 可点的歌手名（工单 02）
.singerLink {
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
}
.singerGap {
  color: var(--color-font-label);
}
.meta {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-font-label);

  span {
    margin-right: 14px;
  }
}
.desc {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-font-label);
  .mixin-ellipsis(3);
}
.tip {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-font-label);
}
.actions {
  // 控制区与信息区分开：一条分隔线 + 更大上边距，别让它和最后一行文字糊在一起
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--color-primary-light-100-alpha-100);
  display: flex;
  gap: 12px;
}
</style>
