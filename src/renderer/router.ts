/* eslint-disable @typescript-eslint/no-var-requires */
// import Vue from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { LIST_IDS } from '@common/constants'


const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/discover',
      name: 'Discover',
      component: require('./views/Discover/index.vue').default,
      meta: {
        name: 'Discover',
      },
    },
    {
      path: '/radar',
      name: 'Radar',
      component: require('./views/Radar/index.vue').default,
      meta: {
        name: 'Radar',
      },
    },
    {
      path: '/search',
      name: 'Search',
      component: require('./views/Search/index.vue').default,
      meta: {
        name: 'Search',
      },
    },
    {
      path: '/user',
      name: 'UserCenter',
      component: require('./views/userCenter/index.vue').default,
      meta: {
        name: 'UserCenter',
      },
    },
    // 粉丝与好友（只读的关系列表）：入口在「我的音乐」页的账号卡上，
    // `meta.name` 故意取 'UserCenter'——它不在左侧一级导航里，高亮该落在入口那一项上
    {
      path: '/friends',
      name: 'Friends',
      component: require('./views/friends/index.vue').default,
      meta: {
        name: 'UserCenter',
      },
    },
    {
      path: '/musicHall',
      name: 'MusicHall',
      component: require('./views/musicHall/index.vue').default,
      meta: {
        name: 'MusicHall',
      },
    },
    // 旧地址保留为**重定向**（工单 04）：外部书签、播放栏入口与「返回来源页」都还在用它们，
    // 不能留死链。redirect 是函数形式，好把原 query（boardId / tagId / sortId / page）一并带过去。
    {
      path: '/leaderboard',
      redirect: to => ({ path: '/musicHall', query: { ...to.query, tab: 'leaderboard' } }),
    },
    {
      path: '/songList/list',
      redirect: to => ({ path: '/musicHall', query: { ...to.query, tab: 'songlist' } }),
    },
    {
      path: '/mv',
      redirect: to => ({ path: '/musicHall', query: { ...to.query, tab: 'mv' } }),
    },
    {
      path: '/songList/detail',
      name: 'SongListDetail',
      component: require('./views/songList/Detail/index.vue').default,
      meta: {
        name: 'SongList',
      },
    },
    {
      path: '/album',
      name: 'Album',
      component: require('./views/Album/index.vue').default,
      meta: {
        name: 'Album',
      },
    },
    {
      path: '/songDetail',
      name: 'SongDetail',
      component: require('./views/SongDetail/index.vue').default,
      meta: {
        name: 'SongDetail',
      },
    },
    {
      path: '/singer',
      name: 'Singer',
      component: require('./views/Singer/index.vue').default,
      meta: {
        name: 'Singer',
      },
    },
    {
      path: '/favorites',
      name: 'Favorites',
      component: require('./views/Favorites/index.vue').default,
      meta: {
        name: 'Favorites',
      },
    },
    {
      path: '/playlists',
      name: 'Playlists',
      component: require('./views/Playlists/index.vue').default,
      meta: {
        name: 'Playlists',
      },
    },
    // 旧「我的列表」页退场（工单 07）：歌曲类列表归「我的收藏」，自建列表归「我的歌单」。
    // 播放栏点进度区、旧书签都还在用 `/list?id=…`，所以按 id 分派而不是留死链。
    // `id=default`（试听列表）界面已退场（ADR 0006）：与无 id 一样落到「我收藏的歌曲」，
    // 且不再带 `list` 参数——收藏页只剩一个列表，`list` 已无意义。
    // `id=love`（本地收藏）同样如此：本地收藏的界面入口已取消（2026-09-24，收藏只写 QQ
    // 的我喜欢），深链就落到收藏页那一份云端「我喜欢」上——不做成死链，也不另指别处。
    {
      path: '/list',
      redirect: to => {
        const id = to.query.id as string | undefined
        if (id === LIST_IDS.DEFAULT || id === LIST_IDS.LOVE || id == null) {
          return { path: '/favorites', query: { ...to.query, id: undefined, tab: 'songs' } }
        }
        if (id === LIST_IDS.DOWNLOAD) return { path: '/download', query: { ...to.query, id: undefined } }
        return { path: '/playlists', query: { ...to.query } }
      },
    },
    {
      path: '/download',
      name: 'Download',
      component: require('./views/Download/index.vue').default,
      meta: {
        name: 'Download',
      },
    },
    {
      path: '/setting',
      name: 'Setting',
      component: require('./views/Setting/index.vue').default,
      meta: {
        name: 'Setting',
      },
    },
    // 未知路径的兜底与「启动第一眼」一致（ui-polish 工单 07：落地页是雷达）
    { path: '/:pathMatch(.*)*', redirect: '/radar' },
  ],
  linkActiveClass: 'active-link',
  linkExactActiveClass: 'exact-active-link',
})


export default router
