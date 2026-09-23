import { describe, expect, it } from 'vitest'
import { buildSearchIndex, matchSettingHits, type SearchIndexEntry, type Translate } from './useSettingSearch'
import type { Section } from '@common/settingMetadata'
import zhCn from '@root/lang/zh-cn.json'

/**
 * 设置搜索（票 02 的验收「音量 / 代理 / quality 各能命中并直达」就钉在这里）。
 *
 * 用**真实的中文文案**（`src/lang/zh-cn.json`）跑一遍：这才代表用户实际敲进去的关键词能搜到什么。
 * 另外用一张小型假数据（注入式）把边界跑全：空关键词、大小写、key 命中、同分支去重、上限。
 */

const zhMessages = zhCn as Record<string, string>
const realTranslate: Translate = key => zhMessages[key] ?? key

/** 小假数据：两条节 × 三条分组 × 若干项，用来单独验证匹配/去重规则。 */
const FAKE_SECTIONS: readonly Section[] = [
  {
    id: 'sec_a',
    i18nKey: 'fake__sec_a',
    navGroup: 'general',
    groups: [
      {
        id: 'sec_a_g1',
        i18nKey: 'fake__g1',
        items: [
          { key: 'player.volume' as never, i18nKey: 'fake__volume', control: 'slider' },
          { key: 'player.isMute' as never, i18nKey: 'fake__mute', control: 'checkbox' },
        ],
      },
      {
        id: 'sec_a_g2',
        i18nKey: 'fake__proxy_title',
        items: [],
      },
    ],
  },
  {
    id: 'sec_b',
    i18nKey: 'fake__sec_b',
    navGroup: 'system',
    groups: [
      {
        id: 'sec_b_g1',
        i18nKey: 'fake__g1',
        items: [
          { key: 'network.proxy.host' as never, i18nKey: 'fake__host', control: 'input' },
        ],
      },
    ],
  },
]
const fakeMessages: Record<string, string> = {
  fake__sec_a: '甲节',
  fake__sec_b: '乙节',
  fake__g1: '音量',
  fake__proxy_title: 'HTTP 代理',
  fake__volume: '当前音量：',
  fake__mute: '静音',
  fake__host: '主机',
}
const fakeTranslate: Translate = key => fakeMessages[key] ?? key
const fakeIndex = buildSearchIndex(fakeTranslate, FAKE_SECTIONS)

describe('索引结构', () => {
  it('节 / 组 / 项各一条，顺序就是页面顺序', () => {
    const hits = fakeIndex.map(entry => entry.hit)
    expect(hits.map(hit => hit.sectionId)).toEqual(['sec_a', 'sec_a', 'sec_a', 'sec_a', 'sec_a', 'sec_b', 'sec_b', 'sec_b'])
    expect(hits.map(hit => hit.itemKey)).toEqual([
      null, // sec_a 节级
      null, // sec_a_g1 组级
      'player.volume',
      'player.isMute',
      null, // sec_a_g2 组级（items 为空）
      null, // sec_b 节级
      null, // sec_b_g1 组级
      'network.proxy.host',
    ])
  })

  it('项的 key 也进可搜文本（技术名能搜）', () => {
    const hit = matchSettingHits('network.proxy.host', fakeIndex)
    expect(hit).toEqual([{ sectionId: 'sec_b', sectionI18nKey: 'fake__sec_b', groupId: 'sec_b_g1', groupI18nKey: 'fake__g1', itemKey: 'network.proxy.host', itemI18nKey: 'fake__host' }])
  })
})

