import { describe, expect, it } from 'vitest'
import { describeCredential, expiryState, maskMusicid } from './credential.mjs'

describe('maskMusicid（安全纪律：日志只许出现脱敏值）', () => {
  it('长号只留末 4 位；短号原样', () => {
    expect(maskMusicid('123456789')).toBe('***6789')
    expect(maskMusicid(123456789)).toBe('***6789')
    expect(maskMusicid('1234')).toBe('1234')
    expect(maskMusicid(null)).toBe('')
  })
})

describe('expiryState（musickeyCreateTime + keyExpiresIn，缺字段回退 expiredAt）', () => {
  it('有过期判定：未过期 false，过期 true', () => {
    const now = Date.now()
    const fresh = expiryState({ musickeyCreateTime: Math.floor(now / 1000) - 60, keyExpiresIn: 86400 })
    expect(fresh.expired).toBe(false)
    const stale = expiryState({ musickeyCreateTime: Math.floor(now / 1000) - 86400 * 2, keyExpiresIn: 86400 })
    expect(stale.expired).toBe(true)
  })

  it('缺运行时长字段时回退 expiredAt（秒级 epoch）', () => {
    const past = Math.floor(Date.now() / 1000) - 100
    expect(expiryState({ expiredAt: past }).expired).toBe(true)
  })

  it('什么都缺给 unknown（expired: null）', () => {
    expect(expiryState({})).toMatchObject({ expired: null, expireAt: null })
  })
})

describe('describeCredential（只出字段名与脱敏值，绝不带凭证值）', () => {
  it('输出不含 musickey/refreshKey 等值，fields 只有键名', () => {
    const info = describeCredential({
      musicid: 987654321,
      musickey: 'SECRET-KEY',
      refreshKey: 'SECRET-REFRESH',
      accessToken: 'SECRET-TOKEN',
      p_skey: 'SECRET-PSKEY',
      loginType: 2,
      encryptUin: 'EUIN',
      strMusicid: '987654321',
      musickeyCreateTime: Math.floor(Date.now() / 1000) - 60,
      keyExpiresIn: 86400,
    })
    expect(info.profileMusicid).toBe('***4321')
    expect(info.loginType).toBe('qq')
    expect(info.hasEncryptUin).toBe(true)
    expect(info.expired).toBe(false)
    expect(JSON.stringify(info)).not.toContain('SECRET')
    expect(info.fields).toContain('musickey')
    expect(info.fields).toContain('p_skey')
  })
})
