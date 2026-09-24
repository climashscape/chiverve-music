<template lang="pug">
//- 快捷键节（元数据 §6）：软件内 / 全局两组。
//- 26 个按键框 + 2 个启用开关都是**非 key 控件**（配置存在 window.lx.appHotKeyConfig，不走 defaultSetting），
//- 所以本节没有 data-setting-key 可挂（票 01 的 Item.key 必填，这些控件不在元数据表里）
dt#hot_key {{ $t('setting__hot_key') }}
dd
  h3#hot_key_local(:class="$style.groupTitle")
    button(type="button" :class="$style.toggle" :aria-expanded="localExpanded ? 'true' : 'false'" @click="localExpanded = !localExpanded")
      svg-icon(name="angle-right-solid" :class="[$style.arrow, localExpanded ? $style.arrowOpen : null]")
      | {{ $t('setting__hot_key_local_title') }}
  div
    //- 总闸不在折叠范围内：收起时也要能看到/切到「启用」
    base-checkbox(id="setting_hotKeyLocal_enable" v-model="current_hot_key.local.enable" :label="$t('setting__is_enable')" @change="handleHotKeySaveConfig")
    //- 折叠用 v-show 不用 v-if：只收视觉，录入框留在 DOM 里（搜索高亮与调试都按「它在」算）
    HotKeyGrid(
      v-show="localExpanded" type="local" :items="allHotKeys.local" :config="hotKeyConfig.local"
      :status="hotKeyStatus" :enabled="current_hot_key.local.enable" :format-key="formatHotKeyName"
      @focus="handleHotKeyFocus" @blur="handleHotKeyBlur")
dd
  h3#hot_key_global(:class="$style.groupTitle")
    button(type="button" :class="$style.toggle" :aria-expanded="globalExpanded ? 'true' : 'false'" @click="globalExpanded = !globalExpanded")
      svg-icon(name="angle-right-solid" :class="[$style.arrow, globalExpanded ? $style.arrowOpen : null]")
      | {{ $t('setting__hot_key_global_title') }}
  div
    base-checkbox(id="setting_hotKeyGlobal_enable" v-model="current_hot_key.global.enable" :label="$t('setting__is_enable')" @change="handleEnableHotKey")
    HotKeyGrid(
      v-show="globalExpanded" type="global" :items="allHotKeys.global" :config="hotKeyConfig.global"
      :status="hotKeyStatus" :enabled="current_hot_key.global.enable" :format-key="formatHotKeyName"
      @focus="handleHotKeyFocus" @blur="handleHotKeyBlur")
</template>

<script>
import { ref, onBeforeUnmount, toRaw, shallowReactive } from '@common/utils/vueTools'
import { allHotKeys, hotKeySetEnable, hotKeySetConfig, hotKeyGetStatus } from '@renderer/utils/ipc'
import { isMac } from '@common/utils'
import { useI18n } from '@renderer/plugins/i18n'
import HotKeyGrid from './HotKeyGrid.vue'

// 键名 → 显示名（`mod+f5` → `Ctrl + F5`）：录入（写 input.value）与展示（HotKeyGrid 的 prop）两处共用
const formatHotKeyName = (name) => {
  if (name.includes('arrow')) {
    name = name.replace(/arrow(left|right|up|down)/, s => {
      switch (s) {
        case 'arrowleft': return '←'
        case 'arrowright': return '→'
        case 'arrowup': return '↑'
        case 'arrowdown': return '↓'
      }
    })
  }
  if (name.includes('mod')) name = name.replace('mod', isMac ? 'Command' : 'Ctrl')
  name = name.replace(/(\+|^)[a-z]/g, l => l.toUpperCase())
  if (name.length > 1) name = name.replace(/\+/g, ' + ')
  return name
}

