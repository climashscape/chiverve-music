<template>
  <div :class="$style.leaderboard">
    <div :class="$style.lists">
      <BoardList ref="boardListRef" :board-id="boardId" :source="source" @show-menu="$refs.musicListRef?.hideMenu()" />
    </div>
    <div :class="$style.list">
      <MusicList ref="musicListRef" :source="source" :board-id="boardId" @show-menu="$refs.boardListRef?.hideMenu()" />
    </div>
  </div>
</template>

<script>
import { ref, watch } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { DEFAULT_SETTING } from '@common/constants'
import { getLeaderboardSetting, setLeaderboardSetting } from '@renderer/utils/data'
import BoardList from './BoardList/index.vue'
import MusicList from './MusicList/index.vue'
import { sources } from '@renderer/store/leaderboard/state'

/**
 * 乐馆 → 排行榜 Tab。
 *
 * 原本是独立路由页（views/Leaderboard/index.vue），并入乐馆后**参数仍走 route.query**
 * （source / boardId）：旧地址 `/leaderboard?boardId=x` 重定向进来能原样带上，
 * 榜单左栏点选也还是改 query。区别只是原来的 `beforeRouteEnter/beforeRouteUpdate` 守卫
 * 换成了组件内的 watch——面板不是路由组件，没有组件内守卫。
 */

const source = ref('tx')
const boardId = ref(null)

// 只保留 tx 一个在线源，源不再由用户选择：历史值（旧 `'all'` 或已移除的源）归一到已注册源
const normalizeSource = (source) => {
  return sources.includes(source) ? source : (sources[0] ?? DEFAULT_SETTING.leaderboard.source)
}
// 榜单 id 形如 `${source}__${bangId}`，属于已移除源的 id 会被接口取空
const isStaleBoardId = (boardId, source) => typeof boardId == 'string' && !boardId.startsWith(`${source}__`)

export default {
  components: {
    BoardList,
    MusicList,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const musicListRef = ref(null)
    const boardListRef = ref(null)

    const applyQuery = async() => {
      // 收口：函数体里 `getLeaderboardSetting` / `setLeaderboardSetting` 是 IPC 调用，失败即 reject，
      // 而调用方（下面的 watch）是 `void applyQuery()`——没人接就漏到顶层，dev 下 webpack-dev-server
      // 据此弹全屏浮层（fixed; inset:0）吞掉真实鼠标输入（票 03b）。设置读不到时 query 仍照常驱动
      // 视图，所以只收口 + 留一行带上下文的日志。
      try {
        const rawSource = route.query.source
        const normalized = normalizeSource(rawSource)
        let nextBoardId = route.query.boardId

        if (rawSource !== normalized || (nextBoardId && isStaleBoardId(nextBoardId, normalized))) {
          if (rawSource !== normalized) nextBoardId = (await getLeaderboardSetting()).boardId
          void router.replace({
            path: route.path,
            query: { ...route.query, source: normalized, boardId: isStaleBoardId(nextBoardId, normalized) ? undefined : nextBoardId },
          })
          return
        }
        source.value = normalized
        boardId.value = nextBoardId
        await setLeaderboardSetting({ source: normalized, boardId: nextBoardId })
      } catch (err) {
        console.log('[leaderboard] 应用排行榜路由参数失败', err)
      }
    }

    watch(() => [route.query.source, route.query.boardId], () => { void applyQuery() }, { immediate: true })

    return {
      source,
      boardId,
      musicListRef,
      boardListRef,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.leaderboard {
  height: 100%;
  display: flex;
  position: relative;
}

.lists {
  flex: none;
  width: 14.8%;
  display: flex;
  flex-flow: column nowrap;
}

.list {
  position: relative;
  overflow: hidden;
  height: 100%;
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
}

</style>
