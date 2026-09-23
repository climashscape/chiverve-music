<template lang="pug">
div.comment(ref="dom_container" :class="$style.comment")
  div(:class="$style.commentHeader")
    h3 {{ $t('comment__title', { name: currentMusicInfo.name }) }}
    div(:class="$style.commentHeaderBtns")
      div(:class="$style.commentHeaderBtn" :aria-label="$t('comment__refresh')" :title="$t('comment__refresh')" @click="handleShowComment")
        svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" style="transform: rotate(45deg);" viewBox="0 0 24 24" space="preserve")
          use(xlink:href="#icon-refresh")
      //- 关闭键原先既无 aria-label 也无 title：图标键按 §2.5.1 补上（`close` 是既有 key）
      div(:class="$style.commentHeaderBtn" :aria-label="$t('close')" :title="$t('close')" @click="$emit('close')")
        svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve")
          use(xlink:href="#icon-close")

  div(:class="$style.commentMain")
    template(v-if="available")
      //- 发表评论 / 回复：写接口要登录态，未登录时输入框禁用并给文案提示（不静默失败）
      div(:class="$style.composer")
        div(:class="$style.composerRow")
          base-input(
            ref="dom_composerInput"
            v-model="composerText"
            :class="$style.composerInput"
            :placeholder="composerPlaceholder"
            :disabled="!isLogin || composerSending"
            @submit="handlePublish"
          )
          base-btn(min :disabled="!canPublish" @click="handlePublish") {{ composerSending ? $t('comment__sending') : $t('comment__publish') }}
        div(v-if="replyTarget" :class="$style.replyBar")
          span(:class="$style.replyLabel") {{ $t('comment__reply_to', { name: replyTarget.userName }) }}
          button(type="button" :class="$style.replyCancel" @click="handleReplyCancel") {{ $t('comment__reply_cancel') }}
        //- 提示行：未登录时常驻（解释输入框为什么是灰的），其余时候显示发送结果（AGENTS §2.11 没有 toast）
        p(v-if="composerTip || !isLogin" :class="$style.composerTip") {{ composerTip || $t('user_center__need_login') }}
      header(:class="$style.tab_header")
        button(type="button" :class="[$style.commentType, { [$style.active]: tabActiveId == 'hot' }]" @click="handleToggleTab('hot')") {{ $t('comment__hot_title') }} ({{ hotComment.total }})
        button(type="button" :class="[$style.commentType, { [$style.active]: tabActiveId == 'new' }]" @click="handleToggleTab('new')") {{ $t('comment__new_title') }} ({{ newComment.total }})
      main(ref="dom_tabMain" :class="$style.tab_main")
        div(:class="$style.tab_content")
          div.scroll(ref="dom_commentHot" :class="$style.tab_content_scroll")
            p(v-if="hotComment.isLoadError" :class="$style.commentLabel" style="cursor: pointer;" @click="handleGetHotComment(currentMusicInfo, hotComment.nextPage, hotComment.limit)") {{ $t('comment__hot_load_error') }}
            p(v-else-if="hotComment.isLoading && !hotComment.list.length" :class="$style.commentLabel") {{ $t('comment__hot_loading') }}
            comment-floor(v-if="!hotComment.isLoadError && hotComment.list.length" :class="[$style.commentFloor, hotComment.isLoading ? $style.loading : null]" :comments="hotComment.list" :can-delete="canDelete" @reply="handleReply" @delete="handleDelete")
            p(v-else-if="!hotComment.isLoadError && !hotComment.isLoading" :class="$style.commentLabel") {{ $t('comment__no_content') }}
            div(:class="$style.pagination")
              material-pagination(:count="hotComment.total" :btn-length="5" :limit="hotComment.limit" :page="hotComment.page" @btn-click="handleToggleHotCommentPage")
        div(:class="$style.tab_content")
          div.scroll(ref="dom_commentNew" :class="$style.tab_content_scroll")
            p(v-if="newComment.isLoadError" :class="$style.commentLabel" style="cursor: pointer;" @click="handleGetNewComment(currentMusicInfo, newComment.nextPage, newComment.limit)") {{ $t('comment__new_load_error') }}
            p(v-else-if="newComment.isLoading && !newComment.list.length" :class="$style.commentLabel") {{ $t('comment__new_loading') }}
            comment-floor(v-if="!newComment.isLoadError && newComment.list.length" :class="[$style.commentFloor, newComment.isLoading ? $style.loading : null]" :comments="newComment.list" :can-delete="canDelete" @reply="handleReply" @delete="handleDelete")
            p(v-else-if="!newComment.isLoadError && !newComment.isLoading" :class="$style.commentLabel") {{ $t('comment__no_content') }}
            div(:class="$style.pagination")
              material-pagination(:count="newComment.total" :btn-length="5" :limit="newComment.limit" :page="newComment.page" @btn-click="handleToggleCommentPage")
    div(v-else :class="$style.unavailable")
      p {{ $t('comment__unavailable') }}
