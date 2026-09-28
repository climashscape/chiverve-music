import { describe, expect, it } from 'vitest'
import { buildComm, zzcSign } from './tx.mjs'

describe('buildComm', () => {
  const credential = { musicid: 12345, musickey: 'KEY', loginType: 2 }

  it('web 档案：ct=24，uin/qq 是字符串，authst 注入 musickey', () => {
    const comm = buildComm(credential)
    expect(comm.ct).toBe(24)
    expect(comm.cv).toBe(0)
    expect(comm.uin).toBe('12345')
    expect(comm.qq).toBe('12345')
    expect(comm.authst).toBe('KEY')
    expect(comm.tmeLoginType).toBe(2)
    expect(comm.format).toBe('json')
  })

  it('android 档案：ct=11 + 客户端版本号（写「我喜欢」必须用它）', () => {
    const comm = buildComm(credential, 'android')
    expect(comm.ct).toBe(11)
    expect(comm.cv).toBe(14090008)
    expect(comm.chid).toBe('10003505')
  })

  it('缺 loginType 回退 2（QQ），musicid 缺失时 uin 是空串而不是 undefined', () => {
    expect(buildComm({ musickey: 'K' }).tmeLoginType).toBe(2)
    expect(buildComm({}).uin).toBe('')
  })
})

describe('zzcSign', () => {
  it('形状：zzc 前缀、全小写、不含 base64 的 +/= 字符', () => {
    const sign = zzcSign('{"a":1}')
    expect(sign.startsWith('zzc')).toBe(true)
    expect(sign).toBe(sign.toLowerCase())
    expect(sign).not.toMatch(/[+/=]/)
  })

  it('确定性：同输入同输出，不同输入不同输出', () => {
    expect(zzcSign('{"a":1}')).toBe(zzcSign('{"a":1}'))
    expect(zzcSign('{"a":1}')).not.toBe(zzcSign('{"a":2}'))
  })
})
