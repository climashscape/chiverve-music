import { httpFetch } from '../../request'

/**
 * 搜索联想（smartbox）。
 *
 * 端点就是 Python 侧 `search.quick_search` 的同一个
 * `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg`，响应形状：
 *
 *   `{ code: 0, subcode: 0, data: { song: { itemlist: [{ name, singer, mid, id }] },
 *      singer/album/mv: {...} } }`
 *
 * 三条实测结论（2026-09-22 真机核对）：
 *   1. `data.song.itemlist` 的每一项都有 `name` + `singer`，拼成 `歌名 - 歌手`
 *      正好是联想列表要的字符串（这也是上游 wy 源同款做法）。
 *   2. 这个端点返回的 `Content-Type` 是 `text/html`，**不是** JSON——能拿到对象全靠
 *      `utils/request.js` 里 `request()` 包装层的 `JSON.parse(resp.raw)`（:50-52，
 *      needle 自己按 content-type 选解析器，text/html 不会自动解析）。所以这里
 *      **不能**绕开 httpFetch 自己发请求。
 *   3. `code=0` 但某类目为空是常态（比如搜不到歌手），`data.song.itemlist` 可能缺失，
 *      取列表前必须判空——原实现直接 `.map` 会抛 TypeError，联想框直接没有候选。
 *
 * 取消：`requestObj` 一直是同一个对象（被 `cancelTipSearch` 转发 cancelHttp），
 * 与 `musicSearch` / `songList` 的写法一致。
 */
export default {
  successCode: 0,
  requestObj: null,
  tipSearch(str) {
    this.cancelTipSearch()
    this.requestObj = httpFetch(`https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?is_xml=0&format=json&key=${encodeURIComponent(str)}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`, {
      headers: {
        Referer: 'https://y.qq.com/portal/player.html',
      },
    })
    return this.requestObj.promise.then(({ statusCode, body }) => {
      if (statusCode != 200 || body.code != this.successCode) return Promise.reject(new Error('请求失败'))
      return body.data
    })
  },
  handleResult(rawData) {
    if (!Array.isArray(rawData)) return []
    return rawData
      .map(info => {
        const name = String(info?.name ?? '').trim()
        const singer = String(info?.singer ?? '').trim()
        if (!name && !singer) return ''
        // 没有歌手时别留一个孤零零的 ' - '
        return singer ? `${name} - ${singer}` : name
      })
      .filter(name => name !== '')
  },
  cancelTipSearch() {
    if (this.requestObj && this.requestObj.cancelHttp) this.requestObj.cancelHttp()
  },
  async search(str) {
    const data = await this.tipSearch(str)
    return this.handleResult(data?.song?.itemlist)
  },
}
