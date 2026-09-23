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
    {
      path: '/list',
      redirect: to => {
        const id = to.query.id as string | undefined
        if (id === LIST_IDS.DEFAULT || id === LIST_IDS.LOVE || id == null) {
          return { path: '/favorites', query: { ...to.query, id: undefined, tab: 'songs', list: id ?? LIST_IDS.DEFAULT } }
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
    { path: '/:pathMatch(.*)*', redirect: '/search' },
  ],
  linkActiveClass: 'active-link',
  linkExactActiveClass: 'exact-active-link',
})


export default router
