<template lang="pug">
dd
  h3#play_quality {{ $t('setting__play_quality_title') }}
  div
    //- 目标档位；实际取「这首歌有的档位 ∩ 音源支持的档位」里最接近的，取不到退 128k。
    //- 四个档位串是契约（URL 缓存 key = `${id}_${实际档位}`），界面文案可以中文化但值不许动（票 11）
    div.gap-top(data-setting-key="player.playQuality")
      .p.small {{ $t('setting__play_playQuality') }}
      div
        base-checkbox.gap-left(
          v-for="item in playQualityList" :id="`setting_play_quality_${item}`" :key="item"
          name="setting_play_quality" need :model-value="appSetting['player.playQuality']" :value="item" :label="item"
          @update:model-value="updateSetting({'player.playQuality': $event})")
</template>

<script>
import { appSetting, updateSetting } from '@renderer/store/setting'
import { TRY_QUALITYS_LIST } from '@renderer/core/music/utils'

/** 播放 → 音质（`play_quality`）：从 SettingPlay.vue 搬来（档位列表同样是「可用档位 + 128k」倒序）。 */
export default {
  name: 'PlayQuality',
  setup() {
    const playQualityList = [...TRY_QUALITYS_LIST, '128k'].reverse()

    return {
      appSetting,
      updateSetting,
      playQualityList,
    }
  },
}
</script>
