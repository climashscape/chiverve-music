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
import { ref } from '@common/utils/vueTools'
import { DEFAULT_SETTING } from '@common/constants'
import { getLeaderboardSetting, setLeaderboardSetting } from '@renderer/utils/data'
import BoardList from './BoardList/index.vue'
import MusicList from './MusicList/index.vue'
import { sources } from '@renderer/store/leaderboard/state'


const source = ref('tx')
const boardId = ref(null)

// 只保留 tx 一个在线源，源不再由用户选择：历史值（旧 `'all'` 或已移除的源）归一到已注册源
const normalizeSource = (source) => {
  return sources.includes(source) ? source : (sources[0] ?? DEFAULT_SETTING.leaderboard.source)
}
// 榜单 id 形如 `${source}__${bangId}`，属于已移除源的 id 会被接口取空
const isStaleBoardId = (boardId, source) => typeof boardId == 'string' && !boardId.startsWith(`${source}__`)

const verifyQueryParams = async function(to, from, next) {
  const _source = to.query.source
  const normalized = normalizeSource(_source)
  let _boardId = to.query.boardId

  if (_source !== normalized || (_boardId && isStaleBoardId(_boardId, normalized))) {
    if (_source !== normalized) _boardId = (await getLeaderboardSetting()).boardId
    next({
      path: to.path,
      query: { ...to.query, source: normalized, boardId: isStaleBoardId(_boardId, normalized) ? undefined : _boardId },
    })
    return
  }
  next()
  source.value = normalized
  boardId.value = _boardId
  void setLeaderboardSetting({ source: normalized, boardId: _boardId })
}


export default {
  components: {
    BoardList,
    MusicList,
  },
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const musicListRef = ref(null)
    const boardListRef = ref(null)

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
.header {
  flex: none;
  width: 100%;
  display: flex;
  flex-flow: row nowrap;

}
.tab {
  flex: auto;
}
.content {
  flex: auto;
  display: flex;
  overflow: hidden;
  flex-flow: column nowrap;
}

.lists {
  flex: none;
  width: 14.8%;
  display: flex;
  flex-flow: column nowrap;
}
.listsHeader {
  position: relative;
}

.list {
  position: relative;
  overflow: hidden;
  height: 100%;
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  // .noItem {

  // }
}

</style>