export default {
  name: 'SettingSectionHotKey',
  components: {
    HotKeyGrid,
  },
  setup() {
    const t = useI18n()
    // 默认只展开「软件内」，全局折叠（spec §2 的快捷键行）
    const localExpanded = ref(true)
    const globalExpanded = ref(false)

    const current_hot_key = ref({
      local: {
        enable: false,
        keys: {},
      },
      global: {
        enable: false,
        keys: {},
      },
    })

    const hotKeyConfig = ref({
      local: {},
      global: {},
    })

    const hotKeyStatus = ref({})
    let isEditHotKey = false
    let hotKeyTargetInput
    let newHotKey
    let tip

    const initHotKeyConfig = () => {
      let config = {}
      for (const [type, typeInfo] of Object.entries(current_hot_key.value)) {
        let configInfo = config[type] = {}
        for (const [key, info] of Object.entries(typeInfo.keys)) {
          if (!info.name) continue
          configInfo[info.name] = shallowReactive({
            key,
            info,
          })
        }
      }
      hotKeyConfig.value = config
    }

    const handleHotKeyFocus = (event, info, type) => {
      setTimeout(async() => {
        await hotKeySetEnable(false)
        window.lx.isEditingHotKey = true
        isEditHotKey = true
        let config = hotKeyConfig.value[type][info.name]
        newHotKey = config?.key
        hotKeyTargetInput = event.target
        event.target.value = tip = t('setting__hot_key_tip_input')
      })
    }

    const handleHotKeyBlur = (event, info, type) => {
      setTimeout(async() => {
        await hotKeySetEnable(true)
        window.lx.isEditingHotKey = false
        isEditHotKey = false
        const prevInput = hotKeyTargetInput
        hotKeyTargetInput = null
        if (prevInput?.value == tip) {
          prevInput.value = newHotKey ? formatHotKeyName(newHotKey) : ''
          return
        }
        let config = hotKeyConfig.value[type][info.name]
        let originKey
        if (type == 'global' && newHotKey && current_hot_key.value.global.enable) {
          try {
            await hotKeySetConfig({
              action: 'register',
              data: {
                key: newHotKey,
                info,
              },
            })
          } catch (error) {
            console.log(error)
            return
          }
        }
        if (config) {
          if (config.key == newHotKey) return
          originKey = config.key
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete current_hot_key.value[type].keys[config.key]
        } else if (!newHotKey) return

        if (newHotKey) {
          for (const [tempType, tempInfo] of Object.entries(current_hot_key.value)) {
            if (tempType == type) continue
            config = tempInfo.keys[newHotKey]
            if (config) {
              console.log(newHotKey, info, config, info.name, config.name)
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete current_hot_key.value[tempType].keys[newHotKey]
              break
            }
          }
          current_hot_key.value[type].keys[newHotKey] = info
        }

        initHotKeyConfig()
        if (originKey && current_hot_key.value.global.enable) {
          try {
            await hotKeySetConfig({
              action: 'unregister',
              data: originKey,
            })
          } catch (error) {
            console.log(error)
          }
        }
        await handleHotKeySaveConfig()
        await getHotKeyStatus()
      })
    }

    const handleKeyDown = ({ event, keys, key, type }) => {
      if (!event || event.repeat || type == 'up' || !isEditHotKey) return
      event.preventDefault()
      switch (key) {
        case 'delete':
        case 'backspace':
          key = ''
          break
      }
      hotKeyTargetInput.value = formatHotKeyName(key)
      newHotKey = key
    }

    const handleHotKeySaveConfig = async() => {
      await hotKeySetConfig({
        action: 'config',
        data: toRaw(current_hot_key.value),
      })
    }
    const handleEnableHotKey = async() => {
      await hotKeySetConfig({
        action: 'enable',
        data: current_hot_key.value.global.enable,
      })
      await handleHotKeySaveConfig()
      await getHotKeyStatus()
    }
    const getHotKeyStatus = async() => {
      return hotKeyGetStatus().then(status => {
        hotKeyStatus.value = status
        return status
      })
    }

    current_hot_key.value = window.lx.appHotKeyConfig
    initHotKeyConfig()
    void getHotKeyStatus()

    window.app_event.on('keyDown', handleKeyDown)

    onBeforeUnmount(() => {
      window.app_event.off('keyDown', handleKeyDown)
    })

    return {
      allHotKeys,
      current_hot_key,
      hotKeyConfig,
      hotKeyStatus,
      localExpanded,
      globalExpanded,
      formatHotKeyName,
      handleHotKeyFocus,
      handleHotKeyBlur,
      handleEnableHotKey,
      handleHotKeySaveConfig,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
// 分组标题当折叠开关用：h3 保留（锚点 id 挂在它上面），可点的是里面的 button
.groupTitle {
  display: flex;
  align-items: center;
}
.toggle {
  display: flex;
  align-items: center;
  padding: 0;
  border: none;
  background: none;
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  cursor: pointer;
  transition: color @transition-fast;

  &:hover {
    color: var(--color-primary-font-hover);
  }
}
.arrow {
  width: .75em;
  height: .75em;
  margin-right: .35em;
  transition: transform @transition-fast;
}
.arrowOpen {
  transform: rotate(90deg);
}
</style>
