import { describe, expect, it } from 'vitest'
import { parseSongSpec, readWriteResult, resolvePlaylist } from './playlist.mjs'

describe('readWriteResult（防假成功判读，工单 09 的真机案例）', () => {
  it('code 与 retCode 双 0 才成功', () => {
    expect(readWriteResult({ code: 0, data: { retCode: 0 } }).ok).toBe(true)
    expect(readWriteResult({ code: '0', data: { retCode: '0' } }).ok).toBe(true)
  })

  it('2026-09-24 假成功形态：模块级 80105 + retCode 0 必须判失败', () => {
    const result = readWriteResult({ code: 80105, data: { retCode: 0 } })
    expect(result.ok).toBe(false)
    expect(result.code).toBe(80105)
    expect(result.retCode).toBe(0)
  })

  it('retCode 80092（幂等边界）不豁免——宁可报错不静默宣布成功', () => {
    expect(readWriteResult({ code: 0, data: { retCode: 80092 } }).ok).toBe(false)
  })

  it('缺字段算缺失（null/空串），畸形响应不得读成成功', () => {
    expect(readWriteResult({}).ok).toBe(false)
    expect(readWriteResult({}).code).toBeNull()
    expect(readWriteResult({ code: null, data: { retCode: '' } }).ok).toBe(false)
    expect(readWriteResult(null).ok).toBe(false)
  })
})

describe('parseSongSpec', () => {
  it('songId 或 songId:songType', () => {
    expect(parseSongSpec('769125')).toEqual({ songId: 769125, songType: 0 })
    expect(parseSongSpec(' 769125:13 ')).toEqual({ songId: 769125, songType: 13 })
  })

  it('非数字/负数/多余段拒绝', () => {
    expect(() => parseSongSpec('abc')).toThrow()
    expect(() => parseSongSpec('-1')).toThrow()
    expect(() => parseSongSpec('1:2:3')).toThrow()
    expect(() => parseSongSpec('')).toThrow()
  })
})

describe('resolvePlaylist 三形态', () => {
  const rows = [
    { dirId: 201, tid: 3802852742, name: '我喜欢', songNum: 1 },
    { dirId: 125, tid: 9782416691, name: '2026大运河音乐节', songNum: 28 },
  ]

  it('tid / dirId / 名称（trim）都能唯一定位', () => {
    expect(resolvePlaylist(rows, '9782416691')).toMatchObject({ dirId: 125 })
    expect(resolvePlaylist(rows, '125')).toMatchObject({ name: '2026大运河音乐节' })
    expect(resolvePlaylist(rows, ' 2026大运河音乐节 ')).toMatchObject({ dirId: 125 })
  })

  it('重名报错列出全部候选；找不到也报错（写操作不允许猜目标）', () => {
    const dup = [...rows, { dirId: 9, tid: 9, name: '我喜欢', songNum: 0 }]
    expect(() => resolvePlaylist(dup, '我喜欢')).toThrow(/不唯一/)
    expect(() => resolvePlaylist(rows, '不存在的歌单')).toThrow(/找不到/)
  })

  it('非整数引用（含负号、空串）不按数字匹配，按名称走', () => {
    expect(() => resolvePlaylist(rows, '-1')).toThrow(/找不到/)
    expect(() => resolvePlaylist(rows, '')).toThrow(/找不到/)
  })
})
