import { describe, expect, it } from 'vitest'
import { mapMusicGene, pickGeneSingerMid } from './gene'

/**
 * 听歌基因整形的钉子（工单 10）。
 *
 * 要守住的两件事：
 *   1. **恒返回全部键**——store 是 `Object.assign(musicGene, …)` 覆盖，少给键会留下上一份数据
 *      （刷新后新数据与旧数据混在一起）。
 *   2. **形状变化只影响降级、不影响稳定性**——富内容的内层键名本轮未复验（见 gene.js 头部），
 *      所以「响应缺字段 / 形状不对」必须落空值而不是抛错或把 `undefined` 带进界面。
 *
 * 样本按**实测路径 + 票面路径**手写（`Genres/Singers[].Base`、`Ages[0].Base`、`StatusIndex.Base`、
 * `DeepseekInterpretation.Cards[]`、`ListeningReport.Report[]`）；它钉的是映射逻辑，
 * 不代表线上形状已被复验——真机复验方法见 gene.js 头部注释。
 */
describe('musicSdk/tx/utils/gene', () => {
  describe('mapMusicGene', () => {
    it('把实测路径上的字段整形成 store 用的形状', () => {
      const gene = mapMusicGene({
        UserInfoCard: { NickName: '昵称', HeadUrl: 'https://avatar' },
        MainDescription: { Description: '一句话画像', Bootstraping: { Title: 'x' } },
        Singers: [{ Base: { Id: 42808, TypeTitle: 'The Piano Guys', Pic: 'https://singer', Slogan: '歌手说明' } }],
        Genres: [{ Base: { Id: '7', TypeTitle: '流行', Pic: 'https://genre', Slogan: '曲风说明' } }],
        Personality: { Base: { TypeTitle: 'INTJ', Slogan: '人格说明' }, Tags: ['标签一', '标签二'] },
        StatusIndex: { Base: { Stress: 62, Lonely: 40 } },
        Ages: [{ Base: { TypeTitle: '音乐年龄', Slogan: '28 岁' } }],
        BPM: { MaxScore: 128, MinScore: 88 },
        Grooving: { Level: '律动感十足' },
        TimePreference: { TypeTitle: '深夜' },
        CharacterColor: '#FF6B6B',
        ListeningReport: { Report: [{ Month: '2026-04', Num: 320 }] },
        DeepseekInterpretation: { Cards: [{ Title: 'AI 卡标题', Content: 'AI 卡正文' }], Tags: ['AI 标签'] },
      })

      expect(gene.nick).toBe('昵称')
      expect(gene.avatar).toBe('https://avatar')
      expect(gene.mainDescription).toBe('一句话画像')

      // 歌手/曲风的 id 是数字 singer_id（**没有 mid**），原样保留为字符串
      expect(gene.singers).toEqual([{ id: '42808', name: 'The Piano Guys', img: 'https://singer', slogan: '歌手说明' }])
      expect(gene.genres).toEqual([{ id: '7', name: '流行', img: 'https://genre', slogan: '曲风说明' }])

      expect(gene.personality).toEqual({ name: 'INTJ', desc: '人格说明' })
      expect(gene.personalityTags).toEqual(['标签一', '标签二'])

      // 对象形态的乐状态：键名（供渲染层查四维文案）与分值都留着，变化量缺失落 0
      expect(gene.status).toEqual([
        { key: 'Stress', name: '', score: 62, delta: 0 },
        { key: 'Lonely', name: '', score: 40, delta: 0 },
      ])

      expect(gene.ages).toEqual([{ name: '音乐年龄', desc: '28 岁' }])
      expect(gene.bpm).toEqual({ max: 128, min: 88 })
      expect(gene.grooving).toEqual({ name: '律动感十足', desc: '' })
      expect(gene.timePreference).toEqual({ name: '深夜', desc: '' })
      expect(gene.characterColor).toEqual({ name: '', color: '#FF6B6B' })
      expect(gene.report).toEqual([{ month: '2026-04', num: 320 }])
      expect(gene.aiCards).toEqual([{ title: 'AI 卡标题', content: 'AI 卡正文' }])
      expect(gene.aiTags).toEqual(['AI 标签'])
    })

    it('变化量与数组形态的乐状态、`Base` 包装都认', () => {
      const gene = mapMusicGene({
        StatusIndex: {
          Base: [
            { TypeTitle: '压力', Score: 62, Delta: 3 },
            { TypeTitle: '孤独', Score: 40, Delta: -2 },
          ],
        },
      })

      expect(gene.status).toEqual([
        { key: '压力', name: '压力', score: 62, delta: 3 },
        { key: '孤独', name: '孤独', score: 40, delta: -2 },
      ])
    })

    it('空响应/缺字段/形状不对：不抛，且每个键都在（否则 store 的 Object.assign 会留下旧值）', () => {
      const empty = mapMusicGene(undefined) as Record<string, unknown>
      expect(Object.keys(empty).sort()).toEqual([
        'ages', 'aiCards', 'aiTags', 'avatar', 'bpm', 'characterColor', 'genres', 'grooving',
        'mainDescription', 'nick', 'personality', 'personalityTags', 'report', 'singers',
        'status', 'timePreference',
      ])
      expect(mapMusicGene(undefined)).toEqual({
        nick: '',
        avatar: '',
        mainDescription: '',
        singers: [],
        genres: [],
        personality: null,
        personalityTags: [],
        status: [],
        ages: [],
        bpm: null,
        grooving: null,
        timePreference: null,
        characterColor: null,
        report: [],
        aiCards: [],
        aiTags: [],
      })

      // 形状不对（本该是数组的给了对象、本该是对象的给了字符串）同样只降级
      expect(mapMusicGene({ Singers: { Base: {} } }).singers).toEqual([])
      expect(mapMusicGene({ Ages: 'oops' }).ages).toEqual([{ name: 'oops', desc: '' }])
      expect(mapMusicGene({ BPM: 'oops' }).bpm).toEqual(null)
      expect(mapMusicGene({ CharacterColor: '白色' }).characterColor).toEqual({ name: '白色', color: '' })
      // 数字色值画不出来 → 不展示（渲染层拿它当 CSS 背景色用）
      expect(mapMusicGene({ CharacterColor: 16711680 }).characterColor).toBe(null)
    })

    it('`MainDescription` 的三种形态都认，解析不出来退回原文（宁可显示原文也别空白）', () => {
      expect(mapMusicGene({ MainDescription: { Description: '对象形态' } }).mainDescription).toBe('对象形态')
      expect(mapMusicGene({ MainDescription: '{"Description":"JSON 字符串形态"}' }).mainDescription).toBe('JSON 字符串形态')
      expect(mapMusicGene({ MainDescription: '裸文本' }).mainDescription).toBe('裸文本')
      expect(mapMusicGene({ MainDescription: null }).mainDescription).toBe('')
    })

    it('人格是数组形态、标签是对象形态时也能取到', () => {
      const gene = mapMusicGene({
        Personality: [{ Base: { TypeTitle: 'ENFP', Slogan: '人格说明' }, Tags: [{ Name: '内向' }, '节奏控'] }],
      })

      expect(gene.personality).toEqual({ name: 'ENFP', desc: '人格说明' })
      expect(gene.personalityTags).toEqual(['内向', '节奏控'])
    })
  })

  describe('pickGeneSingerMid', () => {
    /** `DoSearchForQQMusicDesktop` + `search_type=1` 的 `body.singer.list`（字段名实测）。 */
    const list = [
      { singerID: 111, singerMID: 'other_mid', singerName: '同名的人' },
      { singerID: 42808, singerMID: '001ABC', singerName: 'The Piano Guys' },
      { singerID: '23508811', singerMID: '002DEF', singerName: 'Circle Arena 环形竞技场' },
    ]

    it('按 singerID 精确命中（数字/字符串同值都算）', () => {
      expect(pickGeneSingerMid(list, '42808')).toBe('001ABC')
      expect(pickGeneSingerMid(list, 42808)).toBe('001ABC')
      expect(pickGeneSingerMid(list, '23508811')).toBe('002DEF')
    })

    it('未命中/没有结果/结果形状不对 → 空串（调用方据此显示「跳不了」而不是静默）', () => {
      // 接口/搜索层给回非数组的东西也要能兜住（TS 的 JS 推断把它当 any[]，这里显式放宽）
      const noList: any = null
      expect(pickGeneSingerMid(list, '999')).toBe('')
      expect(pickGeneSingerMid([], '42808')).toBe('')
      expect(pickGeneSingerMid(noList, '42808')).toBe('')
      expect(pickGeneSingerMid(list, '')).toBe('')
      // 命中了 id 但没有 mid（接口变化）也算跳不了
      expect(pickGeneSingerMid([{ singerID: '42808' }], '42808')).toBe('')
    })

    it('只认 id 相等，不拿名字比（重名会跳错人）', () => {
      const sameName = [{ singerID: 222, singerMID: 'wrong_mid', singerName: 'The Piano Guys' }]
      expect(pickGeneSingerMid(sameName, '42808')).toBe('')
    })
  })
})
