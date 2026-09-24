<template lang="pug">
div(:class="$style.table")
  .p(v-for="row in rows" :key="row.id" :class="$style.row")
    div(:class="$style.rowMain")
      span(:class="$style.name") {{ row.name }}
      span.auto-hidden(:class="$style.value") {{ row.value }}
      base-btn.btn(min :disabled="row.disabled" @click="row.clear") {{ row.button }}
    .p.small(:class="$style.tip") {{ row.tip }}
</template>

<script>
import { ref, computed, watch } from '@common/utils/vueTools'
import {
  clearCache, getCacheSize,
  getMusicUrlCount, clearMusicUrl,
  getLyricRawCount, clearLyricRaw,
  getLyricEditedCount, clearLyricEdited,
} from '@renderer/utils/ipc'
import { sizeFormate } from '@common/utils/common'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'

/**
 * 「数据与存储 → 缓存与清理」（归类表附 B4）：四块清理收成一张表——
 * 每行 = 名称 + 当前量 + 清理按钮 + 一行「清掉会怎样」，原来是 4 个 h3 各带一两个按钮。
 *
 * 四条清理的**语义各不相同**（清的是四份不同的数据），不要合并成「一键全清」：
 * - 资源缓存 = 渲染进程 Cache Storage（图片/音频），有二次确认；
 * - 歌曲 URL / 歌词缓存 = `music_url` / `lyric_raw` 两张表，清完只是下次重新取流/拉词，无确认；
 * - 已调整偏移的歌词 = `lyric_edited` 表（用户手调过的偏移记录），有二次确认。
 * 「清空我的列表数据」不在这张表里（它不是缓存），见 data 节 `data_list` 组。
 */
export default {
  name: 'SettingDataCacheClear',
  props: {
    /**
     * 外部要求重新取数的信号（票 08）：同节的「缓存回收策略」跑完回收会把它 +1，
     * 这里跟着重取歌曲 URL 缓存的计数（回收删的行就在那张表里，不刷新会显示旧数字）。
     */
    refreshKey: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    const t = useI18n()

    const cacheSize = ref('0 B')
    const isDisabledResourceCacheClear = ref(false)
    const refreshCacheSize = () => {
      void getCacheSize().then(size => {
        cacheSize.value = sizeFormate(size)
      })
    }
    const clearResourceCache = async() => {
      if (!await dialog.confirm({
        message: t('setting__other_resource_cache_tip_confirm'),
        cancelButtonText: t('cancel_button_text'),
        confirmButtonText: t('setting__other_resource_cache_confirm'),
      })) return
      isDisabledResourceCacheClear.value = true
      void clearCache().then(() => {
        refreshCacheSize()
        isDisabledResourceCacheClear.value = false
      })
    }
    refreshCacheSize()

    const musicUrlCount = ref(0)
    const isDisabledMusicUrlCacheClear = ref(false)
    const refreshMusicUrlCount = () => {
      void getMusicUrlCount().then(count => {
        musicUrlCount.value = count
      })
    }
    const handleClearMusicUrlCache = async() => {
      isDisabledMusicUrlCacheClear.value = true
      void clearMusicUrl().then(() => {
        refreshMusicUrlCount()
        isDisabledMusicUrlCacheClear.value = false
      })
    }
    refreshMusicUrlCount()

    // 回收（票 08）删的就是 `music_url` 表的行：同节的回收块跑完会把信号 +1，这里跟着重取计数
    watch(() => props.refreshKey, refreshMusicUrlCount)

    const lyricRawCount = ref(0)
    const isDisabledLyricRawCacheClear = ref(false)
    const refreshLyricRawCount = () => {
      void getLyricRawCount().then(count => {
        lyricRawCount.value = count
      })
    }
    const handleClearLyricRawCache = async() => {
      isDisabledLyricRawCacheClear.value = true
      void clearLyricRaw().then(() => {
        refreshLyricRawCount()
        isDisabledLyricRawCacheClear.value = false
      })
    }
    refreshLyricRawCount()

    const lyricEditedCount = ref(0)
    const isDisabledLyricEditedCacheClear = ref(false)
    const refreshLyricEditedCount = () => {
      void getLyricEditedCount().then(count => {
        lyricEditedCount.value = count
      })
    }
    const handleClearLyricEditedCache = async() => {
      if (!await dialog.confirm({
        message: t('setting__other_lyric_edited_clear_tip_confirm'),
        cancelButtonText: t('cancel_button_text'),
        confirmButtonText: t('setting__other_resource_cache_confirm'),
      })) return
      isDisabledLyricEditedCacheClear.value = true
      void clearLyricEdited().then(() => {
        refreshLyricEditedCount()
        isDisabledLyricEditedCacheClear.value = false
      })
    }
    refreshLyricEditedCount()

    const rows = computed(() => [
      {
        id: 'resource',
        name: t('setting__data_cache_row_resource'),
        value: cacheSize.value,
        button: t('setting__other_resource_cache_clear_btn'),
        tip: t('setting__other_resource_cache_tip'),
        disabled: isDisabledResourceCacheClear.value,
        clear: clearResourceCache,
      },
      {
        id: 'musicUrl',
        name: t('setting__data_cache_row_music_url'),
        value: String(musicUrlCount.value),
        button: t('setting__other_music_url_clear_btn'),
        tip: t('setting__data_cache_row_music_url_tip'),
        disabled: isDisabledMusicUrlCacheClear.value,
        clear: handleClearMusicUrlCache,
      },
      {
        id: 'lyricRaw',
        name: t('setting__data_cache_row_lyric_raw'),
        value: String(lyricRawCount.value),
        button: t('setting__other_lyric_raw_clear_btn'),
        tip: t('setting__data_cache_row_lyric_raw_tip'),
        disabled: isDisabledLyricRawCacheClear.value,
        clear: handleClearLyricRawCache,
      },
      {
        id: 'lyricEdited',
        name: t('setting__data_cache_row_lyric_edited'),
        value: String(lyricEditedCount.value),
        button: t('setting__other_lyric_edited_clear_btn'),
        tip: t('setting__data_cache_row_lyric_edited_tip'),
        disabled: isDisabledLyricEditedCacheClear.value,
        clear: handleClearLyricEditedCache,
      },
    ])

    return {
      rows,
    }
  },
}
</script>

<style lang="less" module>
.table {
  display: flex;
  flex-flow: column nowrap;
}

.row {
  padding: 6px 0;
  & + .row {
    border-top: var(--color-list-header-border-bottom);
  }
}

.rowMain {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
}

.name {
  flex: none;
  min-width: 150px;
}

.value {
  flex: auto;
  font-size: 12px;
}

.tip {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.25;
  opacity: .7;
}
</style>
