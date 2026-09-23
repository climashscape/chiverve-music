import type { PlaylistCard } from '@renderer/store/user/state'

/**
 * 「云端 tab 的选中项该不该改」的判定（工单 09）。
 *
 * 抽成纯函数只为一件事：这条规则在**冷启动深链**上翻过车，得能被单测钉死
 * （`cloudSelection.test.ts`）——列表还没到手时若照「列表里没有就归一」跑，
 * 会把用户直接访问 `?cloud=<dirId>` 时要看的那一个抹掉（改成第一组甚至清空）。
 *
 * 返回值：`null` = 保持现状（不动 query）；字符串 = 要写进 `route.query.cloud` 的值（`''` = 清掉参数）。
 */
export const resolveCloudSelection = (
  lists: PlaylistCard[],
  dirId: string,
  isListsLoaded: boolean,
): string | null => {
  // 列表还没到手（initUserCenter 未完成 / createdLists 那次请求失败）：不动 query
  if (!isListsLoaded) return null
  // 选中的 dirId 仍在列表里 → 保持
  if (dirId && lists.some(item => String(item.dirId) === dirId)) return null
  // 没选、或选的那个已不存在（刚被删掉 / 老链接指向已删歌单）→ 落到第一组；一组都没有则清掉参数
  return lists.length ? String(lists[0].dirId) : ''
}