describe('匹配口径与去重', () => {
  it('空关键词返回空列表（不是全量）', () => {
    expect(matchSettingHits('', fakeIndex)).toEqual([])
    expect(matchSettingHits('   ', fakeIndex)).toEqual([])
  })

  it('不区分大小写子串', () => {
    const upper = matchSettingHits('VOLUME', fakeIndex)
    expect(upper.map(hit => hit.itemKey)).toEqual(['player.volume'])
    expect(matchSettingHits('volume', fakeIndex)).toEqual(upper)
  })

  it('同分支只留最深一条：项命中压掉它的分组与节', () => {
    const hits = matchSettingHits('音量', fakeIndex)
    // sec_a_g1 的 player.volume（文案「当前音量：」）是项命中 → 压掉 sec_a_g1 的组级与 sec_a 的节级；
    // sec_b_g1 的组标题也叫「音量」但没有项命中，所以留在组级（两个节互不影响）。
    expect(hits.map(hit => [hit.sectionId, hit.groupId, hit.itemKey])).toEqual([
      ['sec_a', 'sec_a_g1', 'player.volume'],
      ['sec_b', 'sec_b_g1', null],
    ])
  })

  it('只有组标题命中时给组级命中（items 为空的分组也能搜到）', () => {
    expect(matchSettingHits('代理', fakeIndex)).toEqual([
      { sectionId: 'sec_a', sectionI18nKey: 'fake__sec_a', groupId: 'sec_a_g2', groupI18nKey: 'fake__proxy_title', itemKey: null, itemI18nKey: null },
    ])
  })

  it('可搜文本里的技术名能命中项（key 里带 proxy 的那条）', () => {
    expect(matchSettingHits('proxy', fakeIndex)).toEqual([
      { sectionId: 'sec_b', sectionI18nKey: 'fake__sec_b', groupId: 'sec_b_g1', groupI18nKey: 'fake__g1', itemKey: 'network.proxy.host', itemI18nKey: 'fake__host' },
    ])
  })

  it('只有节名命中时给节级命中', () => {
    expect(matchSettingHits('甲节', fakeIndex)).toEqual([
      { sectionId: 'sec_a', sectionI18nKey: 'fake__sec_a', groupId: null, groupI18nKey: null, itemKey: null, itemI18nKey: null },
    ])
  })

  it('结果条数有上限', () => {
    const many: SearchIndexEntry[] = Array.from({ length: 80 }, (_, index) => ({
      hit: {
        sectionId: `sec_${index}`,
        sectionI18nKey: 'x',
        groupId: `g_${index}`,
        groupI18nKey: 'x',
        itemKey: `k_${index}`,
        itemI18nKey: 'x',
      },
      haystack: 'hit me',
    }))
    expect(matchSettingHits('hit', many)).toHaveLength(50)
    expect(matchSettingHits('hit', many, 3)).toHaveLength(3)
  })
})

describe('真实文案（zh-cn）下的三条验收关键词', () => {
  const index = buildSearchIndex(realTranslate)

  it('「音量」命中音量滑杆（浮层 key，播放节 · 播放控制默认值）', () => {
    const hits = matchSettingHits('音量', index)
    expect(hits).toContainEqual({
      sectionId: 'play',
      sectionI18nKey: 'setting__play',
      groupId: 'play_defaults',
      groupI18nKey: 'setting__play_defaults_title',
      itemKey: 'player.volume',
      itemI18nKey: 'player__volume',
    })
  })

  it('「代理」命中网络节的 HTTP 代理分组', () => {
    const hits = matchSettingHits('代理', index)
    expect(hits).toContainEqual({
      sectionId: 'network',
      sectionI18nKey: 'setting__network',
      groupId: 'network_proxy',
      groupI18nKey: 'setting__network_proxy_title',
      itemKey: null,
      itemI18nKey: null,
    })
  })

  it('「quality」靠 key 命中音质项（技术名能搜）', () => {
    const hits = matchSettingHits('quality', index)
    expect(hits).toContainEqual({
      sectionId: 'play',
      sectionI18nKey: 'setting__play',
      groupId: 'play_quality',
      groupI18nKey: 'setting__play_quality_title',
      itemKey: 'player.playQuality',
      itemI18nKey: 'setting__play_playQuality',
    })
  })

  it('四语里都有这几条文案（key 参与匹配，但文案不能是原样 key）', () => {
    for (const key of ['player__volume', 'setting__network_proxy_title', 'setting__play_quality_title']) {
      expect(zhMessages[key], key).toBeTruthy()
      expect(zhMessages[key]).not.toBe(key)
    }
  })
})
