<template>
  <div :class="$style.container" class="scroll">
    <p v-if="labels.favAlbums && !favAlbums.length" :class="$style.tip" v-text="labels.favAlbums" />
    <p v-else-if="!favAlbums.length" :class="$style.tip">{{ $t('no_item') }}</p>
    <ul :class="$style.cards">
      <li v-for="item in favAlbums" :key="item.id" :class="$style.card" @click="toAlbum(item)">
        <img :class="$style.cardImg" loading="lazy" decoding="async" :src="item.img" alt="">
        <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
        <p :class="$style.cardMeta" :title="item.author">{{ item.author }}</p>
      </li>
    </ul>
    <div v-if="pagers.favAlbums.hasMore" :class="$style.more">
      <base-btn min @click="loadMoreFavAlbums">{{ $t('user_center__load_more') }}</base-btn>
    </div>
    <!-- 加载更多失败：独立提示位（空表时由上面的空态承担，不重复显示） -->
    <p v-if="moreError" :class="$style.error" v-text="moreError" />
  </div>
</template>

<script lang="ts">
import { computed, watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { favAlbums, labels, pagers } from '@renderer/store/user/state'
import { initUserCenter, loadMoreFavAlbums, moreErrorLabelOf } from '@renderer/store/user/action'
import { status } from '@renderer/store/qqAuth/state'

/** 我的收藏 → 专辑：QQ 账号收藏的专辑（只读接口，写能力见工单 08）。 */
export default {
  name: 'FavoritesAlbumsPanel',
  setup() {
    const router = useRouter()
    void initUserCenter()

    // 登录信号到达就重拉（照 `views/friends/useUserList.ts` 的 watch）
    watch(() => status.isLogin, (isLogin) => {
      if (isLogin) void initUserCenter(true)
    })

    const moreError = computed(() => moreErrorLabelOf(labels.favAlbums, favAlbums.length > 0))

    const toAlbum = (item: { id: string }) => {
      void router.push({ path: '/album', query: { mid: item.id } })
    }

    return {
      favAlbums,
      labels,
      pagers,
      moreError,
      toAlbum,
      loadMoreFavAlbums,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  overflow-y: auto;
}

.tip {
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-font-label);
}

.cards {
  display: flex;
  flex-wrap: wrap;
}
.card {
  width: 132px;
  margin: 0 14px 14px 0;
  cursor: pointer;

  &:hover .cardImg {
    transform: scale(1.04);
  }
}
.cardImg {
  width: 132px;
  height: 132px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
.cardName {
  margin-top: 6px;
  font-size: 13px;
  .mixin-ellipsis-1();
}
.cardMeta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}

.more {
  padding: 10px 0;
  text-align: center;
}

.error {
  padding: 6px 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
