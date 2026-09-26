<template lang="pug">
div
  //- 面板入口是非 key 项（元数据 `advanced_sound_effect_open_panel`），挂 data-setting-id 供搜索高亮
  .p
    base-btn.btn(min data-setting-id="advanced_sound_effect_open_panel" @click="isShowPanel = true") {{ $t('setting__advanced_sound_effect_open_btn') }}

  //- 常用开关：元数据里 control 不是 `panel` 的三项（环境混响预设 / 3D 环绕总闸 / 升降调），
  //- 不必打开面板就能改；其余 14 项在面板里，见下面的入口行。
  div(:class="$style.itemRow")
    span(:class="$style.label") {{ $t('player__sound_effect_convolution') }}
    base-selection(
      data-setting-key="player.soundEffect.convolution.fileName"
      :class="$style.select" :model-value="appSetting['player.soundEffect.convolution.fileName']"
      :list="convolutionList" item-key="source" item-name="label" @change="handleUpdateConvolution"
    )
  div(:class="$style.itemRow")
    span(:class="$style.label") {{ $t('player__sound_effect_panner') }}
    base-checkbox(
      data-setting-key="player.soundEffect.panner.enable"
      :model-value="appSetting['player.soundEffect.panner.enable']" :label="$t('player__sound_effect_panner_enabled')"
      @update:model-value="handleUpdatePannerEnabled"
    )
  div(:class="$style.itemRow")
    span(:class="$style.label") {{ $t('player__sound_effect_pitch_shifter') }}
    base-slider-bar(
      data-setting-key="player.soundEffect.pitchShifter.playbackRate"
      :class="$style.slider" :value="appSetting['player.soundEffect.pitchShifter.playbackRate'] * 100" :min="50" :max="150"
      @change="handleUpdatePlaybackRate"
    )
    span(:class="$style.value") {{ playbackRateText }}

  .p.small {{ $t('setting__advanced_sound_effect_panel_items') }}
  .p(:class="$style.chips")
    base-btn(
      v-for="chip in panelItems" :key="chip.key" min
      :data-setting-key="chip.key" @click="isShowPanel = true"
    ) {{ chip.label }}

  .p.small(:class="$style.tip") {{ $t('player__sound_effect_features_tip') }}

//- 视图内弹窗照 §2.5.1 第 2 条显式 `teleport="#view"`：默认的 `#root` 会把整窗压暗
material-modal(:show="isShowPanel" bg-close teleport="#view" @close="isShowPanel = false")
  div(:class="$style.panel")
    div(:class="['scroll', $style.panelRow]")
      AudioConvolution
      PitchShifter
      AudioPanner
    div(:class="['scroll', $style.panelRow]")
      BiquadFilter
  p(v-if="showTip" :class="$style.tip") {{ $t('player__sound_effect_features_tip') }}
</template>

<script>
import { ref, computed, watch } from '@common/utils/vueTools'
import { convolutions, setMediaDeviceId } from '@renderer/plugins/player'
import { appSetting, saveMediaDeviceId, updateSetting } from '@renderer/store/setting'
import { useI18n } from '@renderer/plugins/i18n'

import AudioConvolution from '@renderer/components/common/SoundEffectBtn/AudioConvolution.vue'
import PitchShifter from '@renderer/components/common/SoundEffectBtn/PitchShifter.vue'
import AudioPanner from '@renderer/components/common/SoundEffectBtn/AudioPanner.vue'
import BiquadFilter from '@renderer/components/common/SoundEffectBtn/BiquadFilter.vue'

/**
 * 「高级 → 音效与均衡器」：17 个 `player.soundEffect.*` key 的设置页入口（归类表 §10.3、spec §5）。
 *
 * 入口形态（**浮层代码一行未改**）：
 * - 「打开音效面板」按钮开一个 `material-modal`，**原样复用播放详情页那四个面板组件**
 *   （`AudioConvolution` / `PitchShifter` / `AudioPanner` / `BiquadFilter`）——同一个面板、同一份状态，
 *   不复制任何取数或写入逻辑（那四个组件内部各自处理「切音效会把音频输出设备重置为默认」）。面板
 *   布局样式照 `SoundEffectBtn/index.vue` 复刻（含 `.player__sound_effect_title` 那条全局字号规则，
 *   否则那四个组件的标题会掉样式）。
 * - 元数据里 control 不是 `panel` 的三项做成真的控件：环境混响预设（selection，选中预设会顺带写入
 *   两个增益，与面板行为一致）、3D 环绕总闸（checkbox）、升降调（slider）。
 * - 其余 14 项（两个增益 + 10 段均衡 + 环绕距离/速度）在设置页给**逐 key 的入口**：每个 key 一个小
 *   按钮（`data-setting-key` 绑在按钮上，票 02 的搜索高亮能精确到项），点一下打开同一个面板去调。
 *   这么做的原因：那 10 个均衡 key 不能并成一项（9 个预设与「重置」都是一次写满 10 个 key），
 *   而设置页不该重做一遍均衡器。
 */
