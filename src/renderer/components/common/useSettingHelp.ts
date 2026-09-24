import { ref } from '@common/utils/vueTools'

/**
 * 设置页 `?` 帮助弹窗的共享状态（模块级单例，2026-09-24 用户裁定：`?` 从「只有悬停提示」改成「点击弹窗」）。
 *
 * 为什么是单例而不是每个 `?` 自带一份 `show`：设置页有 60+ 个帮助入口，各自持有状态时
 * 点开第二个不会关掉第一个（**多开是 bug**），也会给每个入口挂一份弹窗实例。这里只留一份状态，
 * 弹窗本体也只挂一份（`views/Setting/index.vue` 根部）。
 *
 * 三个 ref 单独导出（而不是塞进一个对象）：`setup()` 只对**顶层**返回的 ref 做模板解包，
 * 包一层之后模板里拿到的是 Ref 对象本身。
 *
 * 文案由调用点传入而不是在这里查表：只有调用点知道自己那条 `helpI18nKey`
 * （含 `v-for` 里的动态 key），弹窗只管把传进来的两句显示出来。
 */
export const helpText = ref('')
/** 弹窗标题 = 该项的设置项名；调用点没给时弹窗退到「帮助」（见 SettingHelpModal） */
export const helpLabel = ref('')
export const helpVisible = ref(false)

export const openSettingHelp = (text: string, label = '') => {
  helpText.value = text
  helpLabel.value = label
  helpVisible.value = true
}

export const closeSettingHelp = () => {
  helpVisible.value = false
}