</template>

<script>
import { toOldMusicInfo } from '@renderer/utils'
import { getQQCredential } from '@renderer/utils/ipc'
import music from '@renderer/utils/musicSdk'
import CommentFloor from './CommentFloor.vue'

export default {
  name: 'MusicComment',
  components: {
    CommentFloor,
  },
  props: {
    show: Boolean,
    musicInfo: {
      type: Object,
      required: true,
    },
  },
  emits: ['close'],
  data() {
    return {
      available: false,
      currentMusicInfo: {
        name: '',
        singer: '',
      },
      tabActiveId: 'hot',
      // ---- 发表/回复（M6）----
      /** 输入框内容 */
      composerText: '',
      /** 正在发送：按钮禁用 + 文案变「发表中…」 */
      composerSending: false,
      /** 发送结果提示（成功/失败/未登录）。仓库没有 toast，只能落在这一行文案上（AGENTS §2.11） */
      composerTip: '',
      /** 回复目标：{ cmId, userName }；为 null 表示发表新评论 */
      replyTarget: null,
      /** 当前账号是否已登录（写接口要登录态，读不需要） */
      isLogin: false,
      /**
       * 当前账号的加密 uin（euin）。只留这一个字段：凭证里还有 musickey 之类的密钥，
       * 没必要留在组件状态里（列表项的 `userId` 就是加密 uin，用来判断哪些评论能删）。
       */
      myEuin: '',
      newComment: {
        isLoading: false,
        isLoadError: false,
        page: 1,
        total: 0,
        maxPage: 1,
        nextPage: 1,
        limit: 20,
        list: [
        // {
        //   text: ['123123hhh'],
        //   userName: 'dsads',
        //   avatar: 'http://img4.kuwo.cn/star/userhead/39/52/1602393411654_512039239s.jpg',
        //   time: '2020-10-22 22:14:17',
        //   timeStr: '2020-10-22 22:14:17',
        //   likedCount: 100,
        //   reply: [],
        // },
        ],
      },
      hotComment: {
        isLoading: true,
        isLoadError: true,
        page: 1,
        total: 0,
        maxPage: 1,
        nextPage: 1,
        limit: 20,
        list: [
        // {
        //   text: ['123123hhh'],
        //   userName: 'dsads',
        //   avatar: 'http://img4.kuwo.cn/star/userhead/39/52/1602393411654_512039239s.jpg',
        //   time: '2020-10-22 22:14:17',
        //   timeStr: '2020-10-22 22:14:17',
        //   likedCount: 100,
        //   reply: [
        //     {
        //       text: ['123123hhh'],
        //       userName: 'dsads',
        //       avatar: 'http://img4.kuwo.cn/star/userhead/39/52/1602393411654_512039239s.jpg',
        //       time: '2020-10-22 22:14:17',
        //       timeStr: '2020-10-22 22:14:17',
        //       likedCount: 100,
        //     },
        //   ],
        // },
        ],
      },
    }
  },
  computed: {
    /** 未登录时占位符直接说「请先登录 QQ 音乐」，让输入框自己解释为什么不能打字 */
    composerPlaceholder() {
      if (!this.isLogin) return this.$t('user_center__need_login')
      if (this.replyTarget) return this.$t('comment__reply_to', { name: this.replyTarget.userName })
      return this.$t('comment__publish_placeholder')
    },
    canPublish() {
      return this.isLogin && !this.composerSending && !!this.composerText
    },
  },
  watch: {
    show(n) {
      if (n) this.handleShowComment()
    },
  },
  mounted() {
    this.setWidth()
    window.addEventListener('resize', this.setWidth)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.setWidth)
  },
  methods: {
    setWidth() {
      setTimeout(() => {
        this.$refs.dom_container.style.width = Math.floor(this.$refs.dom_container.parentNode.clientWidth * 0.5) + 'px'

        setTimeout(() => {
          this.handleToggleTab(this.tabActiveId, true)
        })
      })
    },
    async getComment(musicInfo, page, limit, retryNum = 0) {
      let resp
      try {
        resp = await music[musicInfo.source].comment.getComment(musicInfo, page, limit)
      } catch (error) {
        if (error.message == '取消请求' || ++retryNum > 2) throw error
        resp = await this.getComment(musicInfo, page, limit, retryNum)
      }
      return resp
    },
    async getHotComment(musicInfo, page, limit, retryNum = 0) {
      let resp
      try {
        resp = await music[musicInfo.source].comment.getHotComment(musicInfo, page, limit)
      } catch (error) {
        if (error.message == '取消请求' || ++retryNum > 2) throw error
        resp = await this.getHotComment(musicInfo, page, limit, retryNum)
      }
      return resp
    },
    handleGetNewComment(musicInfo, page, limit) {
      this.newComment.isLoadError = false
      this.newComment.isLoading = true
      this.getComment(toOldMusicInfo(musicInfo), page, limit).then(comment => {
        this.newComment.isLoading = false
        this.newComment.total = comment.total
        this.newComment.maxPage = comment.maxPage
        this.newComment.page = page
        this.newComment.list = comment.comments
        this.$nextTick(() => {
          this.$refs.dom_commentNew.scrollTo(0, 0)
        })
      }).catch(err => {
        console.log(err)
        if (err.message == '取消请求') return
        this.newComment.isLoadError = true
        this.newComment.isLoading = false
      })
    },
    handleGetHotComment(musicInfo, page, limit) {
      this.hotComment.isLoadError = false
      this.hotComment.isLoading = true
      this.getHotComment(toOldMusicInfo(musicInfo), page, limit).then(hotComment => {
        this.hotComment.isLoading = false
        this.hotComment.total = hotComment.total
        this.hotComment.maxPage = hotComment.maxPage
        this.hotComment.page = page
        this.hotComment.list = hotComment.comments
        this.$nextTick(() => {
          this.$refs.dom_commentHot.scrollTo(0, 0)
        })
      }).catch(err => {
        console.log(err)
        if (err.message == '取消请求') return
        this.hotComment.isLoadError = true
        this.hotComment.isLoading = false
      })
    },
    /**
     * 取一次登录态与自己账号的加密 uin。
     * 判据与数据层写接口一致（`tx/comment.js` 的 requireLoginCredential：有凭证就能写），
     * 所以这里直接问凭证，而不是依赖 QQ 账号 store 里的 isLogin——那个状态目前只在「设置」页初始化过。
     */
    async refreshAuth() {
      this.isLogin = false
      this.myEuin = ''
      try {
        const credential = await getQQCredential()
        if (credential == null) return
        this.isLogin = true
        this.myEuin = String(credential.encryptUin ?? '')
      } catch (err) {
        // 取不到凭证就按未登录处理：评论照常能看，只是不能写
        console.log('[comment] credential', err)
      }
    },
    /**
     * 能不能删：只给自己的评论显示「删除」。
     * 依据是列表项的 `userId`（读接口给的加密 uin）与凭证里的 `encryptUin` 相等——
     * `tx/comment.js` 的 filterNewComment / filterHotComment 都填了 userId。
     * ⚠️ 两者的格式是否严格一致**没有真机验证过**；若不一致，后果只是「删除按钮不出现」
     * （服务端本来就只允许删自己的评论，这里多做一层判断是为了不给出会失败的按钮）。
     */
    canDelete(item) {
      return !!this.myEuin && !!item?.cmId && String(item.userId ?? '') === this.myEuin
    },
    handleReply(item) {
      if (!this.isLogin) {
        this.composerTip = this.$t('user_center__need_login')
        return
      }
      // 没有裸 id 的条目（热评的回复）发不了「回复」，按钮侧已经不显示，这里再兜一层
      if (!item?.cmId) return
      this.composerTip = ''
      this.replyTarget = { cmId: item.cmId, userName: item.userName }
      const input = this.$refs.dom_composerInput
      if (input) input.focus()
    },
    handleReplyCancel() {
      this.replyTarget = null
    },
    /** 重拉当前 tab 的当前页（发表/删除成功后用）。 */
    refreshActiveTab() {
      if (this.tabActiveId === 'hot') this.handleGetHotComment(this.currentMusicInfo, this.hotComment.page, this.hotComment.limit)
      else this.handleGetNewComment(this.currentMusicInfo, this.newComment.page, this.newComment.limit)
    },
    async handlePublish() {
      if (!this.canPublish) {
        if (!this.isLogin) this.composerTip = this.$t('user_center__need_login')
        return
      }
      const content = this.composerText.trim()
      if (!content) return
      this.composerSending = true
      this.composerTip = ''
      try {
        await music.tx.comment.createComment(toOldMusicInfo(this.currentMusicInfo), content, this.replyTarget?.cmId)
        this.composerText = ''
        this.replyTarget = null
        this.composerTip = this.$t('comment__publish_success')
        // 新评论只会出现在「最新评论」里，且服务端要过几秒才放出来（comment.js 文件头第 4 条）——
        // 所以切到最新页并重拉第 1 页，而不是往列表里塞一条本地假数据（重拉简单且不会与真实列表打架）
        this.handleToggleTab('new')
        this.handleGetNewComment(this.currentMusicInfo, 1, this.newComment.limit)
      } catch (err) {
        console.log(err)
        this.composerTip = err?.message || this.$t('comment__publish_failed')
        // 凭证在面板打开之后过期/被清掉时，数据层抛的也是这句：顺手同步一下界面上的登录态
        if (err?.message === 'QQ 音乐未登录') void this.refreshAuth()
      } finally {
        this.composerSending = false
      }
    },
    async handleDelete(item) {
      if (!this.canDelete(item)) return
      const confirm = await this.$dialog.confirm({ message: this.$t('comment__delete_confirm') })
      if (!confirm) return
      try {
        await music.tx.comment.deleteComment(item.cmId)
        this.composerTip = ''
        // 删掉的正好是当前回复目标时，把回复态收回去（否则会往已删除的评论下回复）
        if (this.replyTarget?.cmId === item.cmId) this.replyTarget = null
        this.refreshActiveTab()
      } catch (err) {
        console.log(err)
        // 用户主动发起的操作，失败必须给明确反馈（不能只落一行可能被忽略的提示）
        void this.$dialog({ message: err?.message || this.$t('comment__delete_failed') })
      }
    },
    handleShowComment() {
      this.currentMusicInfo = 'progress' in this.musicInfo ? this.musicInfo.metadata.musicInfo : this.musicInfo

      if (this.currentMusicInfo.source == 'local' || !music[this.currentMusicInfo.source].comment) {
        this.available = false
        return
      }
      this.available = true
      // 评论区「读」不需要登录，只有「写」需要：每次打开面板都重新取一次登录态
      this.composerText = ''
      this.composerTip = ''
      this.replyTarget = null
      this.composerSending = false
      void this.refreshAuth()
      // if (this.musicInfo.songmid != this.currentMusicInfo.songmid) {
      this.hotComment.page = 1
      this.hotComment.total = 0
      this.hotComment.maxPage = 1
      this.hotComment.nextPage = 1

      this.newComment.page = 1
      this.newComment.total = 0
      this.newComment.maxPage = 1
      this.newComment.nextPage = 1
      // }
      this.isShowComment = true

      this.handleGetHotComment(this.currentMusicInfo, this.hotComment.page, this.hotComment.limit)
      this.handleGetNewComment(this.currentMusicInfo, this.newComment.page, this.newComment.limit)
    },
    handleToggleHotCommentPage(page) {
      this.hotComment.nextPage = page
      this.handleGetHotComment(this.currentMusicInfo, page, this.hotComment.limit)
    },
    handleToggleCommentPage(page) {
      this.newComment.nextPage = page
      this.handleGetNewComment(this.currentMusicInfo, page, this.newComment.limit)
    },
    handleToggleTab(id, force) {
      if (!this.available || (!force && this.tabActiveId == id)) return
      switch (id) {
        case 'hot':
          this.$refs.dom_tabMain.scrollLeft = 0
          break
        case 'new':
          this.$refs.dom_tabMain.scrollLeft = this.$refs.dom_tabMain.clientWidth
          break
      }
      this.tabActiveId = id
    },
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.comment {
  display: flex;
  flex-flow: column nowrap;
  transition: @transition-normal;
  transition-property: transform,opacity;
  transform-origin: 100%;
  overflow: hidden;
}
.commentHeader {
  flex: none;
  padding-bottom: 5px;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  // border-bottom: 1px solid #eee;
  h3 {
    font-size: 14px;
    .mixin-ellipsis-1();
    line-height: 1.2;
  }
}
.commentHeaderBtns {
  flex: 1 0 auto;
  display: flex;
  flex-flow: row nowrap;
  justify-content: flex-end;
  color: var(--color-primary);
}
.commentHeaderBtn {
  height: 22px;
  width: 22px;
  cursor: pointer;
  transition: opacity @transition-normal;

  +.commentHeaderBtn {
    margin-left: 5px;
  }

  &:hover {
    opacity: .7;
  }
}
.commentMain {
  flex: auto;
  background-color: var(--color-primary-light-400-alpha-700);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
}
// 发表/回复区：与下面 tab 内容左右对齐（内容区是 padding-left 15px / right 10px）
.composer {
  flex: none;
  padding: 0 10px 5px 15px;
}
.composerRow {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 8px;
}
.composerInput {
  flex: auto;
  min-width: 0;
}
.replyBar {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  font-size: 12px;
  color: var(--color-font-label);
}
.replyLabel {
  .mixin-ellipsis-1();
}
.replyCancel {
  flex: none;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--color-font-label);
  cursor: pointer;
  transition: color @transition-normal;

  &:hover {
    color: var(--color-primary);
  }
}
.composerTip {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-font-label);
}
.tab_header {
  display: flex;
  flex-flow: row nowrap;
  gap: 15px;
  padding-left: 15px;
  padding-right: 10px;
}
.tab_main {
  flex: auto;
  display: flex;
  flex-flow: row nowrap;
  overflow: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
}
.tab_content {
  flex-shrink: 0;
  width: 100%;
  position: relative;
}
.tab_content_scroll {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  padding-left: 15px;
  padding-right: 10px;
  scroll-behavior: smooth;
}
.commentLabel {
  padding: 15px;
  color: var(--color-font-label);
  font-size: 14px;
}
.commentType {
  padding: 5px;
  margin: 5px 0;
  font-size: 13px;
  background: none;
  border: none;
  cursor: pointer;
  transition: @transition-normal;
  transition-property: opacity, color;
  &:hover {
    opacity: .7;
  }
  &.active {
    color: var(--color-primary);
  }
}
.commentFloor {
  opacity: 1;
  transition: opacity @transition-normal;

  &.loading {
    opacity: .4;
  }
}
.pagination {
  padding: 10px 0;
}

.unavailable {
  flex: auto;
  padding-top: 10%;
  text-align: center;
  font-size: 14px;
  color: var(--color-font-label);
}

</style>
