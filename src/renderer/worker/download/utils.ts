import { DOWNLOAD_STATUS, QUALITYS } from '@common/constants'
import { filterFileName } from '@common/utils/common'
import { buildLyrics } from './lrcTool'
import fs from 'fs'
import { clipFileNameLength, clipNameLength, formatMusicName } from '@common/utils/tools'
import defaultSetting from '@common/defaultSetting'

/**
 * 保存歌词文件
 */
export const saveLrc = async(lrcData: LX.Music.LyricInfo, info: {
  filePath: string
  format: LX.LyricFormat
  downloadLxlrc: boolean
  downloadTlrc: boolean
  downloadRlrc: boolean
}) => {
  const iconv = (await import('iconv-lite')).default
  const lrc = buildLyrics(lrcData, info.downloadLxlrc, info.downloadTlrc, info.downloadRlrc)
  switch (info.format) {
    case 'gbk':
      fs.writeFile(info.filePath, iconv.encode(lrc, 'gbk', { addBOM: true }), err => {
        if (err) console.log(err)
      })
      break
    case 'utf8':
    default:
      fs.writeFile(info.filePath, iconv.encode(lrc, 'utf8', { addBOM: true }), err => {
        if (err) console.log(err)
      })
      break
  }
}

export const getExt = (type: string): LX.Download.FileExt => {
  switch (type) {
    case 'ape':
      return 'ape'
    case 'flac':
    case 'flac24bit':
      return 'flac'
    case 'wav':
      return 'wav'
    case '128k':
    case '192k':
    case '320k':
    default:
      return 'mp3'
  }
}

/**
 * 获取音乐音质
 * @param musicInfo
 * @param type 请求的档位
 * @param qualityList 当前音源支持的档位表（`qualityList[source]` 的数组顺序有语义，见 api-source-info.ts）
 * @param degradeWhenUnsupported 请求档位不可用时是否按现有逻辑静默降档（`download.degradeWhenUnsupported`，
 *   默认 true = 改造前行为）；为 false 时返回 null —— 「当前档位不可用」，由调用方决定不建任务并提示
 * @returns 实际要用的档位；不可用且不允许降档时返回 null
 */
export const getMusicType = (musicInfo: LX.Music.MusicInfoOnline, type: LX.Quality, qualityList: LX.QualityList, degradeWhenUnsupported = true): LX.Quality | null => {
  const list = qualityList[musicInfo.source]
  if (!list) return degradeWhenUnsupported ? '128k' : null
  if (!list.includes(type)) {
    // 不允许降档时，「请求的档位不在音源支持列表里」本身就是不可用，不拿列表末位兜底
    if (!degradeWhenUnsupported) return null
    type = list[list.length - 1]
  }
  // 允许降档：从请求档位沿 QUALITYS 向下找第一个真有的档；不允许降档：只看请求档位本身
  const rangeType = degradeWhenUnsupported ? QUALITYS.slice(QUALITYS.indexOf(type)) : [type]
  for (const type of rangeType) {
    if (musicInfo.meta._qualitys[type]) return type
  }
  return degradeWhenUnsupported ? '128k' : null
}

/**
 * 按模板渲染下载文件名（含扩展名）。`filterFileName` 与 `clipFileNameLength` 的原有次序与作用都要保住：
 * 先截断（150 字符）再补扩展名，避免把扩展名截掉；非法字符在拼扩展名之前去掉。
 *
 * 模板串是用户可编辑的自由文本（`download.fileNameTemplate`），两条兜底就是它的边界：
 * - 空模板、或渲染完只剩非法字符（被 `filterFileName` 吃空）时回退**默认模板**——否则会落盘成
 *   `.mp3` 这种隐藏文件。手改配置文件才可能走到这里（设置页不落空值）
 * - 判空只看 `trim()` 后的结果，不复写渲染结果：模板两端的空格是用户自己写的，照旧保留
 */
export const createDownloadFileName = (template: string, musicInfo: LX.Music.MusicInfoOnline, ext: LX.Download.FileExt) => {
  const render = (tpl: string) => filterFileName(clipFileNameLength(formatMusicName(tpl, musicInfo.name, clipNameLength(musicInfo.singer))))
  let name = render(template)
  if (!name.trim()) name = render(defaultSetting['download.fileNameTemplate'])
  return `${name}.${ext}`
}

// const checkExistList = (list: LX.Download.ListItem[], musicInfo: LX.Music.MusicInfo, type: LX.Quality, ext: string): boolean => {
//   return list.some(s => s.id === musicInfo.id && (s.metadata.type === type || s.metadata.ext === ext))
// }

/**
 * 创建下载任务信息
 * @param fileNameTemplate 文件名模板（`download.fileNameTemplate`）
 * @param degradeWhenUnsupported 请求档位不可用时是否静默降档（`download.degradeWhenUnsupported`）
 * @returns 请求档位不可用且不允许降档时返回 null（不建任务，由调用方提示；见 `createDownloadTasks`）
 */
export const createDownloadInfo = (musicInfo: LX.Music.MusicInfoOnline, type: LX.Quality, fileNameTemplate: string, qualityList: LX.QualityList, degradeWhenUnsupported = true, listId?: string): LX.Download.ListItem | null => {
  const quality = getMusicType(musicInfo, type, qualityList, degradeWhenUnsupported)
  if (!quality) return null
  const ext = getExt(quality)
  const key = `${musicInfo.id}_${quality}_${ext}`
  // if (checkExistList(list, musicInfo, type, ext)) return null
  const downloadInfo: LX.Download.ListItem = {
    id: key,
    isComplate: false,
    status: DOWNLOAD_STATUS.WAITING,
    statusText: '待下载',
    downloaded: 0,
    total: 0,
    progress: 0,
    speed: '',
    writeQueue: 0,
    metadata: {
      musicInfo,
      url: null,
      // 实际档位（不是请求档位）：URL 缓存与任务 id 都按它算，见 AGENTS §2.6 硬约束 2
      quality,
      ext,
      filePath: '',
      listId,
      fileName: createDownloadFileName(fileNameTemplate, musicInfo, ext),
    },
  }
  // downloadInfo.metadata.filePath = joinPath(savePath, downloadInfo.metadata.fileName)
  // commit('addTask', downloadInfo)

  // 删除同路径下的同名文件
  // TODO
  // void removeFile(downloadInfo.metadata.filePath)
  // .catch(err => {
  //   if (err.code !== 'ENOENT') {
  //     return commit('setStatusText', { downloadInfo, text: '文件删除失败' })
  //   }
  // })

  return downloadInfo
}
