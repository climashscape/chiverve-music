import { ref, reactive, shallowRef, markRaw, computed, watch } from '@common/utils/vueTools'
import { windowSizeList as configWindowSizeList } from '@common/config'
import { appSetting } from './setting'
import pkg from '../../../package.json'
import music from '@renderer/utils/musicSdk'
process.versions.app = pkg.version

export const apiSource = ref<string | null>(null)
export const proxy: {
  enable: boolean
  host: string
  port: string

  envProxy?: {
    host: string
    port: string
  }
} = {
  enable: false,
  host: '',
  port: '',
}
export const sync: {
  enable: boolean
  mode: LX.AppSetting['sync.mode']
  isShowSyncMode: boolean
  isShowAuthCodeModal: boolean
  deviceName: string
  type: keyof LX.Sync.ModeTypes
  server: {
    port: string
    status: {
      status: boolean
      message: string
      address: string[]
      code: string
      devices: LX.Sync.ServerKeyInfo[]
    }
  }
  client: {
    host: string
    status: {
      status: boolean
      message: string
      address: string[]
    }
  }
} = reactive({
  enable: false,
  mode: 'server',
  isShowSyncMode: false,
  isShowAuthCodeModal: false,
  deviceName: '',
  type: 'list',
  server: {
    port: '',
    status: {
      status: false,
      message: '',
      address: [],
      code: '',
      devices: [],
    },
  },
  client: {
    host: '',
    status: {
      status: false,
      message: '',
      address: [],
    },
  },
})

export const openAPI = reactive({
  address: '',
  message: '',
})


export const windowSizeActive = computed(() => {
  return windowSizeList.find(i => i.id === appSetting['common.windowSizeId']) ?? windowSizeList[0]
})

export const getSourceI18nPrefix = () => {
  return appSetting['common.sourceNameType'] == 'real' ? 'source_' : 'source_alias_'
}

export const sourceNames = computed(() => {
  const prefix = getSourceI18nPrefix()
  const names: Record<string, string> = {
    all: window.i18n.t(prefix + 'all' as any),
    local: window.i18n.t('source_local' as any),
  }
  // 遍历注册表：加源时这里自动多一条（i18n 里补 source_<id>/source_alias_<id> 即可）
  for (const { id } of music.sources) names[id] = window.i18n.t(prefix + id as any)
  return names as Record<LX.Source | 'all', string>
})

/**
 * 源的本地化显示名。
 *
 * 视图里要显示"这首歌/这个歌单来自哪"时**用它，不要直接渲染 `source` 值**——
 * 那是 `'tx'` / `'local'` 这种内部标识，直接渲染会让用户看到 `tx`。
 * （加源时：在 `sourceNames` 里补一条即可，视图不必改。）
 */
export const getSourceName = (source?: LX.Source | 'all' | null): string => {
  if (source == null) return ''
  return sourceNames.value[source] ?? String(source)
}

export const windowSizeList = markRaw(configWindowSizeList)

export const isShowPact = ref(false)

/**
 * 当前版本号（读 `package.json`，构建时烤进产物）。
 *
 * 这里**只有**版本号：更新检查（`newVersion` / `status` / `downloadProgress` 那一整套）已删除
 * ——2026-09-24 用户裁定清理应用内更新链路，ADR-0008 不发布任何打包版。
 */
export const versionInfo = window.lxData.versionInfo = reactive<{
  version: string
}>({
  version: pkg.version,
})
export const userApi = reactive<{
  list: LX.UserApi.UserApiInfo[]
  status: boolean
  message?: string
  apis: Partial<LX.UserApi.UserApiSources>
}>({
  list: [],
  status: false,
  message: 'initing',
  apis: {},
})

export const isFullscreen = ref(false)
watch(isFullscreen, isFullscreen => {
  window.lx.rootOffset = window.dt || isFullscreen ? 0 : 8
}, { immediate: true })

export const themeShouldUseDarkColors = ref(window.shouldUseDarkColors)


export const qualityList = shallowRef<LX.QualityList>({})
export const setQualityList = (_qualityList: LX.QualityList) => {
  qualityList.value = _qualityList
}

export const themeId = ref('green')
export const themeInfo: LX.ThemeInfo = {
  themes: [],
  userThemes: [],
  dataPath: '',
}
