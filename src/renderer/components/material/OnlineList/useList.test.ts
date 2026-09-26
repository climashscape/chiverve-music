import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, reactive, ref, nextTick } from 'vue'
import useList from './useList'

/**
 * 在线歌曲表多选集合的生命周期（2026-09-26 复核的缺陷 3）。
 *
 * 真机症状：列表**原地刷新**（换歌单、切来源、刷新当前页）后，之前勾选的歌已经不在屏上，
 * 「加入歌单 / 批量下载」却还会作用到它们——多选集合跨内容存活。
 *
 * 根因：`watch(() => props.list, removeAllSelect)` 只盯**引用**，而本仓在线列表的写回是
 * 原地 `splice(0, len, ...list)`（`store/user/action.ts`）：引用不变 → watcher 不跑 → 旧选中项留下。
 * 修法与 `base/VirtualizedList` 同一口径：watch 源补长度 + 逐项身份的内容探针。
 *
 * 选中走**真路径**（mod 键 + `handleSelectData`，与用户 Ctrl/Command 点选同一条），不直接改
 * `selectedList` —— 否则「选择态」这层接线断了这里也不会红。
 */
const song = (id: string) => ({
  id: `tx_${id}`,
  name: `歌${id}`,
  singer: '歌手',
  source: 'tx',
  interval: '03:00',
  meta: { albumName: '专辑', id, songType: 0 },
}) as any

interface Api {
  selectedList: { value: LX.Music.MusicInfoOnline[] }
  handleSelectData: (index: number) => void
}

const makeHarness = () => {
  const list = reactive([song('1'), song('2'), song('3')])
  const props = reactive({ list })
  let api: Api | null = null
  const Wrapper = defineComponent({
    setup() {
      api = useList({ props, listRef: ref(null) }) as unknown as Api
      return () => null
    },
  })
  const wrapper = mount(Wrapper)
  return {
    list,
    wrapper,
    api: () => api!,
    /** 按住 mod 键点两行（用户 Ctrl/Command 点选的那条路） */
    selectTwo: () => {
      window.key_event.emit('key_mod_down', {})
      api!.handleSelectData(0)
      api!.handleSelectData(1)
      window.key_event.emit('key_mod_up', {})
    },
    selected: () => api!.selectedList.value.map(item => item.id),
  }
}

describe('OnlineList/useList：列表内容变了就清空多选', () => {
  it('原地 splice 换成本页另一批歌（长度不变）→ 多选集合清空', async() => {
    const h = makeHarness()
    h.selectTwo()
    expect(h.selected()).toHaveLength(2)

    h.list.splice(0, h.list.length, song('4'), song('5'), song('6'))
    await nextTick()

    expect(h.selected()).toEqual([])
    h.wrapper.unmount()
  })

  it('原地 splice 后长度变短 → 多选集合清空', async() => {
    const h = makeHarness()
    h.selectTwo()

    h.list.splice(0, h.list.length, song('4'))
    await nextTick()

    expect(h.selected()).toEqual([])
    h.wrapper.unmount()
  })

  it('不回归：内容没变（换引用、对象还是那些）时多选保留', async() => {
    const h = makeHarness()
    h.selectTwo()

    const sameItems = [...h.list]
    h.list.splice(0, h.list.length, ...sameItems)
    await nextTick()

    expect(h.selected()).toHaveLength(2)
    h.wrapper.unmount()
  })
})
