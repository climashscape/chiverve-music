import { getDBServiceWorker } from './utils'


export default () => {
  return {
    // getter 而不是一次性取值：worker 意外退出时 `./utils` 会重建它（见该文件头部的监督说明），
    // 后续调用自动走新的那个；写成属性会在第一次死亡后永远指向废弃的代理。
    get dbService() {
      return getDBServiceWorker()
    },
  }
}
