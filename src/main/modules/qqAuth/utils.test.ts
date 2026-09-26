import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 凭证刷新的竞态与状态清理（2026-09-26 全历史自审查发现，`qqAuth` 此前**零测试**）。
 *
 * 最要命的一条：刷新是异步的，期间用户可能已经登出 / 换了账号。旧实现拿到新凭证后**无条件回写**，
 * 于是一刷新完成就把刚登出/刚换号的凭证盖回旧账号（界面也被广播翻回已登录）。
 * 这里用「桩掉 store 与 refresh 模块」的方式把这条竞态钉死。
 */

const state = {
  credential: null as any,
  saved: [] as any[],
  errors: [] as any[],
}

const cred = (musicid: number, musickey: string) => ({
  musicid,
  musickey,
  refreshKey: 'rk',
  refreshToken: 'rt',
  accessToken: 'at',
  openid: 'oid',
  unionid: 'uid',
  strMusicid: String(musicid),
  expiredAt: 0,
  keyExpiresIn: 3 * 24 * 60 * 60,
  musickeyCreateTime: 1000,
  loginType: 2,
})

vi.mock('./store', () => ({
  getCredential: () => state.credential,
  saveCredential: (value: any) => { state.saved.push(value); state.credential = value },
  getLastRefreshError: () => null,
  markRefresh: (error: any) => { state.errors.push(error) },
  maskMusicid: (value: any) => (value == null ? null : `***${String(value).slice(-4)}`),
}))

vi.mock('./refresh', () => ({
  refreshCredential: vi.fn(async(prev: any) => cred(prev.musicid, 'new-key')),
}))

vi.mock('@main/modules/winMain/main', () => ({ sendEvent: vi.fn() }))

const { getStatus, logout, refresh, setCredential } = await import('./utils')

describe('qqAuth：刷新 / 登出 / 换号', () => {
  beforeEach(() => {
    state.credential = null
    state.saved = []
    state.errors = []
  })

  it('未登录时刷新直接返回失败，不写任何东西', async() => {
    const result = await refresh()
    expect(result.ok).toBe(false)
    expect(state.saved).toEqual([])
  })

  it('正常刷新：结果回写，并广播新状态', async() => {
    setCredential(cred(1001, 'old-key'))
    const result = await refresh(true)
    expect(result.ok).toBe(true)
    expect(state.credential.musickey).toBe('new-key')
    expect(getStatus().isLogin).toBe(true)
  })

  it('刷新期间登出：旧凭证刷出来的结果必须被丢弃（不许把登出的账号盖回来）', async() => {
    setCredential(cred(1001, 'old-key'))

    const refreshPromise = refresh(true)
    // 模拟「刷新在飞的时候用户点了登出」——登出会把内存里的凭证换成 null
    logout()
    const result = await refreshPromise

    expect(result.ok).toBe(false)
    expect(result.message).toContain('凭证已变更')
    expect(state.credential).toBeNull()
    expect(getStatus().isLogin).toBe(false)
    // 关键：刷新结果一次都不许落盘（saved 里只有「登录 → 登出」这两笔）
    expect(state.saved.some(value => value?.musickey === 'new-key')).toBe(false)
    expect(state.saved.at(-1)).toBeNull()
  })

  it('刷新期间换号：结果同样丢弃，新账号不受影响', async() => {
    setCredential(cred(1001, 'old-key'))

    const refreshPromise = refresh(true)
    const other = cred(2002, 'other-key')
    setCredential(other)
    const result = await refreshPromise

    expect(result.ok).toBe(false)
    expect(state.credential).toBe(other)
    expect(state.credential.musickey).toBe('other-key')
  })

  it('登出会清掉上一次刷新的失败文案（那是上一个账号的事）', () => {
    setCredential(cred(1001, 'old-key'))
    state.errors.length = 0

    logout()

    // markRefresh(null) 被调用 → 设置页不再显示上一个账号的失败原因
    expect(state.errors).toEqual([null])
  })

  it('状态里不再有 lastRefreshAt 这种没有消费方的字段（自审查删掉的死状态）', () => {
    setCredential(cred(1001, 'old-key'))
    expect(Object.keys(getStatus()).sort()).toEqual(
      ['expiresAt', 'expiresInSeconds', 'isLogin', 'lastRefreshError', 'musicidMasked'],
    )
  })
})
