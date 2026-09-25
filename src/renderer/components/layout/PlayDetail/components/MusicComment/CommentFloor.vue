<template lang="pug">
div(:class="$style.container")
  ul
    li(v-for="item in comments" :key="item.id" :class="$style.listItem")
      div(:class="$style.content")
        div(:class="$style.left")
          img( :class="$style.avatar" :src="item.avatar || commentDefImg" @error="handleUserImg")
        div(:class="$style.right")
          div(:class="$style.info")
            div(:class="$style.baseInfo")
              div.select(:class="$style.name") {{ item.userName }}
              div(:class="$style.metaInfo")
                time(v-if="item.timeStr" :class="$style.label") {{ timeFormat(item.timeStr) }}
                //- 「仅自己可见」：服务端还没把这条放进公开列表（他人看不到、总数也不计它），
                //- 由父组件从「自己的评论」通道并进来时打上 pending 标记
                div(v-if="item.pending" :class="$style.label") {{ $t('comment__pending_own') }}
                div(v-if="item.location" :class="$style.label") {{ $t('comment__location', { location: item.location }) }}
            div(v-if="item.likedCount != null" :class="$style.likes")
              svg(:class="$style.likesIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" space="preserve")
                use(xlink:href="#icon-thumbs-up")
              | {{ item.likedCount }}
          p.select(:class="$style.comment_text") {{ item.text }}
          div(v-if="item.images?.length" :class="$style.comment_images")
            img(v-for="(url, index) in item.images" :key="index" :src="url" loading="lazy" decoding="async")
          div(:class="$style.actions")
            //- 没有 cmId 就不给「回复」：热评的回复项数据层拿不到裸 id（filterHotComment 的 sub 项没有 cmId），
            //- 而后端只认裸 id 当 RepliedCmId —— 给了按钮只会发成一条新的根评论
            button(v-if="item.cmId" type="button" :class="$style.actionBtn" @click="$emit('reply', item)") {{ $t('comment__reply') }}
            button(v-if="canDelete(item)" type="button" :class="$style.actionBtn" @click="$emit('delete', item)") {{ $t('comment__delete') }}
      comment-floor(
        v-if="item.reply && item.reply.length"
        :class="$style.reply_floor"
        :comments="item.reply"
        :can-delete="canDelete"
        @reply="$emit('reply', $event)"
        @delete="$emit('delete', $event)"
      )
</template>

<script>
import commentDefImg from '@renderer/assets/images/defaultUser.jpg'

export default {
  name: 'CommentFloor',
  props: {
    comments: {
      type: Array,
      default() {
        return []
      },
    },
    /**
     * 「这条评论能不能删」。判断依据（当前账号的加密 uin）只有父组件知道，所以传函数进来：
     * 每条评论都要单独判断，传布尔值表达不了。
     */
    canDelete: {
      type: Function,
      default: () => false,
    },
  },
  emits: ['reply', 'delete'],
  data() {
    return {
      commentDefImg,
    }
  },
  methods: {
    timeFormat(time) {
      return time
      // return formatTime(new Date(time), true)
    },
    handleUserImg(event) {
      event.target.src = this.commentDefImg
    },
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

@padding: 15px;

// .container {

// }

.listItem {
  border-bottom: 1px dashed var(--color-primary-alpha-700);
}

.content {
  padding: 12px 0;
  font-size: 13px;
  color: var(--color-font);
  display: flex;
}
.left {
  flex: none;
}
.avatar {
  width: 40px;
  border-radius: 4px;
  box-shadow: 0 0 2px rgba(0, 0, 0, .15);
}
.right {
  flex: auto;
  min-width: 0;
  margin-left: 10px;
}

.info {
  display: flex;
  flex-flow: row nowrap;
  gap: 15px;
  width: 100%;
  height: 40px;
  line-height: 1.3;
  color: var(--color-450);
}
.baseInfo {
  height: 100%;
  flex: auto;
  display: flex;
  min-width: 0;
  flex-flow: column nowrap;
  justify-content: space-evenly;
}
.metaInfo {
  display: flex;
  flex-flow: row nowrap;
  min-width: 0;
  gap: 10px;
  overflow: hidden;
}
.name {
  flex: 0 1 auto;
  min-width: 0;
  .mixin-ellipsis-1();
  color: var(--color-650);
}
.label {
  flex: none;
  font-size: 12px;
  // margin-left: 5px;
}
.likes {
  flex: none;
  font-size: 11px;
  text-align: right;
  padding-top: 3px;
  align-self: flex-start;
}
.likesIcon {
  width: 12px;
  height: 12px;
  margin-right: 3px;
  color: var(--color-primary-alpha-500);
}
.comment_text {
  text-align: justify;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-all;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
.comment_images {
  display: flex;
  flex-flow: row wrap;
  gap: 5px;
  margin-top: 5px;

  img {
    max-width: 240px;
  }
}

// 「回复 / 删除」：做成低调的文字按钮——评论正文才是主角，操作不该抢视线
.actions {
  display: flex;
  flex-flow: row nowrap;
  gap: 12px;
  margin-top: 4px;
}
.actionBtn {
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

.reply_floor {
  padding: 0 0 0 @padding;
  margin-left: @padding * 2;
  border-radius: .5rem;
  &:last-child {
    margin-bottom: 12px;
  }
  .listItem:last-child {
    border-bottom: none;
  }
  .right {
    margin-right: 10px;
  }

  background-color: var(--color-primary-light-500-alpha-700);
}


</style>
