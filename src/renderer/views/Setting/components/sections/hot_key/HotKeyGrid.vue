<template lang="pug">
//- 一组快捷键录入框（票 03 从 SettingHotKey.vue 拆出）：local / global 两组只差三处——
//- 传进来的 items / config / status，以及注册失败时的删除线（只有全局组有 hotKeyStatus）
div(:class="$style.hotKeyContainer" :style="{ opacity: enabled ? 1 : .6 }")
  div(v-for="(item, index) in items" :key="index" :class="$style.hotKeyItem")
    h4(:class="$style.hotKeyItemTitle") {{ $t('setting__hot_key_' + item.name) }}
    //- 录入靠 focus/blur + 直接写 input.value（键名由父组件的 keyDown 监听落到 hotKeyTargetInput），
    //- 所以这里只把事件透出去，不自己改值
    base-input(
      :class="[$style.hotKeyItemInput, isFailed(item) ? $style.hotKeyFailed : null]"
      readonly :auto-paste="false" :placeholder="$t('setting__hot_key_unset_input')"
      :value="config[item.name] && formatKey(config[item.name].key)"
      @keyup.prevent @input.prevent
      @focus="$emit('focus', $event, item)" @blur="$emit('blur', $event, item)")
</template>

<script>
import { useI18n } from '@renderer/plugins/i18n'

export default {
  name: 'HotKeyGrid',
  props: {
    // 'local' | 'global'：只有全局组在注册失败时打删除线
    type: {
      type: String,
      required: true,
    },
    // allHotKeys[type]（[{ name, action, type }]）
    items: {
      type: Array,
      default: () => [],
    },
    // hotKeyConfig[type]（{ [name]: { key, info } }）
    config: {
      type: Object,
      default: () => ({}),
    },
    // hotKeyGetStatus() 的结果：{ [key]: { status } }
    status: {
      type: Object,
      default: () => ({}),
    },
    // 该组总闸（关掉时整块半透明，仍可编辑——与旧实现一致）
    enabled: {
      type: Boolean,
      default: false,
    },
    // 键名 → 显示名（`mod+f5` → `Ctrl + F5`）：录入时父组件也要用，所以传进来而不是各写一份
    formatKey: {
      type: Function,
      required: true,
    },
  },
  emits: ['focus', 'blur'],
  setup(props) {
    const t = useI18n()

    const isFailed = (item) => {
      const key = props.config[item.name]?.key
      return props.type == 'global' && key && props.status[key] && props.status[key].status === false
    }

    return {
      t,
      isFailed,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.hotKeyContainer {
  display: flex;
  flex-flow: row wrap;
  // margin-top: -15px;
  margin-bottom: 15px;
  transition: opacity @transition-normal;
}
.hotKeyItem {
  width: 30%;
  padding-right: 35px;
  margin-top: 15px;
  box-sizing: border-box;
}
.hotKeyItemTitle {
  .mixin-ellipsis-1();
  padding-bottom: 5px;
  color: var(--color-font-label);
  font-size: 12px;
}
.hotKeyItemInput {
  width: 100%;
  box-sizing: border-box;
  // font-family: monospace;
  &:focus {
    background-color: var(--color-primary-background-active);
    text-decoration: none;
  }
  &::placeholder {
    color: var(--color-200) !important;
  }
}
.hotKeyFailed {
  text-decoration: line-through;
}
</style>
