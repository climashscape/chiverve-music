import apiSourceInfo from './api-source-info'
import { apiSource, userApi } from '@renderer/store'
import builtinTx from './tx/musicUrl'

/**
 * 取流实现注册表：key = `${api-source-info 里的 id}_${源 id}`。
 *
 * 这里是"换接口/加源"的扩展点：实现一个 `{ getMusicUrl }` 对象挂进来，再到
 * `api-source-info.ts` 声明它覆盖哪些源与音质即可（三步清单见 AGENTS.md §3.7）。
 */
const allApi = {
  builtin_tx: builtinTx,
}

const apiList = {}
const supportQuality = {}

for (const api of apiSourceInfo) {
  supportQuality[api.id] = api.supportQualitys
  for (const source of Object.keys(api.supportQualitys)) {
    apiList[`${api.id}_api_${source}`] = allApi[`${api.id}_${source}`]
  }
}

const getAPI = source => apiList[`${apiSource.value}_api_${source}`]

const apis = source => {
  if (/^user_api/.test(apiSource.value)) return userApi.apis[source]
  let api = getAPI(source)
  if (api) return api
  throw new Error('Api is not found')
}

export { apis, supportQuality }
