<template>
  <span :class="$style.cover">
    <!-- 兜底图标垫在底层：没传 src（本地自建列表没有封面）或云端封面加载失败时露出来——
         失败的 <img> 是透明的，所以不会出现破图；本地 / 云端用同一个占位，视觉统一 -->
    <span :class="$style.coverEmpty">
      <svg-icon name="music" />
    </span>
    <img
      v-if="src && !isBroken" :class="$style.coverImg"
      loading="lazy" decoding="async" :src="src" alt="" @error="handleError"
    >
  </span>
</template>

<script lang="ts">
import { ref, watch } from '@common/utils/vueTools'

/**
 * 歌单左栏行首的封面（工单 07）。
 *
 * 尺寸写在这里而不是 `rail.less`：两个左栏（本地 / 云端）的行首封面必须一样大，放组件里只有
 * 一处定义；行内的摆放（在三角之后、名字之前，间距由 `.listsLabel` 的 gap 给）仍归 rail.less。
 *
 * 26px 的由来：行高 36px（`@lists-item-height`）里留 5px 上下呼吸；圆角取全站**封面**口径
 * `@radius-border`（4px，同专辑 / 歌单封面），不用头像那套 50%。占位底色 `--color-button-background`
 * 也是全站图片占位口径（`FavAlbumsPanel.cardImg` / `ProfileCard.avatarBox` / `Album.coverBox` 同款）。
 */
export default {
  name: 'PlaylistCover',
  props: {
    src: {
      type: String,
      default: '',
    },
  },
  setup(props: { src: string }) {
    // 加载失败只影响这一行：记在组件实例上，不必让上层维护一张失败表
    const isBroken = ref(false)
    // `src` 换了（云端歌单刷新后换了封面）要重新给一次机会，否则一次失败就永久占位
    watch(() => props.src, () => { isBroken.value = false })

    return {
      isBroken,
      handleError: () => { isBroken.value = true },
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.cover {
  flex: none;
  position: relative;
  width: 26px;
  height: 26px;
  border-radius: @radius-border;
  overflow: hidden;
  background-color: var(--color-button-background);
  display: flex;
  align-items: center;
  justify-content: center;
}
// 图标尺寸走外层定位（`.coverEmpty svg` 的 0,1,1 压过 SvgIcon 全局 `.svg-icon` 的 0,1,0，
// 与两份样式注入的先后无关）；比例照账号卡的无头像占位（55%），这里给 60%
.coverEmpty {
  width: 60%;
  height: 60%;
  color: var(--color-font-label);
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
  }
}
.coverImg {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  // 常态下封面不当拖拽源：否则按着封面拖会拖出一张图片幽灵。排序模式（按住 ctrl）不受影响——
  // rail.less 的 `.listsContent.sortable *` 是 0,2,0，压过这里的 0,1,0，那时封面照旧能起拖、整行可排序
  -webkit-user-drag: none;
}
</style>
