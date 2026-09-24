<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <!-- 动作条是 header 的**第一行**（用户 2026-09-24 重新定的位置）：四键的顶缘与歌手页「返回」键
           同一条线（两页容器 padding-top 相同，都是 16px），右缘也同贴内容右缘（四键 `flex: 1 1 0`
           + 上限 193px，恰好排满一行）。**别把它挪回 headerMain 里当右侧列**——那会挤掉简介与歌名列
           （工单 17 的实测：简介 309.9px），也别挪到信息块下方（工单 17 的做法，用户推翻）。
           量取表见 `.scratch/ui-polish-2/issues/22-album-actions-alignment.md` -->
      <div :class="$style.actions">
        <!-- 四个键都带 :title（工单 17 收尾）：键宽由 flex 等分固定，长文案会被省略号截断，
             截断时靠原生 title 看全文（与本页 .name / .singer 的做法一致） -->
        <base-btn :class="$style.btnAction" :title="isFav ? $t('fav__cancel') : $t('fav__add')" :disabled="isFavLoading" @click="handleToggleFav">
          {{ isFav ? $t('fav__cancel') : $t('fav__add') }}
        </base-btn>
        <!-- 复制链接 / 在 QQ 音乐打开（工单 02）：分享走 QQ 网页链接，与本应用深链不是一回事 -->
        <base-btn v-if="detail.mid" :class="$style.btnAction" :title="$t('album__copy_link')" @click="handleCopyAlbumLink">{{ $t('album__copy_link') }}</base-btn>
        <base-btn v-if="detail.mid" :class="$style.btnAction" :title="$t('list__open_in_qq')" @click="handleOpenAlbumInQq">{{ $t('list__open_in_qq') }}</base-btn>
        <base-btn :class="$style.btnAction" :title="$t('back')" @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
      <div :class="$style.headerMain">
        <div :class="$style.coverBox">
          <img v-if="detail.img" :class="$style.cover" loading="lazy" decoding="async" :src="detail.img" alt="">
        </div>
        <div :class="$style.info">
          <h2 :class="$style.name" :title="detail.name">{{ detail.name || $t('music_album') }}</h2>
          <p v-if="detail.singers.length || detail.singer" :class="$style.singer" :title="detail.singer">
            <!-- 歌手名可点进歌手页：优先用接口给的 singers（带 mid），拿不到 mid 的名字保持纯文本 -->
            <template v-if="detail.singers.length">
              <template v-for="(singer, index) in detail.singers" :key="singer.mid || singer.name">
                <span v-if="index" :class="$style.singerGap">、</span>
                <span v-if="singer.mid" :class="$style.singerLink" @click.stop="toSinger(singer)">{{ singer.name }}</span>
                <span v-else>{{ singer.name }}</span>
              </template>
            </template>
            <template v-else>{{ detail.singer }}</template>
          </p>
          <p :class="$style.meta">
            <span v-if="detail.publishDate">{{ $t('album__publish_date') }}：{{ detail.publishDate }}</span>
            <span v-if="detail.company">{{ $t('album__company') }}：{{ detail.company }}</span>
            <span v-if="detail.language">{{ $t('album__language') }}：{{ detail.language }}</span>
            <span v-if="detail.albumType">{{ $t('album__type') }}：{{ detail.albumType }}</span>
            <span v-if="detail.genre">{{ $t('album__genre') }}：{{ detail.genre }}</span>
          </p>
          <p v-if="detail.desc" ref="descEl" :class="[$style.desc, { [$style.descOpen]: isDescOpen }]">{{ detail.desc }}</p>
          <base-btn v-if="detail.desc && isDescOverflow" min :class="$style.descToggle" @click="isDescOpen = !isDescOpen">
            {{ isDescOpen ? $t('album__desc_collapse') : $t('album__desc_expand') }}
          </base-btn>
        </div>
      </div>
    </div>

    <!-- 详情失败（多半是专辑不存在）时只显示这一处文案，不再让歌曲列表重复同一句话 -->
    <div v-if="headerLabel" :class="$style.noitem">
      <p v-text="headerLabel" />
    </div>
    <template v-else>
      <h3 :class="$style.title">
        {{ $t('album__songs') }}
        <span v-if="songs.total" :class="$style.count">{{ songs.total }}</span>
      </h3>
      <div :class="$style.list">
        <material-online-list
          :list="songs.list"
          :page="songs.page"
          :limit="songs.limit"
          :total="songs.total"
          :no-item="songs.noItemLabel"
          :list-id="`album__${$route.query.mid ?? ''}`"
          check-api-source
          @toggle-page="handleTogglePage"
          @play-list="handlePlayList"
        />
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { computed, ref, watch, nextTick } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import usePlay from '@renderer/components/material/OnlineList/usePlay'
import useMusicJump from '@renderer/utils/compositions/useMusicJump'
import useAlbum from './useAlbum'
import { getQQCredential } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'
import { favAlbumIds } from '@renderer/store/user/state'
import { loadFavAlbumIds, setAlbumFav } from '@renderer/store/user/action'

