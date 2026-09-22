import { httpFetch } from '@main/utils/request'
import { zzcSign } from '@common/utils/qqSign'
import { log } from '@common/utils'

/**
 * QQ 凭证刷新。
 *
 * 端点与参数对照 QQMusicApi 的 `modules/login.py:121-185`；
 * 传输形态用本项目 M0 实测通过的组合（docs/specs/0001 §5.0）：
 *   `musics.fcg?sign=<zzc>` + comm 带 `authst`/`qq`/`tmeAppID`/`tmeLoginType`
 * —— 与 LX 既有的 `signRequest`（tx/utils/index.js:5-16）同一条通道。
 *
 * 与 QQMusicApi 的差异：它走 CGI 网关，我们走 musics.fcg；两者 M0 都已实测可承载。
 */

const ENDPOINT = 'https://u.y.qq.com/cgi-bin/musics.fcg'
const UA = 'QQMusic 14090008(android 12)'
const MODULE_KEY = 'music.login.LoginServer'

const buildComm = (cred: LX.QQAuth.Credential): Record<string, unknown> => ({
  ct: '19',
  cv: '2151',
  uin: String(cred.musicid),
  // authst 是必需的：vkey/登录系列端点靠它鉴权，与平台档案无关（M0 实测结论）
  authst: cred.musickey,
  qq: String(cred.musicid),
  tmeAppID: 'qqmusic',
  tmeLoginType: cred.loginType ?? 2,
  format: 'json',
})

const buildParam = (cred: LX.QQAuth.Credential): Record<string, unknown> => {
  const shared = {
    openid: cred.openid,
    access_token: cred.accessToken,
    refresh_token: cred.refreshToken,
    refresh_key: cred.refreshKey,
    loginMode: 2,
  }
  const musicid = cred.musicid
  const strMusicid = cred.strMusicid ?? String(musicid)

  switch (cred.loginType) {
    // 1 = 微信
    case 1:
      return { ...shared, str_musicid: strMusicid, musickey: cred.musickey, unionid: cred.unionid }
    // 2 = QQ
    case 2:
      return { ...shared, expired_in: cred.expiredAt, musicid, musickey: cred.musickey }
    default:
      return {
        ...shared,
        expired_in: cred.expiredAt,
        str_musicid: strMusicid,
        musicid,
        musickey: cred.musickey,
        unionid: cred.unionid,
      }
  }
}

/**
 * 把刷新接口的响应映射为 Credential。
 *
 * ⚠️ 响应字段大小写是**混用**的（M0 实测确认，不要想当然统一转换）：
 *   snake_case: access_token / refresh_key / refresh_token / expired_at / str_musicid
 *   camelCase : keyExpiresIn / musickeyCreateTime / loginType / encryptUin / musickey / musicid
 * 因此逐个显式映射，并对缺失字段回退到原值——刷新响应不保证每次字段齐全。
 */
const toCredential = (data: Record<string, any>, prev: LX.QQAuth.Credential): LX.QQAuth.Credential => ({
  musicid: data.musicid ?? prev.musicid,
  musickey: data.musickey ?? prev.musickey,
  refreshKey: data.refresh_key ?? prev.refreshKey,
  refreshToken: data.refresh_token ?? prev.refreshToken,
  accessToken: data.access_token ?? prev.accessToken,
  openid: data.openid ?? prev.openid,
  unionid: data.unionid ?? prev.unionid,
  strMusicid: data.str_musicid ?? prev.strMusicid,
  expiredAt: data.expired_at ?? prev.expiredAt,
  keyExpiresIn: data.keyExpiresIn ?? prev.keyExpiresIn,
  musickeyCreateTime: data.musickeyCreateTime ?? prev.musickeyCreateTime,
  loginType: data.loginType ?? prev.loginType,
  encryptUin: data.encryptUin ?? prev.encryptUin,
})

export const refreshCredential = async(cred: LX.QQAuth.Credential): Promise<LX.QQAuth.Credential> => {
  const body = {
    comm: buildComm(cred),
    [MODULE_KEY]: {
      module: MODULE_KEY,
      method: 'Login',
      param: buildParam(cred),
    },
  }

  const sign = zzcSign(JSON.stringify(body))
  const response = await httpFetch<Record<string, any>>(`${ENDPOINT}?sign=${sign}`, {
    method: 'POST',
    json: body,
    headers: { 'User-Agent': UA },
    timeout: 15000,
  })

  const payload = response.body ?? {}
  const node = payload[MODULE_KEY] ?? {}
  const data = (node.data ?? {}) as Record<string, any>

  if (payload.code !== 0 || node.code !== 0) {
    const detail = data.errMsg ?? data.errtip ?? ''
    throw new Error(`刷新失败(code=${payload.code}/${node.code})${detail ? ` ${detail}` : ''}`)
  }
  if (!data.musickey) throw new Error('刷新响应未包含 musickey')

  log.info('[qqAuth] credential refreshed')
  return toCredential(data, cred)
}
