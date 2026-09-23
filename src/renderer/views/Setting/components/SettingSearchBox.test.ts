import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SettingSearchBox from './SettingSearchBox.vue'
import { buildSearchIndex, matchSettingHits } from '../useSettingSearch'
import zhCn from '@root/lang/zh-cn.json'

/**
 * 搜索框的渲染冒烟测试（票 02 的「搜索命中直达」「无结果空态」「能清空」验收）。
 *
 * 命中数据走真实链路（`buildSearchIndex` + `matchSettingHits` + zh-cn 文案），
 * 这样「音量」这类验收关键词是端到端跑出来的，不是手搓的 hit。
 */
const t = (key: keyof typeof zhCn) => zhCn[key]
const index = buildSearchIndex(key => zhCn[key as keyof typeof zhCn] ?? key)

const mountBox = (keyword: string) => {
  const hits = matchSettingHits(keyword, index)
  const wrapper = mount(SettingSearchBox, {
    props: { keyword, hits },
    global: {
      stubs: {
        // base-input 是全局注册的基础控件，这里只需能接收 model-value 并渲染一个 input
        'base-input': { template: '<input />', props: ['modelValue', 'placeholder'] },
      },
    },
  })
  return { wrapper, hits }
}

describe('SettingSearchBox', () => {
  it('没输入时不显示结果区（没输入 ≠ 无结果）', () => {
    const { wrapper } = mountBox('')
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.text()).not.toContain(t('setting__search_no_result'))
  })

  it('命中时按「节 › 分组 › 项」渲染路径', () => {
    const { wrapper, hits } = mountBox('音量')
    const buttons = wrapper.findAll('button')
    // 第一个 button 是清空按钮（有输入才渲染），结果项在它后面
    expect(buttons.length).toBe(hits.length + 1)
    expect(wrapper.text()).toContain(`${t('setting__play')} › ${t('setting__play_defaults_title')} › ${t('player__volume')}`)
  })

  it('无命中时显示空态文案', () => {
    const { wrapper, hits } = mountBox('这个词肯定搜不到xyz')
    expect(hits).toHaveLength(0)
    expect(wrapper.text()).toContain(t('setting__search_no_result'))
  })

  it('点结果抛出 select（带上完整命中，供上层切节 + 定位）', async() => {
    const { wrapper, hits } = mountBox('quality')
    const resultButton = wrapper.findAll('button').find(button => button.text().includes(t('setting__play_playQuality')))
    expect(resultButton, '找不到音质结果项').toBeTruthy()
    await resultButton!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[hits[0]]])
  })

  it('点清空按钮抛 update:keyword 空串（搜索框自己能清）', async() => {
    const { wrapper } = mountBox('音量')
    const clearButton = wrapper.findAll('button')[0]
    expect(clearButton.attributes('aria-label')).toBe(t('setting__search_clear'))
    await clearButton.trigger('click')
    expect(wrapper.emitted('update:keyword')).toEqual([['']])
  })
})
