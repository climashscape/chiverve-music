<template>
  <!-- 未登录：给「先登录 QQ 音乐」引导（不是一颗点了没反应的关注键），点它就开既有扫码弹窗 -->
  <span v-if="guide === 'login'" :class="$style.row">
    <span v-if="showMessage" :class="$style.message">{{ $t('user_center__need_login') }}</span>
    <base-btn min :title="$t('user_center__need_login')" @click.stop="startLogin">{{ $t('qq_auth__login') }}</base-btn>
  </span>
  <!-- 网页会话不可用 / 已过期（ADR-0010 的代价）：这一位现在写不进去（服务端会拒），
       所以关注键换成「需要重新扫码以启用关注」的引导 + **就地**扫码入口
       （`views/Follow/index.vue` 同一个 openLoginModal）。关注态本身没被翻转，扫码完再点一次即可。 -->
  <span v-else-if="guide === 'rescan'" :class="$style.row">
    <span v-if="showMessage" :class="$style.message">{{ $t('singer__follow_need_rescan') }}</span>
    <base-btn min :title="$t('singer__follow_need_rescan')" @click.stop="startLogin">{{ $t('singer__follow_rescan') }}</base-btn>
  </span>
  <!-- 取不到（null）：整块不渲染 —— 把「不知道」画成「未关注」是在撒谎（票 02 的三态契约）。
       频控/网络/未知这类失败**按钮保持原态**，原因走 title（窄位）或就地文案行（`show-message`）。 -->
  <span v-else-if="state !== null" :class="$style.row">
    <base-btn min :disabled="isWriting" :title="tooltip || undefined" @click.stop="handleToggle">{{ label }}</base-btn>
    <span v-if="showMessage && errorMessage" :class="$style.message">{{ errorMessage }}</span>
  </span>
</template>

<script lang="ts">
import { computed } from '@common/utils/vueTools'
import { useFollowSinger } from './useFollowSinger'

const t = (key: string) => window.i18n.t(key as any)

/**
 * 关注 / 取消关注**两态键**（票 03 的第一落点 + 票 04 的铺开共用件）。
 *
 * 只是 `useFollowSinger` 的一层壳：所有判态、写通道、失败分支都在那里（多处共用同一份关注态）。
 * 这一层负责的三件事：
 *
 *   1. **三态渲染**：登录引导 / 重新扫码引导 / 两态键，取不到（`null`）时整块不渲染；
 *   2. **点击期间 loading**：写请求在途按钮禁用、文案换成「处理中…」；
 *   3. **点它别连带触发行点击**：本件出现的每一处（卡片、列表行、弹窗歌手名）外层都有 `@click`
 *      （跳歌手页 / 打开 MV），所以按钮自己 `@click.stop`——否则关注一下就被跳走。
 *
 * `show-message`：歌手页那种有余量的位置开它（失败/引导文案就地常驻）；卡片、列表行这类窄位
 * 默认只把原因挂在按钮 `title` 上——**不许静默**，但也不占版面。
 */
export default {
  name: 'FollowSingerButton',
  props: {
    /** 歌手 mid（唯一判据；没有 mid 的地方不要用本件） */
    mid: {
      type: String,
      required: true,
    },
    /** 就地显示文案（失败原因 / 登录·重新扫码引导）；默认只挂按钮 title */
    showMessage: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['changed'],
  setup(props: { mid: string, showMessage: boolean }, { emit }: { emit: (event: 'changed', followed: boolean) => void }) {
    const { state, isWriting, guide, errorMessage, toggle, startLogin } = useFollowSinger(() => props.mid)

    const label = computed(() => {
      if (isWriting.value) return t('singer__follow_loading')
      return state.value === true ? t('singer__unfollow') : t('singer__follow')
    })
    // 失败原因是服务端/数据层的原文（可能是英文技术串），空串就不挂 title
    const tooltip = computed(() => errorMessage.value)

    const handleToggle = async() => {
      const followed = await toggle()
      // 只在**服务端确认写成功**后通知外部（关注列表那种「取关后就该少一位」的界面据此刷新）
      if (followed !== null) emit('changed', followed)
    }

    return {
      state,
      isWriting,
      guide,
      errorMessage,
      label,
      tooltip,
      handleToggle,
      startLogin,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

// 内联块（不抢占外层布局）：它出现的三处都在行内/卡片里，块级元素会把版面拆掉
.row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
}
.message {
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-font-label);
}
</style>
