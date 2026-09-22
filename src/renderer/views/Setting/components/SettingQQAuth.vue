<template lang="pug">
dt#qq_auth {{ $t('setting__qq_auth') }}
dd.gap-top
  div
    .p.small
      template(v-if="status.isLogin")
        | {{ $t('qq_auth__logged_in') }}
        span &nbsp;·&nbsp;{{ status.musicidMasked }}
        span(v-if="expiresText") &nbsp;·&nbsp;{{ $t('qq_auth__expires_at') }} {{ expiresText }}
      span(v-else) {{ $t('qq_auth__not_logged_in') }}
    .p.gap-top.small(v-if="status.lastRefreshError")
      span {{ status.lastRefreshError }}
    .p.gap-top
      base-btn(v-if="!status.isLogin" min @click="openLoginModal") {{ $t('qq_auth__login') }}
      template(v-else)
        base-btn(min :disabled="isRefreshing" @click="handleRefresh") {{ $t('qq_auth__refresh_credential') }}
        base-btn.gap-left(min @click="handleLogout") {{ $t('qq_auth__logout') }}
</template>

<script>
import { computed, onMounted } from '@common/utils/vueTools'
import { status, isRefreshing } from '@renderer/store/qqAuth/state'
import { initQQAuth, openLoginModal, logout, refreshCredential } from '@renderer/store/qqAuth/action'

export default {
  name: 'SettingQQAuth',
  setup() {
    // 只在进入本设置节时拉一次状态；登录态的后续变化由主进程推送更新
    onMounted(() => {
      void initQQAuth()
    })

    // 直接显示到期时刻，避免 i18n 占位符与单位换算的额外复杂度
    const expiresText = computed(() => {
      const at = status.expiresAt
      if (at == null) return ''
      const d = new Date(at * 1000)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    })

    const handleRefresh = () => {
      void refreshCredential()
    }
    const handleLogout = () => {
      void logout()
    }

    return {
      status,
      isRefreshing,
      expiresText,
      openLoginModal,
      handleRefresh,
      handleLogout,
    }
  },
}
</script>
