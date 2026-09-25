/**
 * 评论**条数**的解析（老式 h5 `fcg_global_comment_h5.fcg` 响应里的 `comment.commenttotal`）。
 * 只有这一处实现：歌曲与歌单走的是同一个接口、同一个字段（只有 `biztype` 不同）。
 *
 * 为什么单独一个文件（同 `gene.js` / `songlistTotal.js` 的分工）：`comment.js` 会 import
 * 请求层与凭证 IPC，而这种「响应字段 → 数字」的函数要能在 **node project** 直接单测
 * （vitest 的 node 白名单到 `musicSdk/**`）。测试见 `commentTotal.test.ts`。
 *
 * 🔴 取值口径（2026-09-25 探针，见 `scripts/verify/artifacts/2026-09-25-qq-probe/NOTES.md` §3）：
 *   - **总数取 `commenttotal`**：歌曲 `biztype=1`、歌单 `biztype=3` 实测都有
 *     （晴天 230665 / 歌单 1787、432），类型是数字，失效 id 也不缺字段（给 0）。
 *   - ⚠️ `GetHotCommentList` 的 `data.CommentList.Total` 是**热评条数**（晴天 3964），
 *     **不是**总评论数——两个数都叫「总数」，别互相顶替（票 03 的坑）。
 *   - `CommentRead/GetCommentCount` 方法存在，但 18 种参数形状全 `code=10000`，
 *     **未探通**，不要改用它。
 *
 * 取不到时返回 `null` 而不是 0：**0 是「真的没有评论」**（有效数据），`null` 是「这次响应里
 * 没有这个数」——调用方据此决定「不显示计数」，而不是把「取不到」显示成 0 或占位符。
 *
 * @param {object} [comment] h5 响应的 `body.comment` 节点
 * @returns {number|null} 非负数字（含 0；实测是整数，这里不做取整），取不到为 null
 */
export const pickCommentTotal = comment => {
  const raw = comment?.commenttotal
  // 空串 / 全空白是「没给」，不是 0（`Number('')` 会给出 0，别让它冒充真实计数）
  if (raw == null || (typeof raw == 'string' && !raw.trim())) return null
  const total = Number(raw)
  return Number.isFinite(total) && total >= 0 ? total : null
}
