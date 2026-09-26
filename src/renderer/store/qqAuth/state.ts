import { ref, reactive } from '@common/utils/vueTools'

/**
 * QQ 账号相关的前端状态。
 *
 * 与 M1 的凭证层分工：**凭证值不在渲染侧保存**（只有主进程持有）。
 * 这里只放界面需要的状态：脱敏后的账号、过期倒计时、以及登录弹窗的交互状态。
 */

/** 主进程推来的登录状态（见 LX.QQAuth.Status，已脱敏、不含任何密钥） */
export const status = reactive<LX.QQAuth.Status>({
  isLogin: false,
  musicidMasked: null,
  expiresAt: null,
  expiresInSeconds: null,
  lastRefreshError: null,
})

/** 登录弹窗是否可见（全局单例，挂在 App.vue） */
export const isShowLoginModal = ref(false)

/** 二维码 data URL，直接给 <img src> 用 */
export const qrcode = ref('')

/** 二维码生成时间，供界面显示失效提示（QQ 二维码约 2 分钟失效） */
export const qrCreatedAt = ref(0)

/** 登录进行中的状态；'idle' 表示尚未开始 */
export const loginState = ref<'idle' | LX.QQAuth.LoginEvent>('idle')

/** 登录过程中的错误文案 */
export const loginError = ref('')

/** 凭证刷新中（界面按钮禁用用） */
export const isRefreshing = ref(false)
