<template>
  <div :class="$style.container" class="scroll">
    <!-- 新碟上架：area 实测生效，所以做成真筛选 -->
    <div :class="$style.sectionHeader">
      <base-tab v-model="area" :class="$style.tabs" :list="areaTabs" item-key="area" @change="switchNewAlbumArea" />
    </div>
    <ul v-show="!newAlbums.noItemLabel" :class="$style.albumCards">
      <li v-for="item in newAlbums.list" :key="item.mid || item.id" :class="$style.albumCard" @click="toAlbum(item)">
        <img :class="$style.albumImg" loading="lazy" decoding="async" :src="item.img" alt="">
        <h4 :class="$style.cardName" :title="item.name">{{ item.name }}</h4>
        <p :class="$style.cardMeta" :title="item.singer">{{ item.singer }}</p>
        <p :class="$style.cardMeta">{{ item.publishDate }}</p>
      </li>
    </ul>
    <div v-show="newAlbums.noItemLabel" :class="$style.noitem">
      <p v-text="newAlbums.noItemLabel" />
    </div>
    <div v-if="newAlbums.total > newAlbums.limit" :class="$style.more">
      <material-pagination :count="newAlbums.total" :limit="newAlbums.limit" :page="newAlbums.page" @btn-click="loadNewAlbums" />
    </div>
  </div>
</template>

<script lang="ts">
import { ref } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import useNewAlbumsTab, { type AlbumCard } from '../useNewAlbumsTab'

/** 发现页 → 新碟 Tab：按地区筛选 + 分页。 */
export default {
  name: 'DiscoverNewAlbumsPanel',
  setup() {
    const router = useRouter()
    const { newAlbums, areaTabs, initNewAlbumsTab, loadNewAlbums, switchNewAlbumArea } = useNewAlbumsTab()

    void initNewAlbumsTab()

    // 地区 tab 的 v-model 与区块状态分开：加载中不该被外部改掉
    const area = ref(newAlbums.area)
    const toAlbum = (item: AlbumCard) => {
      void router.push({ path: '/album', query: { mid: item.mid || item.id } })
    }

    return {
      newAlbums,
      area,
      areaTabs: areaTabs(),
      loadNewAlbums,
      switchNewAlbumArea,
      toAlbum,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  box-sizing: border-box;
  padding: 4px 0 30px;
  color: var(--color-font);
  overflow-y: auto;
}

.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
// base-tab 自带 15px 内边距，这里抵消掉，让 tab 与内容左对齐
.tabs {
  margin: 0 -15px 4px 0;
}

.albumCards {
  display: flex;
  flex-wrap: wrap;
}
.albumCard {
  width: 132px;
  margin: 0 14px 14px 0;
  cursor: pointer;

  &:hover .albumImg {
    transform: scale(1.04);
  }
}
.albumImg {
  width: 132px;
  height: 132px;
  border-radius: @radius-border;
  object-fit: cover;
  background-color: var(--color-button-background);
  transition: transform @transition-fast;
}
.cardName {
  margin-top: 6px;
  font-size: 12px;
  .mixin-ellipsis-2();
}
.cardMeta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}

.more {
  margin-top: 10px;
  text-align: center;
}
.noitem {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
</style>
