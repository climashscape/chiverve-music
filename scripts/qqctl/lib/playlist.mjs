import { asArray, txCgi, buildComm } from './tx.mjs'

/**
 * 自建歌单读写——端点照 src/renderer/utils/musicSdk/tx/songList.js（M6 受控往返 + 工单 09 的
 * 真机 A/B 实测过），那边改了这边要跟。只沉淀验证过的四个写方法：建/删歌单、加/移歌。
 */

const SONG_WRITE_MODULE = 'music.musicasset.PlaylistDetailWrite'
/** QQ「我喜欢」的目录 id（tx/user.js FAV_DIR_ID；写它必须走安卓档案，见 writeSongs）。 */
const FAV_DIR_ID = 201

/**
 * 判读写接口的响应节点（语义对齐 songList.js 的 readWriteResult，那边有假成功案例背书）：
 * **模块级 `code` 与 `data.retCode` 都为 0 才算成功**。2026-09-24 真机实测被拒时
 * `{ code: 80105, data: { retCode: 0 } }`——只看 retCode 就会假成功。缺字段（null/空串）算缺失
 * 而不是 0，否则「连 code 都没有的畸形响应」会被读成成功。`retCode 80092`（歌单里没有这首歌）
 * 参考实现对两个方向都回 False，这里同样不豁免——宁可报错让人看见，不静默宣布成功。
 */
const toNum = value => (value == null || value === '' ? Number.NaN : Number(value))

export const readWriteResult = node => {
  const code = toNum(node?.code)
  const retCode = toNum(node?.data?.retCode)
  return {
    ok: code === 0 && retCode === 0,
    code: Number.isNaN(code) ? null : code,
    retCode: Number.isNaN(retCode) ? null : retCode,
    msg: String(node?.data?.msg ?? ''),
  }
}

/** 自建歌单列表（含「我喜欢」那行；dirId=201、tid 是它的真实 tid）。 */
export const listPlaylists = async credential => {
  const node = await txCgi({
    module: 'music.musicasset.PlaylistBaseRead',
    method: 'GetPlaylistByUin',
    param: { uin: String(credential.musicid ?? '') },
  }, buildComm(credential))
  return asArray(node?.data?.v_playlist, 'data.v_playlist').map(row => ({
    dirId: Number(row.dirId),
    tid: Number(row.tid),
    name: String(row.name ?? row.dirName ?? ''),
    songNum: Number(row.songNum ?? row.songnum ?? 0),
  }))
}

/**
 * 歌单引用三形态 → 一行记录：纯数字先按 tid 再按 dirId 匹配，否则按名称 trim 全等。
 * 多命中（重名歌单）直接报错列出——写操作不允许猜目标。
 */
export const resolvePlaylist = (rows, ref) => {
  const asNumber = Number(ref)
  const matches = Number.isFinite(asNumber) && String(asNumber) === String(ref).trim()
    ? rows.filter(row => row.tid === asNumber || row.dirId === asNumber)
    : rows.filter(row => row.name.trim() === String(ref).trim())
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new Error(`歌单引用不唯一（${matches.map(m => `${m.name}/dirId=${m.dirId}/tid=${m.tid}`).join('；')}），请用 dirId 指定`)
  }
  throw new Error(`找不到歌单「${ref}」——先用 playlist list 对照名称与 dirId`)
}

/** 歌单内歌曲（CgiGetDiss 分页）。**总数只认 `dirinfo.total_song_num`**：songlist_size 是本页条数，取错翻不到后面的歌。 */
export const getPlaylistSongs = async(credential, tid) => {
  const songs = []
  const pageSize = 100
  for (let begin = 0; begin < 20000; begin += pageSize) {
    const node = await txCgi({
      module: 'music.srfDissInfo.DissInfo',
      method: 'CgiGetDiss',
      param: {
        disstid: Number(tid),
        dirid: 0,
        tag: true,
        song_begin: begin,
        song_num: pageSize,
        userinfo: true,
        orderlist: true,
        enc_host_uin: credential.encryptUin,
      },
    }, buildComm(credential))
    const list = asArray(node?.data?.songlist, 'data.songlist')
    songs.push(...list)
    const total = Number(node?.data?.dirinfo?.total_song_num ?? 0)
    if (!list.length || (total && songs.length >= total)) break
  }
  return songs
}

/** 建歌单。重名不会失败（服务端自行加时间戳）；dirId/tid 在 `data.result` 里（M6 实测形状）。 */
export const createList = async(credential, dirName) => {
  const node = await txCgi({
    module: 'music.musicasset.PlaylistBaseWrite',
    method: 'AddPlaylist',
    param: { dirName: String(dirName ?? '') },
  }, buildComm(credential))
  const result = readWriteResult(node)
  const dirId = Number(node?.data?.result?.dirId ?? node?.result?.dirId ?? 0)
  if (!result.ok || !dirId) throw new Error(`创建歌单失败: code=${result.code} retCode=${result.retCode} msg=${result.msg}`)
  return { dirId, tid: Number(node?.data?.result?.tid ?? node?.result?.tid ?? 0), name: node?.data?.result?.dirName ?? String(dirName) }
}

/** 删自建歌单。成功时 result.dirId 回显被删的 dirId；删不存在的歌单返回 0。 */
export const deleteList = async(credential, dirId) => {
  const node = await txCgi({
    module: 'music.musicasset.PlaylistBaseWrite',
    method: 'DelPlaylist',
    param: { dirId: Number(dirId) },
  }, buildComm(credential))
  const result = readWriteResult(node)
  const echoed = Number(node?.data?.result?.dirId ?? node?.result?.dirId ?? 0)
  if (!result.ok) throw new Error(`删除歌单失败: code=${result.code} retCode=${result.retCode} msg=${result.msg}`)
  return echoed !== 0
}

/** "769125" → {songId:769125, songType:0}；"769125:13" → songType 13（type 是 QQ 原始 type）。 */
export const parseSongSpec = spec => {
  const text = String(spec ?? '').trim()
  const match = text.match(/^(\d+)(?::(\d+))?$/)
  if (!match) throw new Error(`歌曲规格不合法：${spec}（应为 songId 或 songId:songType）`)
  return { songId: Number(match[1]), songType: Number(match[2] ?? 0) }
}

/**
 * 加歌 / 移歌（method: AddSonglist | DelSonglist）。
 *
 * ⚠️ **comm 档案按 dirId 分档**（工单 09 真机 A/B，2026-09-24）：dirId=201（「我喜欢」）必须走
 * 安卓档案，WEB 档案服务端解析不出目标目录、会假成功；自建歌单（非 201）维持 WEB 档案
 * （M6 受控往返记录）。tid 传歌单自己的真实 tid（解析失败才回落 0）。
 */
export const writeSongs = async(credential, method, dirId, tid, songs) => {
  const v_songInfo = (songs ?? []).map(song => ({ songId: Number(song.songId), songType: Number(song.songType ?? 0) }))
  if (!v_songInfo.length) throw new Error('未选择歌曲')
  const numericDirId = Number(dirId)
  const node = await txCgi({
    module: SONG_WRITE_MODULE,
    method,
    param: {
      dirId: numericDirId,
      tid: Number(tid),
      bFmtUtf8: true,
      v_songInfo,
    },
  }, buildComm(credential, numericDirId === FAV_DIR_ID ? 'android' : 'web'))
  return readWriteResult(node)
}
