declare namespace LX {
  namespace DBService {

    interface MusicInfo {
      id: string
      listId: string
      name: string
      singer: string
      interval: string | null
      source: LX.Music.MusicInfo['source']
      meta: string
      order: number
    }

    interface MusicInfoOrder {
      listId: string
      musicInfoId: string
      order: number
    }

    interface MusicInfoQuery {
      listId: string
    }

    interface MusicInfoRemove {
      listId: string
      id: string
    }

    interface ListMusicInfoQuery {
      listId: string
      musicInfoId: string
    }

    interface UserListInfo {
      id: string
      name: string
      source?: LX.OnlineSource
      sourceListId?: string
      position: number
      locationUpdateTime: number | null
    }

    type Lyricnfo = {
      id: string
      type: 'lyric'
      text: string
      source: 'raw' | 'edited'
    } | {
      id: string
      type: keyof Omit<LX.Music.LyricInfo, 'lyric'>
      text: string | null
      source: 'raw' | 'edited'
    }

    interface MusicUrlInfo {
      id: string
      url: string
    }

    /**
     * `music_url` 表里要写入的一行。`createdAt` 由 worker 在插入时统一打时间戳
     * （渲染侧只传 id + url）：它是回收判过期 / 比新旧的依据，见 `tables.ts` 与
     * `modules/music_url/recycle.ts`。
     */
    interface MusicUrlRow extends MusicUrlInfo {
      createdAt: number
    }

    /**
     * 回收用的「挑行视图」（`SELECT id, created_at, LENGTH(id)+LENGTH(url)`）：
     * 故意不含 `url` 本身——回收只按时间与占用挑行，URL 有几万条时不该读进内存。
     */
    interface MusicUrlCacheRow {
      id: string
      /** 写入时间戳（ms）；`0` = 加列之前写的历史行（未知时间），回收时按「最旧」处理 */
      createdAt: number
      /** 近似占用（字符数，见 `statements.ts` 的 `createRecycleQueryStatement`） */
      bytes: number
    }

    interface DownloadMusicInfo {
      id: string
      isComplate: 0 | 1
      status: LX.Download.DownloadTaskStatus
      statusText: string
      progress_downloaded: number
      progress_total: number
      url: string | null
      quality: LX.Quality
      ext: LX.Download.FileExt
      fileName: string
      filePath: string
      musicInfo: string
      position: number
    }

    interface DislikeInfo {
      // type: 'music'
      content: string
      // meta: string | null
    }

    interface MusicInfoOtherSource extends Omit<MusicInfoOnline, 'listId'> {
      source_id: string
      order: number
    }

  }
}
