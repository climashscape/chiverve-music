<template>
  <div :class="$style.container" class="scroll">
    <p v-if="labels.followSingers && !followSingers.length" :class="$style.tip" v-text="labels.followSingers" />
    <p v-else-if="!followSingers.length" :class="$style.tip">{{ $t('no_item') }}</p>
    <ul :class="$style.singers">
      <li v-for="item in followSingers" :key="item.id" :class="$style.singer" @click="toSinger(item)">
        <img :class="$style.singerImg" loading="lazy" decoding="async" :src="item.img" alt="">
        <div :class="$style.singerInfo">
          <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
          <p :class="$style.cardMeta" :title="item.desc">{{ item.desc }}</p>
        </div>
      </li>
    </ul>
    <div v-if="pagers.followSingers.hasMore" :class="$style.more">
      <base-btn min @click="loadMoreFollowSingers">{{ $t('user_center__load_more') }}</base-btn>
    </div>
  </div>
</template>

<script lang="ts">
import { useRouter } from '@common/utils/vueRouter'
import { followSingers, labels, pagers } from '@renderer/store/user/state'
import { initUserCenter, loadMoreFollowSingers } from '@renderer/store/user/action'

/** 我的收藏 → 歌手：QQ 账号关注的歌手（只读）。 */
export default {
  name: 'FavoritesSingersPanel',
  setup() {
    const router = useRouter()
    void initUserCenter()

    const toSinger = (item: { id: string }) => {
      void router.push({ path: '/singer', query: { mid: item.id } })
    }

    return {
      followSingers,
      labels,
      pagers,
      toSinger,
      loadMoreFollowSingers,
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

.singers {
  display: flex;
  flex-wrap: wrap;
}
.singer {
  display: flex;
  align-items: center;
  width: 220px;
  margin: 0 16px 12px 0;
  cursor: pointer;

  &:hover .singerImg {
    transform: scale(1.05);
  }
}
.singerImg {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: cover;
  transition: transform @transition-fast;
}
.singerInfo {
  min-width: 0;
  padding-left: 10px;
}
.cardName {
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
</style>
