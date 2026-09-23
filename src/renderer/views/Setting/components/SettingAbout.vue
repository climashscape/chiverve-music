<template lang="pug">
dt#about {{ $t('setting__about') }}
dd
  .p.small {{ $t('setting__about_product') }}
  .p.small {{ $t('setting__about_based_on') }}
  .p.small
    | {{ $t('setting__about_pact_tip') }}
    base-btn(min @click="handleShowPact") {{ $t('setting__about_pact_btn') }}
    | 。
</template>

<script>
// import { ref, onBeforeUnmount } from '@common/utils/vueTools'
import { isShowPact } from '@renderer/store'
import { openUrl, clipboardWriteText } from '@common/utils/electron'

export default {
  name: 'SettingAbout',
  setup() {
    const handleShowPact = () => {
      isShowPact.value = true
    }
    return {
      openUrl,
      clipboardWriteText,
      handleShowPact,
    }
  },
}
</script>
