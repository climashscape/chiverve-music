import { useI18n } from '@renderer/plugins/i18n'
import { dialog } from '@renderer/plugins/Dialog'

export const useDialog = () => {
  const t = useI18n()
  const errorDialog = message => {
    dialog({
      message: `${t('deep_link__handle_error_tip', { message })}`,
      confirmButtonText: t('ok'),
    })
  }

  return errorDialog
}

// 在线源只有 tx（见 LX.OnlineSource）；将来加源时这里同步加 id
export const sources = ['tx']
export const sourceVerify = source => {
  if (!sources.includes(source)) throw new Error('Source no match')
}

export const qualitys = ['128k', '320k', 'flac', 'flac24bit']
export const qualityFilter = (source, types) => {
  types = types.filter(({ type }) => qualitys.includes(type)).map(({ type, size }) => {
    if (size != null && typeof size != 'string') throw new Error(type + ' size type no match')
    return { type, size }
  })
  if (!types.length) throw new Error('quality no match')
  return types
}

export const dataVerify = (rules, data) => {
  const newData = {}
  for (const rule of rules) {
    const val = data[rule.key]
    if (rule.required && val == null) throw new Error(rule.key + ' missing')
    if (val != null) {
      if (rule.types && !rule.types.includes(typeof val)) throw new Error(rule.key + ' type no match')
      if (rule.max && String(val).length > rule.max) throw new Error(rule.key + ' max length no match')
      if (rule.min && String(val).length > rule.min) throw new Error(rule.key + ' min length no match')
    }
    newData[rule.key] = val
  }
  return newData
}
