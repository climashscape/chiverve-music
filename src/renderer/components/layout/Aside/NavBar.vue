<template>
  <div ref="dom_menu" :class="$style.menu">
    <!--
      左栏三分组（工单 11）：在线（雷达 / 发现 / 乐馆）→ 我的（我的音乐 / 我的收藏 / 我的歌单 /
      我的下载）→ 设置（贴底）。**组标题小字已去掉**（ui-polish 工单 01：用户 2026-09-23
      要求「不要小字」，分组只靠组间留白表达），设置组 margin-top:auto 贴底。

      「搜索」不再占左栏位：工具栏的搜索框（`components/layout/Toolbar/SearchInput.vue`）
      在**任何窗口宽度下都渲染**，左栏这个入口本来就是重复的（工单 11 的验收项）。
    -->
    <ul
      v-for="(group, index) in menuGroups" :key="`group__${index}`"
      :class="[$style.list, { [$style.bottom]: group.bottom }]" role="toolbar"
    >
      <li v-for="item in group.items" :key="item.to" :class="$style.navItem" role="presentation">
        <!-- aria-label 与 title 同值但都不能省：链接内容只有一个 svg 图标（无可见文本），
             删 aria-label 会让 role=tab 的链接失去可访问名；title 是唯一的悬停提示来源
             （应用级气泡插件已删，规矩见 §2.5.1）。 -->
        <router-link
          :class="[$style.link, {[$style.active]: $route.meta.name == item.name}]" role="tab"
          :aria-selected="$route.meta.name == item.name" :to="item.to"
          :aria-label="item.tips" :title="item.tips"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" :viewBox="item.iconSize" :height="item.size" :width="item.size" space="preserve">
            <use :xlink:href="item.icon" />
          </svg>
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@root/lang'
import { ref, computed } from '@common/utils/vueTools'
import { useIconSize } from '@renderer/utils/compositions/useIconSize'

export default {
  name: 'NavBar',
  setup() {
    const t = useI18n()
    const dom_menu = ref<HTMLElement>()
    const iconSize = useIconSize(dom_menu, 0.32)

    const menuGroups = computed(() => {
      const size = iconSize.value
      return [
        {
          items: [
            {
              to: '/radar',
              tips: t('radar'),
              icon: '#icon-radar',
              iconSize: '0 0 448 448',
              size,
              name: 'Radar',
              enable: true,
            },
            {
              to: '/discover',
              tips: t('discover'),
              icon: '#icon-discover',
              iconSize: '0 0 448 448',
              size,
              name: 'Discover',
              enable: true,
            },
            {
              to: '/musicHall',
              tips: t('music_hall'),
              icon: '#icon-leaderboard',
              iconSize: '0 0 425.22 425.2',
              size,
              name: 'MusicHall',
              enable: true,
            },
          ],
        },
        {
          items: [
            {
              to: '/user',
              tips: t('user_center'),
              icon: '#icon-user',
              iconSize: '0 0 448 456',
              size,
              name: 'UserCenter',
              enable: true,
            },
            {
              to: '/favorites',
              tips: t('favorites'),
              icon: '#icon-love',
              iconSize: '0 0 444.87 391.18',
              size,
              name: 'Favorites',
              enable: true,
            },
            {
              to: '/playlists',
              tips: t('playlists'),
              icon: '#icon-album',
              iconSize: '0 0 425.2 425.2',
              size,
              name: 'Playlists',
              enable: true,
            },
            {
              to: '/download',
              tips: t('download'),
              icon: '#icon-download-2',
              iconSize: '0 0 425.2 425.2',
              size,
              enable: appSetting['download.enable'],
              name: 'Download',
            },
          ],
        },
        {
          bottom: true,
          items: [
            {
              to: '/setting',
              tips: t('setting'),
              icon: '#icon-setting',
              iconSize: '0 0 493.23 436.47',
              size,
              enable: true,
              name: 'Setting',
            },
          ],
        },
      ].map(group => ({ ...group, items: group.items.filter(m => m.enable) }))
        .filter(group => group.items.length > 0)
    })
    return {
      appSetting,
      menuGroups,
      dom_menu,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.menu {
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
}
.list {
  -webkit-app-region: no-drag;

  &:last-child {
    margin-bottom: 0;
  }
  // 组间留白
  & + & {
    margin-top: 10px;
  }
  // 「设置」组贴底（容器是 flex 列，吃掉剩余空间即可）
  &.bottom {
    margin-top: auto;
  }
}
.navItem {
  position: relative;
  &:before {
    content: '';
    display: block;
    width: 100%;
    padding-bottom: 84%;
  }
}
.link {
  position: absolute;
  left: 0%;
  top: 0%;
  width: 100%;
  height: 100%;
  box-sizing: border-box;

  transition: @transition-fast;
  transition-property: background-color, opacity;
  color: var(--color-nav-font);
  cursor: pointer;
  text-align: center;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;

  .mixin-ellipsis-1();
  &:before {
    .mixin-after();
    left: 0;
    top: 0;
    width: 3px;
    height: 100%;
    background-color: var(--color-primary-dark-200-alpha-700);
    border-radius: 4px;
    transform: translateX(-100%);
    transition: transform @transition-fast;
  }

  &.active {
    background-color: var(--color-primary-light-300-alpha-700);

    &:before {
      transform: translateX(0);
    }

    &:hover {
      background-color: var(--color-primary-light-300-alpha-800);
    }
  }


  &:hover {
    color: var(--color-nav-font);

    &:not(.active) {
      opacity: .8;
      background-color: var(--color-primary-light-400-alpha-700);
    }
  }
  &:active:not(.active) {
    opacity: .6;
    background-color: var(--color-primary-light-300-alpha-600);
  }
}

</style>
