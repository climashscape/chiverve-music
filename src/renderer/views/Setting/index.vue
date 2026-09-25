<template>
  <div :class="$style.main">
    <div :class="$style.toc">
      <SettingSearchBox
        v-model:keyword="searchKeyword"
        :hits="searchHits"
        @select="handleSearchSelect"
      />
      <div class="scroll" :class="$style.navScroll">
        <SettingNav
          :nav-tree="navTree"
          :active-section-id="activeSectionId"
          :groups="tocGroups"
          :active-group-id="activeGroupId"
          @select-section="handleSelectSection"
          @select-group="handleSelectGroup"
        />
      </div>
    </div>
    <div ref="dom_content_ref" class="scroll" :class="$style.setting">
      <dl>
        <component :is="name" v-for="name in contentComponents" :key="name" />
      </dl>
    </div>
    <!-- `?` 帮助弹窗只挂这一份（60+ 个入口共用它，多挂几份就会「点开第二个不关第一个」）；
         挂在页根部而不是每个节里：节是切换渲染的，弹窗跟着节走会在切节时被卸掉。
         ⚠️ 本文件是 **HTML 模板**（这个目录里其余 50 个 .vue 是 Pug，别照抄那边的写法）：
         写成 Pug 的 `//-` 注释与裸标签会**当明文渲染出来**，组件也不会挂上（2026-09-24 用户报
         「设置页面右边出 bug」即此）。 -->
    <common-setting-help-modal />
  </div>
</template>

<script>
import { ref, computed, nextTick, watch, useCssModule } from '@common/utils/vueTools'
import { SETTING_SECTIONS } from '@common/settingMetadata'
import { useI18n } from '@renderer/plugins/i18n'
import { useRoute, useRouter } from '@common/utils/vueRouter'

import { DEFAULT_SECTION_ID, SECTION_CONTENT, SETTING_NAV_TREE, resolveSectionName } from './settingNav'
import { buildSearchIndex, matchSettingHits } from './useSettingSearch'
import { useSettingToc } from './useSettingToc'
import SettingNav from './components/SettingNav.vue'
import SettingSearchBox from './components/SettingSearchBox.vue'

// 各节内容：票 03 归位后「一节 = 一个组件」（`components/sections/<节 id>/index.vue`），
// 名字与 `settingNav.ts` 的 `SECTION_CONTENT` 一一对应（表里存名字、这里注册，改一边会被单测抓住）。
import SettingSectionAppearance from './components/sections/appearance/index.vue'
import SettingSectionPlay from './components/sections/play/index.vue'
import SettingSectionDesktopLyric from './components/sections/desktop_lyric/index.vue'
import SettingSectionDownload from './components/sections/download/index.vue'
import SettingSectionMyMusic from './components/sections/my_music/index.vue'
import SettingSectionHotKey from './components/sections/hot_key/index.vue'
import SettingSectionData from './components/sections/data/index.vue'
import SettingSectionNetwork from './components/sections/network/index.vue'
import SettingSectionAbout from './components/sections/about/index.vue'
import SettingSectionAdvanced from './components/sections/advanced/index.vue'