export default {
  name: 'SettingAdvancedSoundEffect',
  components: {
    AudioConvolution,
    PitchShifter,
    AudioPanner,
    BiquadFilter,
  },
  setup() {
    const t = useI18n()

    const isShowPanel = ref(false)
    const showTip = ref(false)
    watch(isShowPanel, (visible) => {
      if (visible) showTip.value = appSetting['player.mediaDeviceId'] != 'default'
    })

    // 空串 = 不启用环境混响（面板里就是「取消勾选」的语义），所以列表头一项是「不使用」
    const convolutionList = computed(() => [
      { source: '', label: t('setting__advanced_sound_effect_convolution_none') },
      ...convolutions.map(item => ({
        source: item.source,
        label: t(`player__sound_effect_convolution_file_${item.name}`),
      })),
    ])

    /** 切音效必须把音频输出设备重置为默认（面板四个组件里也是这么做的，见 AGENTS 的已知问题）。 */
    const resetMediaDevice = async() => {
      if (appSetting['player.mediaDeviceId'] == 'default') return
      await setMediaDeviceId('default').catch(_ => _)
      saveMediaDeviceId('default')
    }

    const handleUpdateConvolution = async(item) => {
      if (!item) return
      const source = item.source
      await resetMediaDevice()
      const setting = {
        'player.soundEffect.convolution.fileName': source,
      }
      const target = convolutions.find(c => c.source == source)
      if (target) {
        setting['player.soundEffect.convolution.mainGain'] = target.mainGain * 10
        setting['player.soundEffect.convolution.sendGain'] = target.sendGain * 10
      }
      updateSetting(setting)
    }

    const handleUpdatePannerEnabled = async(enabled) => {
      await resetMediaDevice()
      updateSetting({ 'player.soundEffect.panner.enable': enabled })
    }

    const handleUpdatePlaybackRate = async(value) => {
      await resetMediaDevice()
      updateSetting({ 'player.soundEffect.pitchShifter.playbackRate': parseFloat((Math.round(value) / 100).toFixed(2)) })
    }

    const playbackRateText = computed(() => `${appSetting['player.soundEffect.pitchShifter.playbackRate'].toFixed(2)}x`)

    const panelItems = computed(() => [
      { key: 'player.soundEffect.convolution.mainGain', label: t('player__sound_effect_convolution_main_gain') },
      { key: 'player.soundEffect.convolution.sendGain', label: t('player__sound_effect_convolution_send_gain') },
      { key: 'player.soundEffect.biquadFilter.hz31', label: t('setting__eq_hz31') },
      { key: 'player.soundEffect.biquadFilter.hz62', label: t('setting__eq_hz62') },
      { key: 'player.soundEffect.biquadFilter.hz125', label: t('setting__eq_hz125') },
      { key: 'player.soundEffect.biquadFilter.hz250', label: t('setting__eq_hz250') },
      { key: 'player.soundEffect.biquadFilter.hz500', label: t('setting__eq_hz500') },
      { key: 'player.soundEffect.biquadFilter.hz1000', label: t('setting__eq_hz1000') },
      { key: 'player.soundEffect.biquadFilter.hz2000', label: t('setting__eq_hz2000') },
      { key: 'player.soundEffect.biquadFilter.hz4000', label: t('setting__eq_hz4000') },
      { key: 'player.soundEffect.biquadFilter.hz8000', label: t('setting__eq_hz8000') },
      { key: 'player.soundEffect.biquadFilter.hz16000', label: t('setting__eq_hz16000') },
      { key: 'player.soundEffect.panner.soundR', label: t('player__sound_effect_panner_sound_r') },
      { key: 'player.soundEffect.panner.speed', label: t('player__sound_effect_panner_sound_speed') },
    ])

    return {
      appSetting,
      isShowPanel,
      showTip,
      convolutionList,
      playbackRateText,
      panelItems,
      handleUpdateConvolution,
      handleUpdatePannerEnabled,
      handleUpdatePlaybackRate,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

// 面板内的布局与 SoundEffectBtn/index.vue 保持一致（两行：卷积/升降调/声像 + 均衡器）
.panel {
  display: flex;
  flex-flow: row nowrap;
  padding: 0 5px;
  margin: 15px 0;
  gap: 10px;
  position: relative;
  min-height: 0;

  &:before {
    .mixin-after();
    position: absolute;
    left: 50%;
    height: 100%;
    border-left: 1px dashed var(--color-primary-light-100-alpha-700);
  }

  :global {
    .player__sound_effect_title {
      font-size: 14px;
      padding-bottom: 8px;
    }
  }
}

.panelRow {
  width: 50%;
  display: flex;
  gap: 15px;
  flex-flow: column nowrap;
  padding: 0 10px;
}

// 设置页这侧的三行（常在开关 / 面板入口）
.itemRow {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.tip {
  padding: 0 15px 15px;
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.25;
  color: var(--color-font);
}

.label {
  flex: none;
  margin-right: 10px;
  font-size: 13px;
}

.select {
  min-width: 180px;
}

.slider {
  flex: auto;
  max-width: 200px;
}

.value {
  flex: none;
  width: 45px;
  font-size: 12px;
  text-align: center;
}

.chips {
  display: flex;
  flex-flow: row wrap;
  gap: 8px;
}
</style>
