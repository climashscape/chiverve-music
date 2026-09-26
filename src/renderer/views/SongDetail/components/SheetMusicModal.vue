<template>
  <material-modal :show="show" :max-width="'78%'" :max-height="'88%'" teleport="#view" @close="$emit('close')">
    <div :class="$style.container">
      <h2 :class="$style.title" :title="sheet.name">{{ sheet.name }}</h2>
      <!-- 副标题里已经有「乐器 · 谱型 · 共 N 页」，所以图片只按页序编号，不重复说明 -->
      <p :class="$style.meta">
        <span v-if="sheet.subName" :class="$style.subName" :title="sheet.subName">{{ sheet.subName }}</span>
        <span>{{ meta }}</span>
      </p>
      <div :class="[$style.pages, 'scroll']">
        <img
          v-for="(pic, index) in sheet.images"
          :key="index"
          :class="$style.page"
          :src="pic"
          :alt="$t('pagination__page', { num: Number(index) + 1 })"
          loading="lazy"
          decoding="async"
        >
      </div>
    </div>
  </material-modal>
</template>

<script setup lang="ts">
import { computed } from '@common/utils/vueTools'
import { sheetMeta, type SheetMusicItem } from '../useSongDetail'

/**
 * 曲谱弹窗（2026-09-26 新增）：把一条曲谱的**乐谱图片**整列铺开，纵向滚动翻页。
 *
 * 为什么是「图片列」而不是翻页器：QQ 给的就是 `picURLs[]`（每页一张 jpg，实测 1–11 张，
 * 直链带不带 Referer 都能抓），一张接一张看正是乐谱的自然读法；做翻页器要另造页码状态、
 * 键盘/按钮两组入口，收益不成比例。
 *
 * `material-modal` 自带关闭键与背景压暗（§2.5.1 第 2 条），这里不自造 teleport/遮罩。
 *
 * ⚠️ `sheet` 的类型**不能写 `SheetMusicItem | null`**（票 04）：vue-loader 会把可空对象编成
 * `{ type: [Object, null], required: true }`，而本仓的 Vue 3.3 类型面里 `null` 不是合法的
 * `PropConstructor` → ts-loader 报 TS2769，dev 编译每次带错（全屏错误浮层 + HMR 被拒），
 * `npm run build` 也非 0 退出。改成非空 + 父组件 `v-if="sheetModal.sheet"` 兜（本仓的
 * `defineProps<{...}>()` 纯类型写法是其惯例，`PropType` 全仓无先例，别为此新造一种写法）。
 */
const props = defineProps<{
  show: boolean
  /** 当前选中的曲谱；父组件只在有值时渲染本组件（所以这里不需要 `| null`） */
  sheet: SheetMusicItem
}>()
defineEmits(['close'])

const meta = computed(() => sheetMeta(props.sheet))
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  padding: 14px 18px 18px;
  display: flex;
  flex-flow: column nowrap;
}

.title {
  flex: none;
  font-size: 16px;
  font-weight: 600;
  .mixin-ellipsis-2();
}

.meta {
  flex: none;
  display: flex;
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-font-label);
}

.subName {
  margin-right: 8px;
  .mixin-ellipsis-1();
}

// 乐谱图片列的高度**写死上限**（不能用 100%/flex 撑）：弹窗高度由 material-modal 的 max-height
// 管（88% 视口），Less 里算不出它，靠 flex 撑会出现「图片溢出弹窗」而标题被挤没——68vh 让标题与
// 副标题始终可见，图片在列内滚动。
.pages {
  margin-top: 12px;
  // 68vh 见上：固定上限，图片在列内滚动
  max-height: 68vh;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  // 页与页之间留一点缝，免得两页在视觉上拼成一张（乐谱页首尾都是谱面）
  gap: 10px;
}

.page {
  width: 100%;
  height: auto;
  border-radius: @radius-border;
  background-color: var(--color-button-background);
}
</style>
