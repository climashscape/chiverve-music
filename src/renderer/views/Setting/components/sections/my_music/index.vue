<template lang="pug">
//- 我的音乐节（元数据 §5）：QQ 账号 / 喜欢的歌 / 列表与收藏行为 / 来源显示 / 搜索行为
//- 本文件只是壳——组标题（h3 的 id 就是元数据的 group.id）加分组内容子组件
dt#my_music {{ $t('setting__my_music') }}
dd
  h3#my_music_qq_auth {{ $t('setting__qq_auth') }}
  MyMusicQQAuth
dd
  h3#my_music_favorite {{ $t('setting__my_music_favorite_title') }}
  div
    //- 本组只有「我的收藏」入口一项（非 key 控件，元数据 `my_music_favorite_entry`）；
    //- 进入本节时 QQ 登录态的拉取在 MyMusicQQAuth 里
    .p
      base-btn.btn(min data-setting-id="my_music_favorite_entry" @click="openFavorites") {{ $t('favorites') }}
dd
  h3#my_music_list {{ $t('setting__list') }}
  MyMusicListGroup
dd
  h3#my_music_source {{ $t('setting__my_music_source_title') }}
  MyMusicSourceGroup
dd
  h3#my_music_search {{ $t('setting__search') }}
  MyMusicSearchGroup
</template>

<script>
import { useRouter } from '@common/utils/vueRouter'
import MyMusicQQAuth from './MyMusicQQAuth.vue'
import MyMusicListGroup from './MyMusicListGroup.vue'
import MyMusicSourceGroup from './MyMusicSourceGroup.vue'
import MyMusicSearchGroup from './MyMusicSearchGroup.vue'

export default {
  name: 'SettingSectionMyMusic',
  components: {
    MyMusicQQAuth,
    MyMusicListGroup,
    MyMusicSourceGroup,
    MyMusicSearchGroup,
  },
  setup() {
    const router = useRouter()

    const openFavorites = () => {
      void router.push({ path: '/favorites' })
    }

    return {
      openFavorites,
    }
  },
}
</script>
