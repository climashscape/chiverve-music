/**
 * 歌单类响应（`music.srfDissInfo.DissInfo/CgiGetDiss` —— 读取「我喜欢」与歌单详情都走它）
 * 的**总数**解析。只有这一处实现，两个调用方共用：
 *   - `tx/user.js` 的 `getFavSong`（兜底 0）
 *   - `tx/songList.js` 的 `getListDetailByCgi`（兜底本页条数 `list.length`）
 *
 * 为什么单独一个文件（同 `gene.js` 的分工）：`user.js` / `songList.js` 都会 import 请求层，
 * 而这种「响应字段 → 数字」的函数要能在 **node project** 直接单测（vitest 的 node 白名单
 * 到 `musicSdk/**`）。测试见 `songlistTotal.test.ts`。
 *
 * 🔴 取值口径（`AGENTS.md` §7 坑 13）：**总数取 `total_song_num`**；`songlist_size` 是
 * **本页返回条数**（参考实现 `QQMusicApi/models/songlist.py:55,63`），只能在
 * `total_song_num` 缺失时兜底。取错会让「我喜欢」永远显示成每页条数（50）、
 * 歌单分页永远停在第 1 页。
 *
 * @param {object} [data] `CgiGetDiss` 响应的 `data` 节点（可选：响应没有 `data` 时只看兜底值）
 * @param {number} fallback 两个字段都缺时的兜底值（调用方各自给，见文件头）
 * @returns {number} 总数（不保证是整数——原样过 `Number`，与旧实现一致）
 */
export const pickSonglistTotal = (data, fallback = 0) =>
  Number(data?.total_song_num ?? data?.songlist_size ?? fallback)