export default {
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { detail, songs, headerLabel, initAlbum, loadSongPage } = useAlbum()

    // 播放复用在线列表的同一套逻辑。
    // ⚠️ 传歌曲区块对象本身（不是 `{ list: songs.list }`）：usePlay 存的是 props.list 的数组
    // 引用，区块内写回全部走 splice，所以引用一直有效。
    const selectedList = ref<LX.Music.MusicInfoOnline[]>([])
    // 队列身份（工单 06）：与模板上那个 :list-id 一致。`String(...)` 是为了吃掉
    // route.query.mid 的 string | string[] 联合类型（免得模板字符串触发类型警告）
    const queueListId = computed(() => `album__${String(route.query.mid ?? '')}`)
    const { handlePlayMusic } = usePlay({
      selectedList,
      props: { list: songs.list, listId: queueListId.value },
      removeAllSelect: () => { selectedList.value = [] },
      emit: () => {},
    })
    const handlePlayList = (index: number) => { void handlePlayMusic(index, true) }

    // 路由页没有 keep-alive，但 /album?mid=A → /album?mid=B 是同组件复用（setup 不会再跑），
    // 所以靠 watch 路由参数驱动取数，进入与更新两种情况都能覆盖
    watch(() => route.query.mid, (mid) => {
      void initAlbum(mid)
    }, { immediate: true })

    const handleTogglePage = (page: number) => {
      loadSongPage(page)
    }
    const handleBack = () => { router.back() }

    /**
     * 收藏 / 取消收藏到 QQ（工单 08）。
     *
     * 「有没有收藏」只能靠**收藏全量 id 集合**在本地比对（读接口没有单条查询，见 store/user 的注释），
     * 所以进页面先拉一次；写成功后本地集合跟着改，按钮状态立刻正确。
     * 未登录时只提示、不发请求；失败用 dialog 明确报错，不静默。
     */
    const isFavLoading = ref(false)
    const isFav = computed(() => !!detail.mid && favAlbumIds.includes(detail.mid))
    const handleToggleFav = async() => {
      if (!detail.id || !detail.mid) return
      const credential = await getQQCredential()
      if (credential == null) {
        void dialog({ message: window.i18n.t('user_center__need_login' as any), type: 'info' })
        return
      }
      const next = !isFav.value
      isFavLoading.value = true
      try {
        await setAlbumFav({ id: detail.id, mid: detail.mid }, next)
      } catch (err: any) {
        void dialog({ message: err?.message || String(err), type: 'error' })
      } finally {
        isFavLoading.value = false
      }
    }
    // 进页面（或换专辑）时确保收藏集合已加载；未登录时静默失败（按钮点了会提示登录）
    watch(() => detail.mid, (mid) => {
      if (!mid) return
      void loadFavAlbumIds().catch(err => { console.log('[album] load fav ids', err) })
    }, { immediate: true })
    // 专辑简介默认 3 行截断（.desc 的 mixin-ellipsis(3)），点按钮展开全文。
    // 按钮只在**真的被截断**时出现：line-clamp 下 scrollHeight 仍是全文高度，
    // 所以量 scrollHeight > clientHeight 就能判断（短简介不该出现一个点了没变化的按钮）。
    const descEl = ref<HTMLElement | null>(null)
    const isDescOpen = ref(false)
    const isDescOverflow = ref(false)
    const measureDesc = () => {
      isDescOpen.value = false
      void nextTick(() => {
        const el = descEl.value
        isDescOverflow.value = el != null && el.scrollHeight > el.clientHeight + 1
      })
    }
    watch(() => detail.desc, measureDesc, { immediate: true })
    // 专辑详情的歌手条目带 mid（tx/album.js 的 toSinger），据此跳歌手页
    const toSinger = (singer: { mid: string, name: string }) => {
      if (!singer.mid) return
      void router.push({ path: '/singer', query: { mid: singer.mid } })
    }

    // 复制专辑链接 / 在 QQ 音乐打开（工单 02）：专辑的 URL 生成器是本票新补的
    const { copyAlbumLink, openAlbumInQqMusic } = useMusicJump()
    const handleCopyAlbumLink = () => { copyAlbumLink(detail.mid) }
    const handleOpenAlbumInQq = () => { openAlbumInQqMusic(detail.mid) }

    return {
      detail,
      songs,
      headerLabel,
      handleTogglePage,
      handlePlayList,
      handleBack,
      toSinger,
      isFav,
      isFavLoading,
      handleToggleFav,
      handleCopyAlbumLink,
      handleOpenAlbumInQq,
      descEl,
      isDescOpen,
      isDescOverflow,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  // 根容器带左右 padding 时必须 border-box，否则溢出窗口右侧（见 userCenter/index.vue 同名注释）
  box-sizing: border-box;
  padding: 16px 22px 0;
  color: var(--color-font);
  display: flex;
  flex-flow: column nowrap;
}

.header {
  flex: none;
  // 纵向：动作条一行（.actions），封面/简介一行（.headerMain）——顺序见模板里的注释
  display: flex;
  flex-flow: column nowrap;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-000-alpha-700);
}
.headerMain {
  display: flex;
  flex-flow: row nowrap;
}
.coverBox {
  flex: none;
  width: 120px;
  height: 120px;
  border-radius: @radius-border;
  overflow: hidden;
  background-color: var(--color-button-background);
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info {
  flex: auto;
  min-width: 0;
  padding: 0 14px;
}
.name {
  font-size: 17px;
  font-weight: 600;
  .mixin-ellipsis-1();
}
.singer {
  margin-top: 6px;
  font-size: 13px;
  .mixin-ellipsis-1();
}
// 歌手名可点（M6）：只做颜色过渡，不加下划线——专辑页是信息区，下划线会显得很吵
.singerLink {
  cursor: pointer;
  transition: color @transition-fast;

  &:hover {
    color: var(--color-primary);
  }
}
.singerGap {
  color: var(--color-font-label);
}
.meta {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-font-label);

  span {
    margin-right: 12px;
  }
}
.desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-font-label);
  .mixin-ellipsis(3);
}
// 展开态：解除 3 行截断（mixin 用的是 -webkit-box + line-clamp）
.descOpen {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
}
.descToggle {
  margin-top: 4px;
  align-self: flex-start;
}
// 动作条：独占一行，在专辑信息**上方**（用户 2026-09-24 定的位置）——与歌手页「返回」键同顶缘，
// 且不改变简介与歌名/歌手/meta 的列宽（它们都在 .headerMain 里，横向一点没动）。
// `justify-content: flex-end` 的必要性：四键排满一行只在内容宽 ≈802px（920 档）时成立；窗口更大时
// 四键被 max-width 卡在 193，剩余空间会堆在**右侧**、最后一个键离内容右缘 179.5px（1114 档实测），
// 与歌手页返回键（永远贴右缘）就对不齐了。靠右对齐后两档都贴右缘（1114 档实测差 0）。
.actions {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 12px;
}
// 四个动作键（工单 17）：**同高同宽 + 文案不换行**。等宽思路借自 RadarCarousel 的同名类，
// 但那页是固定 width:96px + base-btn min（12px 字号）；本页文案长得多（中文最长「取消 QQ 收藏」
// 含内边距 119.6px、英文最长 231.6px），所以改成 flex 等分 + 默认字号，值另算。
// 前提是**动作条自己占满一行**（现在是 header 的第一行，工单 22 起）：四键排满后右缘正好落在内容右缘，
// 与歌手页「返回」键的右缘同一条线。
// ⚠️ 别把 basis 改成 auto —— 那样宽度又跟着文案走（「返回」比「取消 QQ 收藏」窄一大截，
// 收藏/取消收藏切换时宽度也会跳），四个键就又大小不一了。
// 上限 193px 的来历：默认档 920×600 的**内容宽 800.3px**（= (920-16)×93.4% - 44 的左右 padding），
// 每键可分到 (800.3-3×10)/4 ≈ 192.6px，取 193 让这一档刚好排满、更宽窗口也不再涨
// （四键上限和 = 193×4+30 = 802px）；最窄档 828×540 内容宽只有 714.4px，上限不生效，
// 靠等分收窄到各 171.1px，不溢出（实测见票 17/22 的量取表）。
.btnAction {
  flex: 1 1 0;
  min-width: 0;
  max-width: 193px;
  // 英文「Remove from QQ favorites」要 231.6px，四键等宽下任何一档窗口都装不下，
  // 兜底用省略号而不是换行/溢出（文案不换行是硬要求）；全文由模板上的 :title 悬停可见
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title {
  flex: none;
  margin-top: 14px;
  font-size: 14px;
  font-weight: 600;
}
.count {
  margin-left: 6px;
  font-weight: 400;
  font-size: 12px;
  color: var(--color-font-label);
}

// material-online-list 内部是绝对定位 + 自滚动，父级要给出确定的高度
.list {
  flex: auto;
  min-height: 0;
  position: relative;
}
.noitem {
  flex: auto;
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    font-size: 20px;
    color: var(--color-font-label);
  }
}
</style>
