import { getLocalMusicFileLyric, getLocalMusicFilePic } from '@renderer/utils/music'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { checkPath } from '@common/utils/nodejs'

const getTempDir = async() => {
  // 解出的歌词/封面中转目录。名字 2026-09-24 从上游的 `lxmusic_temp` 换成本产品的——
  // 它是全仓唯一拿上游名字当**文件系统路径**的地方，装过上游版时两边会共用同一个 /tmp 子目录。
  // 换名只影响中转：老目录里残留的临时文件不会被清理，但也没有别的引用方。
  const tempDir = path.join(os.tmpdir(), 'chiverve-music_temp')
  if (!await checkPath(tempDir)) {
    await fs.mkdir(tempDir, { recursive: true })
  }
  return tempDir
}

export const getMusicFilePic = async(filePath: string) => {
  const picture = await getLocalMusicFilePic(filePath)
  if (!picture) return ''
  if (typeof picture == 'string') return picture
  if (picture.data.length > 400_000) {
    try {
      const tempDir = await getTempDir()
      const tempFile = path.join(tempDir, path.basename(filePath) + '.' + picture.format.split('/')[1])
      await fs.writeFile(tempFile, picture.data)
      return tempFile
    } catch (err) {
      console.log(err)
    }
  }
  return `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
}

export const parseLyric = (lrc: string): LX.Music.LyricInfo => {
  const verifyAwlrc = (lrc: string) => {
    return /(?:^|\s*)\[\d+:\d+(?:\.\d+)]<\d+,\d+>.+$/m.test(lrc)
  }
  const verifylrc = (lrc: string) => {
    return /(?:^|\s*)\[\d+:\d+(?:\.\d+)].+$/m.test(lrc)
  }
  const lrcTags = {
    awlrc: {
      name: 'lxlyric',
      verify: verifyAwlrc,
    },
    lrc: {
      name: 'lyric',
      verify: verifylrc,
    },
    tlrc: {
      name: 'tlyric',
      verify: verifylrc,
    },
    rlrc: {
      name: 'rlyric',
      verify: verifylrc,
    },
  } as const
  const tagRxp = /(?:^|\n\s*)\[awlrc:([^\]]+)]/i
  const lrcRxp = /^(lrc|awlrc|tlrc|rlrc):([^,]+)$/i
  const parse = (content: string) => {
    const lyricInfo: Partial<LX.Music.LyricInfo> = {}
    const lrcs = content.trim().split(',')
    for (const lrc of lrcs) {
      const result = lrcRxp.exec(lrc.trim())
      if (!result) continue
      const target = lrcTags[result[1].toLowerCase() as 'tlrc' | 'rlrc' | 'lrc' | 'awlrc']
      if (!target) continue
      const data = Buffer.from(result[2], 'base64').toString('utf-8').trim()
      if (target.verify(data)) lyricInfo[target.name] = data
    }
    return lyricInfo
  }
  let parsedInfo: Partial<LX.Music.LyricInfo> = {}
  let lyric = lrc.replace(tagRxp, (_: string, p1: string) => {
    parsedInfo = parse(p1)
    return ''
  }).trim()
  return { lyric, ...parsedInfo }
}


export const getMusicFileLyric = async(filePath: string): Promise<LX.Music.LyricInfo | null> => {
  const lyric = await getLocalMusicFileLyric(filePath)
  if (!lyric) return null
  return parseLyric(lyric.lyric)
}
