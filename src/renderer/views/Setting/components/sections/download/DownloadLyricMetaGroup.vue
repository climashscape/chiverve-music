<template lang="pug">
//- §4.3 歌词与元数据：九项（元数据顺序：先「写歌词文件」四项，再「嵌入音频」五项）
//- 两个组各有一枚总闸，关掉后同组其余项 disabled（action.ts 里靠总闸直接 return / 不取歌词）
div
  //- 写歌词文件（.lrc）
  .gap-top
    base-checkbox(id="setting_download_isDownloadLrc" data-setting-key="download.isDownloadLrc" :model-value="appSetting['download.isDownloadLrc']" :label="$t('setting__download_lyric_title')" @update:model-value="updateSetting({'download.isDownloadLrc': $event})")
  .gap-top
    base-checkbox(id="setting_download_isDownloadTLrc" data-setting-key="download.isDownloadTLrc" :disabled="!appSetting['download.isDownloadLrc']" :model-value="appSetting['download.isDownloadTLrc']" :label="$t('setting__download_tlyric')" @update:model-value="updateSetting({'download.isDownloadTLrc': $event})")
  .gap-top
    base-checkbox(id="setting_download_isDownloadRLrc" data-setting-key="download.isDownloadRLrc" :disabled="!appSetting['download.isDownloadLrc']" :model-value="appSetting['download.isDownloadRLrc']" :label="$t('setting__download_rlyric')" @update:model-value="updateSetting({'download.isDownloadRLrc': $event})")
  //- i18n key 名不许改（AGENTS §8：指 LX 定义的逐字歌词格式名），只改值文案
  .gap-top
    base-checkbox(id="setting_download_isDownloadLxLrc" data-setting-key="download.isDownloadLxLrc" :disabled="!appSetting['download.isDownloadLrc']" :model-value="appSetting['download.isDownloadLxLrc']" :label="$t('setting__download_lxlyric')" @update:model-value="updateSetting({'download.isDownloadLxLrc': $event})")
  //- 嵌入音频元数据：封面独立，歌词组由总闸控后三项
  .gap-top
    base-checkbox(id="setting_download_isEmbedPic" data-setting-key="download.isEmbedPic" :model-value="appSetting['download.isEmbedPic']" :label="$t('setting__download_embed_pic')" @update:model-value="updateSetting({'download.isEmbedPic': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyric" data-setting-key="download.isEmbedLyric" :model-value="appSetting['download.isEmbedLyric']" :label="$t('setting__download_embed_lyric')" @update:model-value="updateSetting({'download.isEmbedLyric': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyricT" data-setting-key="download.isEmbedLyricT" :disabled="!appSetting['download.isEmbedLyric']" :model-value="appSetting['download.isEmbedLyricT']" :label="$t('setting__download_embed_tlyric')" @update:model-value="updateSetting({'download.isEmbedLyricT': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyricR" data-setting-key="download.isEmbedLyricR" :disabled="!appSetting['download.isEmbedLyric']" :model-value="appSetting['download.isEmbedLyricR']" :label="$t('setting__download_embed_rlyric')" @update:model-value="updateSetting({'download.isEmbedLyricR': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyricLx" data-setting-key="download.isEmbedLyricLx" :disabled="!appSetting['download.isEmbedLyric']" :model-value="appSetting['download.isEmbedLyricLx']" :label="$t('setting__download_embed_lxlyric')" @update:model-value="updateSetting({'download.isEmbedLyricLx': $event})")
</template>

<script>
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'DownloadLyricMetaGroup',
  setup() {
    return {
      appSetting,
      updateSetting,
    }
  },
}
</script>
