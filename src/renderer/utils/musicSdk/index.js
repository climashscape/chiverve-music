import tx from './tx/index'
import { supportQuality } from './api-source'
import { versionChars } from './versionChars'

/**
 * 在线音源注册表 —— **本文件是唯一的源清单**。
 *
 * 本产品只内置 QQ 音乐（tx）一条线，其余平台（kw/kg/wy/mg/bd/xm）的实现已移除。
 * 结构仍按"多源"设计，所以将来加源是个小改动，按 AGENTS.md §3.7 走三步：
 *   1. 新建 `musicSdk/<id>/index.js`，实现源契约（见 AGENTS.md §2.6 契约表：
 *      musicSearch / getMusicUrl / getLyric / getPic / leaderboard / songList /
 *      comment / hotSearch …）
 *   2. 在本文件 import 并挂进 `sources`（`sources.sources` 是清单，平级键是模块）
 *   3. 要能取流的话：`api-source-info.ts` 声明 `supportQualitys`，并把取流实现
 *      注册进 `api-source.js` 的 `allApi`（key = `${apiId}_${source}`）
 * store 与 UI 不用改：它们都按 `music.sources` / `music[source]` 动态取能力。
 */
const sources = {
  sources: [
    {
      name: 'QQ音乐',
      id: 'tx',
    },
  ],
  tx,
}
export default {
  ...sources,
  init() {
    const tasks = []
    for (let source of sources.sources) {
      let sm = sources[source.id]
      sm && sm.init && tasks.push(sm.init())
    }
    return Promise.all(tasks)
  },
  supportQuality,

  async searchMusic({ name, singer, source: s, limit = 25 }) {
    const trimStr = str => typeof str == 'string' ? str.trim() : str
    const musicName = trimStr(name)
    const tasks = []
    const excludeSource = ['xm']
    for (const source of sources.sources) {
      if (!sources[source.id].musicSearch || source.id == s || excludeSource.includes(source.id)) continue
      tasks.push(sources[source.id].musicSearch.search(`${musicName} ${singer || ''}`.trim(), 1, limit).catch(_ => null))
    }
    return (await Promise.all(tasks)).filter(s => s)
  },

  async findMusic({ name, singer, albumName, interval, source: s }) {
    const lists = await this.searchMusic({ name, singer, source: s, limit: 25 })
    // console.log(lists)
    // console.log({ name, singer, albumName, interval, source: s })

    const singersRxp = /、|&|;|；|\/|,|，|\|/
    const sortSingle = singer => singersRxp.test(singer)
      ? singer.split(singersRxp).sort((a, b) => a.localeCompare(b)).join('、')
      : (singer || '')
    const sortMusic = (arr, callback) => {
      const tempResult = []
      for (let i = arr.length - 1; i > -1; i--) {
        const item = arr[i]
        if (callback(item)) {
          delete item.fSinger
          delete item.fMusicName
          delete item.fAlbumName
          delete item.fInterval
          tempResult.push(item)
          arr.splice(i, 1)
        }
      }
      tempResult.reverse()
      return tempResult
    }
    const getIntv = (interval) => {
      if (!interval) return 0
      // if (musicInfo._interval) return musicInfo._interval
      let intvArr = interval.split(':')
      let intv = 0
      let unit = 1
      while (intvArr.length) {
        intv += parseInt(intvArr.pop()) * unit
        unit *= 60
      }
      return intv
    }
    const trimStr = str => typeof str == 'string' ? str.trim() : (str || '')
    const filterStr = str => typeof str == 'string' ? str.replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '') : String(str || '')
    const fMusicName = filterStr(name).toLowerCase()
    const fSinger = filterStr(sortSingle(singer)).toLowerCase()
    const fAlbumName = filterStr(albumName).toLowerCase()
    const fInterval = getIntv(interval)
    const isEqualsInterval = (intv) => Math.abs((fInterval || intv) - (intv || fInterval)) <= 5
    const isEqualsVersionMusicNameChar = (name) => {
      for (const char of versionChars) {
        if (name.includes(char) != fMusicName.includes(char)) return false
      }
      return true
    }
    const isIncludesName = (name) => (fMusicName.includes(name) || name.includes(fMusicName)) && isEqualsVersionMusicNameChar(name)
    const isIncludesSinger = (singer) => fSinger ? (fSinger.includes(singer) || singer.includes(fSinger)) : true
    const isEqualsAlbum = (album) => fAlbumName ? fAlbumName == album : true

    const result = lists.map(source => {
      for (const item of source.list) {
        item.name = trimStr(item.name)
        item.singer = trimStr(item.singer)
        item.fSinger = filterStr(sortSingle(item.singer).toLowerCase())
        item.fMusicName = filterStr(String(item.name ?? '').toLowerCase())
        item.fAlbumName = filterStr(String(item.albumName ?? '').toLowerCase())
        item.fInterval = getIntv(item.interval)
        // console.log(fMusicName, item.fMusicName, item.source)
        if (!isEqualsInterval(item.fInterval)) {
          item.name = null
          continue
        }
        if (item.fMusicName == fMusicName && isIncludesSinger(item.fSinger)) return item
      }
      for (const item of source.list) {
        if (item.name == null) continue
        if (item.fSinger == fSinger && isIncludesName(item.fMusicName)) return item
      }
      for (const item of source.list) {
        if (item.name == null) continue
        if (isEqualsAlbum(item.fAlbumName) && isIncludesSinger(item.fSinger) && isIncludesName(item.fMusicName)) return item
      }
      return null
    }).filter(s => s)
    const newResult = []
    if (result.length) {
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.fMusicName == fMusicName && item.interval == interval))
      newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName && item.fSinger == fSinger && item.fAlbumName == fAlbumName))
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.fMusicName == fMusicName))
      newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName && item.interval == interval))
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.interval == interval))
      newResult.push(...sortMusic(result, item => item.interval == interval))
      newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName))
      newResult.push(...sortMusic(result, item => item.fSinger == fSinger))
      newResult.push(...sortMusic(result, item => item.fAlbumName == fAlbumName))
      for (const item of result) {
        delete item.fSinger
        delete item.fMusicName
        delete item.fAlbumName
        delete item.fInterval
      }
      newResult.push(...result)
    }
    // console.log(newResult)
    return newResult
  },
}
