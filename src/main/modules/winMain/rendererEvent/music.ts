import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { mainHandle } from '@common/mainIpc'


export default () => {
  // =========================歌词=========================
  mainHandle<string, LX.Player.LyricInfo>(WIN_MAIN_RENDERER_EVENT_NAME.get_palyer_lyric, async({ params: id }) => {
    // return (getStore(LRC_EDITED, true, false).get(id) as LX.Music.LyricInfo | undefined) ??
    // getStore(LRC_RAW, true, false).get(id, {}) as LX.Music.LyricInfo
    return global.lx.worker.dbService.getPlayerLyric(id)
  })

  // 原始歌词
  mainHandle<string, LX.Music.LyricInfo>(WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_raw, async({ params: id }) => {
    return global.lx.worker.dbService.getRawLyric(id)
  })
  mainHandle<LX.Music.LyricInfoSave>(WIN_MAIN_RENDERER_EVENT_NAME.save_lyric_raw, async({ params: { id, lyrics } }) => {
    await global.lx.worker.dbService.rawLyricAdd(id, lyrics)
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.clear_lyric_raw, async() => {
    await global.lx.worker.dbService.rawLyricClear()
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_raw_count, async() => {
    return global.lx.worker.dbService.rawLyricCount()
  })

  // 已编辑的歌词
  mainHandle<string, LX.Music.LyricInfo>(WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_edited, async({ params: id }) => {
    return global.lx.worker.dbService.getEditedLyric(id)
  })
  mainHandle<LX.Music.LyricInfoSave>(WIN_MAIN_RENDERER_EVENT_NAME.save_lyric_edited, async({ params: { id, lyrics } }) => {
    await global.lx.worker.dbService.editedLyricUpdateAddAndUpdate(id, lyrics)
  })
  mainHandle<string>(WIN_MAIN_RENDERER_EVENT_NAME.remove_lyric_edited, async({ params: id }) => {
    await global.lx.worker.dbService.editedLyricRemove([id])
  })
  mainHandle<string>(WIN_MAIN_RENDERER_EVENT_NAME.clear_lyric_edited, async() => {
    await global.lx.worker.dbService.editedLyricClear()
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.get_lyric_edited_count, async() => {
    return global.lx.worker.dbService.editedLyricCount()
  })


  // =========================歌曲URL=========================
  mainHandle<string, string>(WIN_MAIN_RENDERER_EVENT_NAME.get_music_url, async({ params: id }) => {
    return (await global.lx.worker.dbService.getMusicUrl(id)) ?? ''
  })
  mainHandle<LX.Music.MusicUrlInfo>(WIN_MAIN_RENDERER_EVENT_NAME.save_music_url, async({ params: { id, url } }) => {
    await global.lx.worker.dbService.musicUrlSave([{ id, url }])
  })
  // 按 id 精确删（票 08）：渲染侧判定缓存里那条 URL 已失效（刷新取流前）时删掉它，别留着被下次命中。
  // 回收时的批量删不走这里（worker 内部直接调 dbHelper）。
  mainHandle<string[]>(WIN_MAIN_RENDERER_EVENT_NAME.remove_music_url, async({ params: ids }) => {
    await global.lx.worker.dbService.musicUrlRemove(ids)
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.clear_music_url, async() => {
    await global.lx.worker.dbService.musicUrlClear()
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.get_music_url_count, async() => {
    return global.lx.worker.dbService.musicUrlCount()
  })
  // 按保留天数 / 容量上限回收（票 08）。这个通道会在**播放中**被设置页调用（「立即回收」），
  // 所以 `keepIdPrefix`（正在播放那首歌的缓存 key 前缀）由渲染侧给，worker 侧保证命中的行一条都不删。
  mainHandle<LX.Music.MusicUrlRecycleOptions, LX.Music.MusicUrlRecycleResult>(WIN_MAIN_RENDERER_EVENT_NAME.recycle_music_url, async({ params }) => {
    return global.lx.worker.dbService.musicUrlRecycle(params)
  })

  // =========================换源歌曲=========================
  mainHandle<string, LX.Music.MusicInfoOnline[]>(WIN_MAIN_RENDERER_EVENT_NAME.get_other_source, async({ params: id }) => {
    return global.lx.worker.dbService.getMusicInfoOtherSource(id)
  })
  mainHandle<LX.Music.MusicInfoOtherSourceSave>(WIN_MAIN_RENDERER_EVENT_NAME.save_other_source, async({ params: { id, list } }) => {
    await global.lx.worker.dbService.musicInfoOtherSourceAdd(id, list)
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.clear_other_source, async() => {
    await global.lx.worker.dbService.musicInfoOtherSourceClear()
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.get_other_source_count, async() => {
    return global.lx.worker.dbService.musicInfoOtherSourceCount()
  })

  // mainHandle<string[]>(WIN_MAIN_RENDERER_EVENT_NAME.remove_dislike_music_infos, async({ params: ids }) => {
  //   await global.lx.worker.dbService.dislikeInfoRemove(ids)
  // })
  // mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.clear_dislike_music_infos, async() => {
  //   await global.lx.worker.dbService.dislikeInfoClear()
  // })


  // =========================我的列表=========================
  // mainHandle<boolean>(WIN_MAIN_RENDERER_EVENT_NAME.get_playlist, async({ params: isIgnoredError = false }) => {
  //   const electronStore_list = getStore('playList', isIgnoredError, false)

  //   return {
  //     defaultList: electronStore_list.get('defaultList'),
  //     loveList: electronStore_list.get('loveList'),
  //     tempList: electronStore_list.get('tempList'),
  //     userList: electronStore_list.get('userList'),
  //     downloadList: getStore('downloadList').get('list'),
  //   }
  // })

  // const handleSaveList = ({ defaultList, loveList, userList, tempList }: Partial<LX.List.MyAllList>) => {
  //   let data: Partial<LX.List.MyAllList> = {}
  //   if (defaultList != null) data.defaultList = defaultList
  //   if (loveList != null) data.loveList = loveList
  //   if (userList != null) data.userList = userList
  //   if (tempList != null) data.tempList = tempList
  //   getStore('playList').set(data)
  // }
  // mainOn<LX.List.ListSaveInfo>(WIN_MAIN_RENDERER_EVENT_NAME.save_playlist, ({ params }) => {
  //   switch (params.type) {
  //     case 'myList':
  //       handleSaveList(params.data)
  //       global.lx.event_app.save_my_list(params.data)
  //       break
  //     case 'downloadList':
  //       getStore('downloadList').set('list', params.data)
  //       break
  //   }
  // })
}
