import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { i18nPlugin } from '@renderer/plugins/i18n'
import { setLanguage } from '@root/lang'
import enUs from '@root/lang/en-us.json'
import { isShowLoginModal, loginState, qrcode } from '@renderer/store/qqAuth/state'
import QqLoginModal from './QqLoginModal.vue'

/**
 * 登录二维码的**替代文本**要走 i18n（2026-09-26 复核的缺陷 7）。
 *
 * 原来 `alt="QQ 登录二维码"` 是硬编码中文：英文 / 韩文界面下读屏器与图片兜底文案都是中文。
 * 判据取**换语言**：切到 `en-us` 后 alt 必须跟着变——硬编码串不随语言变，所以这条是有效钉子
 * （只跟 `zh-cn` 的值比是假绿：两者字面量恰好一样）。
 *
 * 颜色那条（`.qrPlaceholder` 的 `#bbb`）是纯样式，无法用测试钉，改为在源码里补「为什么不能用
 * token」的注释——二维码块被强制白底（深色主题也要能扫），
 * 主题 token 在这块白底上的对比度不可控（深色主题的 `--color-font` 在白底上几乎看不见）。
 */
/** `material-modal` 替身：真件 teleport 到 `#root`，jsdom 里没有那个锚点（同其它弹窗用例的口径） */
const materialModalStub = {
  props: { show: { type: Boolean, default: false } },
  template: '<div v-if="show"><slot /></div>',
}

const mountModal = () => mount(QqLoginModal, {
  global: {
    plugins: [i18nPlugin],
    stubs: {
      'material-modal': materialModalStub,
      'base-btn': { template: '<button><slot /></button>' },
    },
  },
})

afterEach(() => {
  setLanguage('zh-cn')
  isShowLoginModal.value = false
  qrcode.value = ''
  loginState.value = 'idle'
})

describe('QqLoginModal：二维码的替代文本', () => {
  it('alt 跟随当前语言（en-us 下不是中文）', () => {
    isShowLoginModal.value = true
    qrcode.value = 'data:image/png;base64,xxx'

    setLanguage('en-us')
    const wrapper = mountModal()

    expect(wrapper.get('img').attributes('alt')).toBe(enUs.qq_auth__qrcode_alt)
    expect(wrapper.get('img').attributes('alt')).not.toBe('QQ 登录二维码')
  })

  it('没有二维码时不出 img（占位符只在有图时才是「图」）', () => {
    isShowLoginModal.value = true
    qrcode.value = ''

    const wrapper = mountModal()

    expect(wrapper.find('img').exists()).toBe(false)
  })
})
