/* eslint-disable @typescript-eslint/no-var-requires */
// import Vue from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'


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
      path: '/singer',
      name: 'Singer',
      component: require('./views/Singer/index.vue').default,
      meta: {
        name: 'Singer',
      },
    },
    {
      path: '/list',
      name: 'List',
      component: require('./views/List/index.vue').default,
      meta: {
        name: 'List',
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
    { path: '/:pathMatch(.*)*', redirect: '/search' },
  ],
  linkActiveClass: 'active-link',
  linkExactActiveClass: 'exact-active-link',
})


export default router
