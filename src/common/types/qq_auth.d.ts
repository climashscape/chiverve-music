declare namespace LX {
  namespace QQAuth {
    /**
     * QQ 音乐登录凭证。
     * 字段对齐 QQMusicApi 的 Credential（qqmusic_api/models/request.py:63-118）。
     */
    interface Credential {
      musicid: number | string
      /** 即 authst，取流鉴权用它（见 docs/specs/0001 §4.2） */
      musickey: string
      refreshKey?: string
      refreshToken?: string
      accessToken?: string
      openid?: string
      unionid?: string
      strMusicid?: string
      /** 过期时间戳（秒） */
      expiredAt?: number
      musickeyCreateTime?: number
      /** 有效时长（秒），实测 259200 = 3 天 */
      keyExpiresIn?: number
      encryptUin?: string
      /** 1=微信，2=QQ */
      loginType?: number
    }

    /** 渲染侧可见的登录状态。刻意不含任何密钥值。 */
    interface Status {
      isLogin: boolean
      /** 已脱敏：仅保留末 4 位，避免日志/界面泄露完整账号 */
      musicidMasked: string | null
      /** 过期时间戳（秒） */
      expiresAt: number | null
      /** 距过期的剩余秒数，负数表示已过期 */
      expiresInSeconds: number | null
      lastRefreshAt: number | null
      lastRefreshError: string | null
    }

    type SetCredentialParams = Credential

    interface RefreshResult {
      ok: boolean
      status: Status
      message?: string
    }
  }
}
