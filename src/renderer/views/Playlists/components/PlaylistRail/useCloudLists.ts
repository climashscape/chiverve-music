import { computed, nextTick, ref, watch, type Ref } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { createdLists, isInited, labels as userLabels } from '@renderer/store/user/state'
import { createCloudList, initUserCenter, removeCloudList } from '@renderer/store/user/action'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import type { PlaylistCard } from '@renderer/store/user/state'
import { resolveCloudSelection } from './cloudSelection'

/** 「我喜欢」在「我的收藏」页里，不在这里重复（与原来的注释同口径）。 */
const I_LIKE_DIR_ID = '201'

/**
 * 我的歌单 →「QQ 音乐·歌单」tab 左栏的取数（工单 09）。
 *
 * 与原 `PlaylistRail.vue` 的云端半段一致：只放开已实现的能力（建 / 删），重命名、排序、
 * 导入导出不出现——点了没反应比没有更糟。加歌 / 删歌 / 刷新在右栏的 `CloudListPane`。
 *
 * 懒加载：本 hook 只在云端面板挂载时跑（`initUserCenter` 自带 isInited 守卫，一个会话一次）。
 * 选中项写在 `route.query.cloud`（dirId），保留其它键。
 */
export default ({ cloudDirId }: { cloudDirId: Ref<string> }) => {
  const router = useRouter()
  const route = useRoute()
  const t = useI18n()

  void initUserCenter()

  const cloudLists = computed(() => createdLists.filter(item => item.dirId !== I_LIKE_DIR_ID))
  const cloudListsLabel = computed(() => userLabels.createdLists || t('no_item'))

  /**
   * 选中项归一：`cloud` 缺失、或指向已不存在的歌单（老链接 / 刚被删掉）时落到第一组；
   * 一组都没有就清掉参数（右栏显示空态提示）。**不能省**——删掉正在看的那个歌单后
   * 右栏会停在已经不存在的 dirId 上。
   */
  const handleSelect = (dirId: string) => {
    if (dirId === cloudDirId.value) return
    void router.replace({
      path: route.path,
      query: { ...route.query, cloud: dirId || undefined },
    })
  }

  /**
   * 归一必须等**列表真的到手**才跑：冷启动直接进 `?cloud=<dirId>` 时 `createdLists` 还是空的，
   * 照着「列表里没有就归一」跑会把用户要的那一个抹掉（改成第一组甚至清空）。
   * 判据两条：`initUserCenter` 跑完（`isInited`），且 createdLists 那次请求成功（label 被清空；
   * 失败会留文案，此时不动 query——右栏自己会显示失败原因）。
   */
  const isListsLoaded = () => isInited.value && userLabels.createdLists === ''

  watch([cloudLists, cloudDirId, isInited], ([lists, dirId]) => {
    const next = resolveCloudSelection(lists, dirId, isListsLoaded())
    if (next != null) handleSelect(next)
  }, { immediate: true })

  // ── 新建云端歌单 ──────────────────────────────────────────────────────
  const isShowNewCloudList = ref(false)
  const isNewCloudListLeave = ref(false)
  const handleCreateCloudList = async(event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.readOnly) return
    const name = target.value.trim()
    target.readOnly = true
    if (!name) {
      isShowNewCloudList.value = false
      return
    }
    try {
      await createCloudList(name)
    } catch (err: any) {
      void dialog({ message: err?.message || String(err), type: 'error' })
    }
    isNewCloudListLeave.value = true
    void nextTick(() => { isShowNewCloudList.value = false })
  }

  // ── 右键删除云端歌单 ──────────────────────────────────────────────────
  const cloudMenus = [{ name: t('playlists__cloud_remove'), action: 'remove' }]
  const isShowCloudMenu = ref(false)
  const cloudMenuLocation = ref({ x: 0, y: 0 })
  const rightClickCloudItem = ref(null as PlaylistCard | null)
  const handleCloudItemRigthClick = (event: MouseEvent, item: PlaylistCard) => {
    event.preventDefault()
    rightClickCloudItem.value = item
    cloudMenuLocation.value = { x: event.clientX, y: event.clientY }
    isShowCloudMenu.value = true
  }
  // ⚠️ base-menu 的 menu-click 传的是**整个菜单项对象**（仓库既有写法都是取 `action.action`，
  // 见 components/material/OnlineList/useMenu.js:105），不是 action 字符串
  const handleCloudMenuClick = (menuItem: { action?: string }) => {
    const item = rightClickCloudItem.value
    rightClickCloudItem.value = null
    if (menuItem?.action !== 'remove' || item == null) return
    void dialog.confirm({
      message: t('playlists__cloud_remove_tip', { name: item.name }),
      confirmButtonText: t('lists__remove_tip_button'),
    }).then(async(isRemove) => {
      if (!isRemove) return
      try {
        await removeCloudList(item)
        // 删掉的正是当前选中的那个 → 归一 watcher 会把选中项挪到剩下的第一组
      } catch (err: any) {
        void dialog({ message: err?.message || String(err), type: 'error' })
      }
    })
  }

  return {
    cloudLists,
    cloudListsLabel,
    handleSelect,
    isShowNewCloudList,
    isNewCloudListLeave,
    handleCreateCloudList,
    cloudMenus,
    isShowCloudMenu,
    cloudMenuLocation,
    handleCloudItemRigthClick,
    handleCloudMenuClick,
  }
}
