<template lang="pug">
//- §4.2 并发与命名：四项（元数据顺序）——任务数 / 同名跳过 / 文件名模板 / 档位不可用时的行为
//- 根元素是 div：内容区样式 `.setting dd > div` 会给它左右 padding
div
  .p(data-setting-key="download.maxDownloadNum")
    | {{ $t('setting__download_max_num') }}
    common-setting-help-icon(:text="$t('setting__download_max_num_tooltip')" :label="$t('setting__download_max_num')")
    base-selection.gap-left(:class="$style.selectWidth" :model-value="appSetting['download.maxDownloadNum']" :list="maxNums" item-key="id" item-name="id" @change="handleUpdateMaxNum")
  .gap-top(data-setting-key="download.skipExistFile")
    base-checkbox(id="setting_download_skip_exist_file" :model-value="appSetting['download.skipExistFile']" :label="$t('setting__download_skip_exist_file')" @update:model-value="updateSetting({'download.skipExistFile': $event})")
  .gap-top(data-setting-key="download.fileNameTemplate")
    .p
      | {{ $t('setting__download_name') }}
      common-setting-help-icon(:text="$t('setting__download_file_name_tip')" :label="$t('setting__download_name')")
    div
      //- ⚠️ `gap-left` 是「给**后一个**兄弟加左边距」的约定（`.gap-left + .gap-left`，见
      //- `assets/styles/index.less:577`）：链条的**第一个**元素也得带这个类，否则紧跟着它的那个
      //- 元素没有间距。这里由输入框带类、后面三个预设按钮依次吃到 20px——少了输入框那一份，
      //- 第一个按钮会**贴住输入框**（两块灰底连成一条、文案还是重复的，看着像同一个控件，
      //- 2026-09-24 用户报「这个显示有问题」即此）
      base-input.gap-left(:class="$style.nameInput" :model-value="appSetting['download.fileNameTemplate']" :placeholder="$t('setting__download_name')" @update:model-value="setFileNameTemplate")
      //- 改造前的三个「命名方式」预设，改成快捷按钮：按钮文案就是模板串本身（点一下原样写进左边输入框），
      //- 悬停提示给它的中文说法（`setting__download_name1/2/3`）。文案给的是模板实义而不是快捷键名，
      //- 是因为「点了会写进什么」必须一眼可见（四语里 `歌名` / `歌手` 都是不可翻译的契约词）
      base-btn.gap-left(v-for="item in nameTemplates" :key="item.template" min :title="$t(item.i18nKey)" @click="saveFileNameTemplate(item.template)") {{ item.template }}
  .gap-top(data-setting-key="download.degradeWhenUnsupported")
    base-checkbox(id="setting_download_degrade_when_unsupported" :model-value="appSetting['download.degradeWhenUnsupported']" :label="$t('setting__download_degrade_when_unsupported')" @update:model-value="updateSetting({'download.degradeWhenUnsupported': $event})")
    common-setting-help-icon(:text="$t('setting__download_degrade_when_unsupported_tip')" :label="$t('setting__download_degrade_when_unsupported')")
</template>

<script>
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { dialog } from '@renderer/plugins/Dialog'

/**
 * 下载 → 并发与命名（`download_concurrent_naming`，设置页重构票 07）：四项。
 *
 * 改造前这里是三个「命名方式」单选（写死 `'歌名 - 歌手' | '歌手 - 歌名' | '歌名'`）。现在换成自由模板串
 * （`download.fileNameTemplate`）：
 * - 占位词只有 `歌名`（歌曲名）与 `歌手`（艺术家）两个，其余文本原样（`formatMusicName` 的语义）；
 * - 同一个值**同时**服务下载落盘、下载列表里显示的名字、播放栏标题与「复制歌名」（附 B6：语义暂不拆，
 *   帮助文案里要向用户讲清这层耦合）；
 * - 文件名安全（`\ / : * ? # " < > |`）、150 字符截断与空模板回退都在 worker 里
 *   （`worker/download/utils.ts` 的 `createDownloadFileName`），这里只保证不把空值落盘。
 *
 * 右下那个开关（`download.degradeWhenUnsupported`）默认 true = 改造前的静默降档行为；
 * 关掉后请求档位不可用的歌不建任务，由下载入队处弹提示（`store/download/action.ts`）。
 */
export default {
  name: 'DownloadConcurrentNamingGroup',
  setup() {
    const t = useI18n()

    const maxNums = new Array(6).fill(null).map((_, i) => ({ id: i + 1 }))
    const handleUpdateMaxNum = async({ id }) => {
      if (id > 3) {
        if (!await dialog.confirm(t('setting__download_max_num_tip'))) return
      }
      updateSetting({ 'download.maxDownloadNum': id })
    }

    // 三个快捷按钮（改造前的三个预设）：`template` 是真正的模板串，`i18nKey` 只作悬停提示
    const nameTemplates = [
      { template: '歌名 - 歌手', i18nKey: 'setting__download_name1' },
      { template: '歌手 - 歌名', i18nKey: 'setting__download_name2' },
      { template: '歌名', i18nKey: 'setting__download_name3' },
    ]

    // 输入走 500ms 防抖（同播放稳定性的数值输入），快捷按钮**立即**落盘：点一下就该看到输入框变过去。
    // 两条路径共用同一个计时器（点按钮时把待落盘的那次取消掉）——否则「打字后 500ms 内点按钮」会让
    // 打字的内容反过来盖掉刚点的模板
    let pendingTimer = null
    const saveFileNameTemplate = value => {
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
      // 空值不落盘（「全选删掉重打」的中间态）：落盘侧另有回退，手改配置文件写成空串时也兜得住
      if (!value) return
      updateSetting({ 'download.fileNameTemplate': value })
    }
    const setFileNameTemplate = value => {
      if (pendingTimer) clearTimeout(pendingTimer)
      pendingTimer = setTimeout(() => { saveFileNameTemplate(value) }, 500)
    }

    return {
      appSetting,
      updateSetting,
      maxNums,
      handleUpdateMaxNum,
      nameTemplates,
      saveFileNameTemplate,
      setFileNameTemplate,
    }
  },
}
</script>

<style lang="less" module>
.selectWidth {
  width: 60px;
}

.nameInput {
  width: 220px;
}
</style>