export default {
  name: 'Setting',
  components: {
    SettingNav,
    SettingSearchBox,
    SettingSectionAppearance,
    SettingSectionPlay,
    SettingSectionDesktopLyric,
    SettingSectionDownload,
    SettingSectionMyMusic,
    SettingSectionHotKey,
    SettingSectionData,
    SettingSectionNetwork,
    SettingSectionAbout,
    SettingSectionAdvanced,
  },
  setup() {
    const t = useI18n()
    const route = useRoute()
    const router = useRouter()
    // 命中闪烁的 class 来自本组件的 style module（.flashTarget 的动画定义在下面）
    const styles = useCssModule()

    const dom_content_ref = ref(null)
    // 左栏两级 × 当前节的分组锚点：结构都在元数据表里（settingNav.ts / useSettingToc.ts），本页只管拼
    const navTree = SETTING_NAV_TREE

    const initialName = resolveSectionName(route.query.name)
    const activeSectionId = ref(initialName ? initialName.sectionId : DEFAULT_SECTION_ID)

    /**
     * 地址就是节：`?name=<节 id>`。
     * 旧深链（`?name=SettingDownload` 这种旧组件名）认出来就**改写成新节 id**（保留其它 query）——
     * 老书签照常落地，新地址也能继续分享。映射表见 `settingNav.ts`。
     */
    const syncSectionToRoute = (sectionId) => {
      if (route.query.name === sectionId) return
      void router.replace({ path: route.path, query: { ...route.query, name: sectionId } })
    }
    if (initialName && initialName.legacy) syncSectionToRoute(initialName.sectionId)

    const activeSection = computed(() => SETTING_SECTIONS.find(section => section.id === activeSectionId.value))
    const contentComponents = computed(() => SECTION_CONTENT[activeSectionId.value] ?? [])

    const { tocGroups, activeGroupId, scrollToGroup, scrollContentTop, flashItem, flashGroup } = useSettingToc(
      activeSection,
      dom_content_ref,
      { flashClass: styles.flashTarget },
    )

    // 搜索：索引随语言重建（文案参与匹配，key 也参与——见 useSettingSearch.ts 的匹配口径）
    const searchKeyword = ref('')
    const searchIndex = computed(() => buildSearchIndex(t))
    const searchHits = computed(() => matchSettingHits(searchKeyword.value, searchIndex.value))

    const selectSection = (id, { scrollTop = true } = {}) => {
      syncSectionToRoute(id)
      if (activeSectionId.value !== id) {
        activeSectionId.value = id
        // 内容区换了一整棵子树：锚点要等渲染完，滚动也放到下一帧（搜索跳转自己接管滚动，见下）
        if (scrollTop) void nextTick(() => { scrollContentTop() })
        return
      }
      if (scrollTop) scrollContentTop()
    }

    const handleSelectSection = (id) => {
      selectSection(id)
    }

    const handleSelectGroup = async(id) => {
      // 目录只列真锚点，理论上不会失败；真失败（内容区被改过）就当什么都没发生
      await scrollToGroup(id)
    }

    /**
     * 搜索命中 → 切节 → 滚到分组锚点 → 高亮命中项。
     * 分组锚点还没就位（该组内容未归位，票 03/05-09 之后才有）就退到节顶，不做半截滚动。
     * 高亮优先精确到控件：key 项带 `data-setting-key`、非 key 控件带 `data-setting-id`
     * （票 03/05 的契约，见 useSettingToc.ts），没有就闪分组锚点——至少指出它在哪一组，
     * 别让用户自己找。
     */
    const handleSearchSelect = async(hit) => {
      selectSection(hit.sectionId, { scrollTop: false })
      await nextTick()
      const scrolled = hit.groupId ? await scrollToGroup(hit.groupId) : false
      if (!scrolled) {
        scrollContentTop()
        return
      }
      if (hit.itemId && await flashItem(hit.itemId)) return
      if (hit.groupId) await flashGroup(hit.groupId)
    }

    // 地址里的 ?name= 变了就跟着切节：页内改 query（深链 / 自动化）不会切节 —— 2026-09-23 排查歌词对齐
    // 问题时踩到；这里连同旧名归一一起处理（同一个节的旧写法也要把地址改干净）
    watch(() => route.query.name, (name) => {
      const resolved = resolveSectionName(name)
      if (!resolved) return
      if (resolved.legacy) syncSectionToRoute(resolved.sectionId)
      if (resolved.sectionId === activeSectionId.value) return
      activeSectionId.value = resolved.sectionId
      void nextTick(() => { scrollContentTop() })
    })

    return {
      navTree,
      activeSectionId,
      activeGroupId,
      tocGroups,
      contentComponents,
      dom_content_ref,
      searchKeyword,
      searchHits,
      handleSelectSection,
      handleSelectGroup,
      handleSearchSelect,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  display: flex;
  flex-flow: row nowrap;
  height: 100%;
  border-top: var(--color-list-header-border-bottom);
}

.toc {
  display: flex;
  flex-flow: column nowrap;
  flex: 0 0 16%;
  box-sizing: border-box;
}
// 搜索框固定在左栏顶部，导航树自己滚
.navScroll {
  flex: auto;
  overflow-y: auto;
}

.setting {
  padding: 0 15px 15px;
  font-size: 14px;
  box-sizing: border-box;
  overflow-y: auto;
  height: 100%;
  position: relative;
  width: 100%;

  :global {
    dt {
      border-left: 5px solid var(--color-primary-alpha-700);
      padding: 3px 7px;
      margin: 15px 0;

      + dd h3 {
        margin-top: 0;
      }
    }

    dd {
      // margin-left: 15px;
      // font-size: 13px;
      > div {
        padding: 0 15px;
      }

    }
    h3 {
      font-size: 12px;
      margin: 25px 0 15px;
    }
    .p {
      padding: 3px 0;
      line-height: 1.3;
      .btn {
        + .btn {
          margin-left: 10px;
        }
      }
    }

    .help-btn {
      padding: 0;
      margin: 0 0.4em;
      border: none;
      background: none;
      color: var(--color-button-font);
      cursor: pointer;
      transition: opacity 0.2s ease;
      &:hover {
        opacity: 0.7;
      }
    }
    .help-icon {
      margin: 0 0.4em;
    }
  }
}

// 搜索命中项 / 分组锚点的闪烁：class 由 useSettingToc 加到内容区的元素上（它只管加 class，
// 动画在这里定义——那个 class 名是经 `flashClass` 传过去的，两边改名要一起改）。
// 用 --color-* 既有 token，浅色/深色都可读。
.flashTarget {
  animation: settingFlash 1.5s ease;
}

@keyframes settingFlash {
  from {
    background-color: var(--color-primary-alpha-600);
  }
  to {
    background-color: transparent;
  }
}

// .btn-content {
//   display: inline-block;
//   transition: @transition-theme;
//   transition-property: opacity, transform;
//   opacity: 1;
//   transform: scale(1);

//   &.hide {
//     opacity: 0;
//     transform: scale(0);
//   }
// }

</style>
