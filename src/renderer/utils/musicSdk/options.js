export const bHh = '624868746c'

export const headers = {
  // 请求头不得表明「第三方客户端」身份：参考实现（QQMusicApi）对 WEB 档案用普通浏览器 UA、
  // 对 ANDROID 档案用 `QQMusic <版本>(android <版本>)`，从不自报家门。
  // 本文件目前只被已弃用的 api-test.js 用；真正在跑的 tx 层用自己的 UA
  // （tx/utils/request.js 的 `QQMusic 14090508(android 12)`，musics.fcg 签名通道要求）。
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  [bHh]: [bHh],
}


export const timeout = 15000
