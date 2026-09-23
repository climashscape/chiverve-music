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
      path: '/songList/list',
      name: 'SongList',
      component: require('./views/songList/List/index.vue').default,
      meta: {
        name: 'SongList',
      },
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
      path: '/mv',
      name: 'Mv',
      component: require('./views/Mv/index.vue').default,
      meta: {
        name: 'Mv',
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
      path: '/leaderboard',
      name: 'Leaderboard',
      component: require('./views/Leaderboard/index.vue').default,
      meta: {
        name: 'Leaderboard',
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
