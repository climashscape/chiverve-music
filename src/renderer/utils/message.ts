export const requestMsg = {
  fail: '请求异常😮，可以多试几次，若还是不行就换一首吧。。。',
  unachievable: '哦No😱...接口无法访问了！',
  timeout: '请求超时',
  // unachievable: '哦No😱...接口无法访问了！已帮你切换到临时接口，重试下看能不能播放吧~',
  notConnectNetwork: '无法连接到服务器',
  cancelRequest: '取消http请求',
  tooManyRequests: '服务器繁忙',
  /**
   * 所有档位都问过、服务端一个直链都没给（无版权 / 已下架 / 给不出地址）。
   * ⚠️ 这是**「这首歌不可播」的判据**：只有它会被 `core/music/unavailable.ts` 登记成失效曲，
   * 别的失败形态（网络、限流、未登录、权限不足）都不算——别把它的措辞改成泛化文案。
   */
  noPlayableUrl: '该歌曲没有可用的播放地址',
  /** 服务端明确说「无权限」（`result=104003`）：可能是会员 / 等级 / 数字专辑未购买，不是失效曲 */
  noPermission: 'QQ 音乐没有该歌曲的播放权限（可能需要会员或购买）',
} as const
