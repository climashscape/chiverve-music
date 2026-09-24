import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SvgIcon from '@renderer/plugins/SvgIcon/SvgIcon.vue'
import PlaylistCover from './PlaylistCover.vue'

/**
 * 左栏行首封面的兜底（工单 07）。
 *
 * 只断言渲染结果：有没有 `<img>`、`<img>` 指向谁、占位图标在不在（同 `SvgIcon.test.ts` 口径，
 * 不碰 CSS Modules 类名）。**尺寸**（26px / 圆角 / 底色）是布局问题，用真 Chromium 的几何探针量，
 * jsdom 没有布局引擎、量不出像素。
 */
const mountCover = (src?: string) => mount(PlaylistCover, {
  props: { src },
  global: { components: { 'svg-icon': SvgIcon } },
})

// 占位图标的判据：`use` 序列化出来带 `xlink:href="#icon-music"`。
// 不能读 `attributes('xlink:href')`——它在 xlink 命名空间里，jsdom 下取不到（同 SvgIcon.test.ts）
const isPlaceholderIcon = (wrapper: ReturnType<typeof mountCover>) =>
  wrapper.find('use').element.outerHTML.includes('xlink:href="#icon-music"')

describe('views/Playlists/components/PlaylistRail/PlaylistCover.vue', () => {
  it('没给 src（本地自建列表）→ 只渲染占位图标，不渲染 img', () => {
    const wrapper = mountCover()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(isPlaceholderIcon(wrapper)).toBe(true)
  })

  it('给了 src → 渲染指向它的 img，占位图标仍垫在底层', () => {
    const wrapper = mountCover('https://example.com/cover.jpg')
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/cover.jpg')
    // 兜底图标不是 v-else：加载失败时靠它露出来，所以两种状态都在 DOM 里
    expect(isPlaceholderIcon(wrapper)).toBe(true)
  })

  it('图片加载失败 → 摘掉 img（不留破图），占位图标接管', async() => {
    const wrapper = mountCover('https://example.com/404.jpg')
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(isPlaceholderIcon(wrapper)).toBe(true)
  })

  it('src 换了（歌单刷新后换了封面）→ 重新给一次机会，不永久停在占位图', async() => {
    const wrapper = mountCover('https://example.com/404.jpg')
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)

    await wrapper.setProps({ src: 'https://example.com/new.jpg' })
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/new.jpg')
  })
})
