<template lang="pug">
//- 下载节（元数据 §4）：本文件只是壳——组标题（h3 的 id 就是元数据的 group.id，票 02 的锚点契约）
//- 加分组内容子组件；项的归属与顺序一律照 settingMetadata.ts，别在这里重排
dt#download {{ $t('setting__download') }}
dd
  h3#download_switch_path {{ $t('setting__download_switch_path_title') }}
  DownloadSwitchPathGroup
dd
  h3#download_concurrent_naming {{ $t('setting__download_concurrent_naming_title') }}
  DownloadConcurrentNamingGroup
dd
  h3#download_lyric_meta {{ $t('setting__download_lyric_meta_title') }}
  DownloadLyricMetaGroup
dd
  h3#download_format {{ $t('setting__download_format_title') }}
  DownloadFormatGroup
</template>

<script>
import DownloadSwitchPathGroup from './DownloadSwitchPathGroup.vue'
import DownloadConcurrentNamingGroup from './DownloadConcurrentNamingGroup.vue'
import DownloadLyricMetaGroup from './DownloadLyricMetaGroup.vue'
import DownloadFormatGroup from './DownloadFormatGroup.vue'

export default {
  name: 'SettingSectionDownload',
  components: {
    DownloadSwitchPathGroup,
    DownloadConcurrentNamingGroup,
    DownloadLyricMetaGroup,
    DownloadFormatGroup,
  },
}
</script>
