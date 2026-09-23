<template lang="pug">
//- 左栏两级 + 节内锚点目录（票 02）。一级分组是**不可点**的分组标题，其下挂节名；当前节自动展开
//- 它的分组目录。两张表都由元数据驱动（见 settingNav.ts / useSettingToc.ts），这里不写死任何节或分组。
ul(:class="$style.nav")
  li(v-for="group in navTree" :key="group.id" :class="$style.navGroup")
    div(:class="$style.navGroupTitle") {{ t(group.i18nKey) }}
    ul(:class="$style.sectionList")
      li(v-for="section in group.sections" :key="section.id")
        button(
          type="button" :class="[$style.navItem, { [$style.active]: section.id == activeSectionId }]"
          :aria-current="section.id == activeSectionId ? 'true' : null"
          @click="emit('select-section', section.id)")
          svg-icon(v-if="section.id == activeSectionId" name="angle-right-solid" :class="$style.activeIcon")
          | {{ t(section.i18nKey) }}
        //- 节内锚点目录：只列内容区真实有锚点的分组（没就位的分组列出来也点不动，见 useSettingToc.ts）
        ul(v-if="section.id == activeSectionId && groups.length" :class="$style.groupList")
          li(v-for="item in groups" :key="item.id")
            button(
              type="button" :class="[$style.groupItem, { [$style.activeGroup]: item.id == activeGroupId }]"
              :aria-current="item.id == activeGroupId ? 'true' : null"
              @click="emit('select-group', item.id)") {{ t(item.i18nKey) }}
</template>

<script>
import { useI18n } from '@renderer/plugins/i18n'

export default {
  name: 'SettingNav',
  props: {
    // 一级分组 × 节（顺序、文案 key 全来自 @common/settingMetadata）
    navTree: {
      type: Array,
      default: () => [],
    },
    activeSectionId: {
      type: String,
      default: '',
    },
    // 当前节的分组锚点目录（[{ id, i18nKey }]，元数据顺序）
    groups: {
      type: Array,
      default: () => [],
    },
    activeGroupId: {
      type: String,
      default: null,
    },
  },
  emits: ['select-section', 'select-group'],
  setup(props, { emit }) {
    const t = useI18n()

    return {
      t,
      emit,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.nav {
  margin: 0;
  padding: 6px 0 10px;
  list-style: none;
}
.navGroup {
  list-style: none;
}
.navGroupTitle {
  .mixin-ellipsis-1();
  padding: 10px 10px 4px;
  font-size: 11px;
  color: var(--color-font-label);
}
.sectionList, .groupList {
  margin: 0;
  padding: 0;
  list-style: none;
}
.navItem {
  .mixin-ellipsis-1();
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-font);
  cursor: pointer;
  transition: @transition-fast;
  transition-property: background-color, color;

  &:hover {
    background-color: var(--color-button-background-hover);
  }
  &.active {
    color: var(--color-primary);
  }
}
.activeIcon {
  height: .9em;
  width: .9em;
  margin-left: -0.45em;
  vertical-align: -0.05em;
}
.groupList {
  padding-bottom: 6px;
}
.groupItem {
  .mixin-ellipsis-1();
  display: block;
  width: 100%;
  // 左边距比节名大：视觉上属于上面那个节
  padding: 5px 10px 5px 22px;
  border: none;
  background: none;
  text-align: left;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-font-label);
  cursor: pointer;
  transition: @transition-fast;
  transition-property: background-color, color;

  &:hover {
    background-color: var(--color-button-background-hover);
  }
  &.activeGroup {
    color: var(--color-primary);
  }
}
</style>
