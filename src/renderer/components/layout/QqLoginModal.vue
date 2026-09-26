<template>
  <material-modal :show="isShowLoginModal" :bg-close="false" @close="closeLoginModal">
    <main :class="$style.container">
      <h2 :class="$style.title">{{ $t('qq_auth__login_title') }}</h2>

      <div :class="$style.qrBox">
        <img v-if="qrcode" :src="qrcode" :class="$style.qr" :alt="$t('qq_auth__qrcode_alt')">
        <span v-else :class="$style.qrPlaceholder">…</span>
      </div>

      <p :class="$style.tip">{{ tipText }}</p>
      <p v-if="loginError" :class="[$style.tip, $style.errorText]">{{ loginError }}</p>

      <div :class="$style.actions">
        <base-btn min @click="refreshQrcode">{{ $t('qq_auth__refresh_qrcode') }}</base-btn>
        <base-btn min @click="closeLoginModal">{{ $t('close') }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script setup lang="ts">
import { computed } from '@common/utils/vueTools'
import { isShowLoginModal, loginError, loginState, qrcode } from '@renderer/store/qqAuth/state'
import { closeLoginModal, refreshQrcode } from '@renderer/store/qqAuth/action'
import { useI18n } from '@root/lang'

const t = useI18n()

/** 状态文案。DONE 不会停留（登录成功即关窗），故不处理。 */
const tipText = computed(() => {
  switch (loginState.value) {
    case 'SCAN':
      return t('qq_auth__tip_scan')
    case 'CONF':
      return t('qq_auth__tip_conf')
    case 'TIMEOUT':
      return t('qq_auth__tip_timeout')
    case 'REFUSE':
      return t('qq_auth__tip_refuse')
    default:
      return t('qq_auth__tip_scan')
  }
})
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  width: 320px;
  padding: 20px 24px 16px;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  color: var(--color-font);
}

.title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
}

.qrBox {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;   // 二维码必须白底，深浅色主题下都要能扫
  border-radius: @radius-border;
}

.qr {
  width: 180px;
  height: 180px;
  image-rendering: pixelated;   // 二维码是 1-bit 图，放大时保持硬边缘更易识别
}

.qrPlaceholder {
  // 硬编码灰而非 token：这块底被强制成白色（见上面 `.qrBox`），主题 token 在白底上的对比度
  // 不可控——深色主题的 `--color-font` / `--color-font-label` 本身是浅色，压在白底上几乎看不见。
  // 取一个两种主题下都能看见的中灰（#bbb ≈ 1.9:1，只是加载占位符，不承载信息）
  color: #bbb;
  font-size: 24px;
}

.tip {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-font-label);
  text-align: center;
  .mixin-ellipsis-2();
}

.errorText {
  // 本仓库没有 error/warning 语义的配色 token，既有代码（如评论加载失败）
  // 也用普通文案色。这里只比普通提示更醒目一档（用正文字色而非 label 色），
  // 不新增 token。
  color: var(--color-font);
}

.actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}
</style>
