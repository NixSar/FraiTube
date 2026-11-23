<script setup lang="ts">
import { ref } from 'vue'
import type { CommentSort, VideoComment } from '@fraitube/youtube/types'
import ChannelAvatar from '../subscriptions/ChannelAvatar.vue'
import { useSubscriptions } from '../subscriptions/store'
import RichText from './RichText.vue'

/** `reply` is set for comments shown as replies. */
const props = defineProps<{ comment: VideoComment; videoId: string; sort: CommentSort; reply?: boolean }>()
const emit = defineEmits<{ seek: [seconds: number] }>()

const { avatarOf } = useSubscriptions()
const showReplies = ref(false)
const replies = ref<VideoComment[]>([])
const moreReplies = ref<string>()
const loading = ref(false)
const error = ref('')

async function loadReplies(continuation: string | undefined): Promise<void> {
  if (!continuation || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const page = await window.fraitube.getComments({ videoId: props.videoId, sort: props.sort, continuation })
    replies.value = [...replies.value, ...page.comments]
    moreReplies.value = page.continuation
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

function toggleReplies(): void {
  showReplies.value = !showReplies.value
  if (showReplies.value && replies.value.length === 0) {
    void loadReplies(props.comment.replies)
  }
}
</script>

<template>
  <article class="comment">
    <ChannelAvatar
      :name="comment.authorName.replace(/^@/, '') || comment.authorChannelId"
      :avatar="comment.authorIcon || avatarOf(comment.authorChannelId)"
      :size="reply ? 24 : 40"
    />
    <div class="body">
      <p
        v-if="comment.pinnedText"
        class="pinned"
      >
        {{ comment.pinnedText }}
      </p>
      <p class="header">
        <span
          class="author"
          :class="{ creator: comment.isCreator }"
        >{{ comment.authorName }}<span
          v-if="comment.isVerified"
          class="verified"
          title="Verified"
        > &#10003;</span></span>
        <span class="published">{{ comment.publishedText }}</span>
      </p>
      <p class="content">
        <RichText
          :parts="comment.content"
          @seek="emit('seek', $event)"
        />
      </p>
      <div class="toolbar">
        <span
          v-if="comment.likesText"
          class="likes"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          ><path d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z" /></svg>
          {{ comment.likesText }}
        </span>
        <span
          v-if="comment.heartText"
          class="heart"
          :title="comment.heartText"
        >
          <img
            v-if="comment.heartIcon"
            :src="comment.heartIcon"
            alt=""
            loading="lazy"
          >
          <span class="heart-mark">&#10084;</span>
        </span>
      </div>
      <button
        v-if="comment.replies"
        type="button"
        class="replies-toggle"
        @click="toggleReplies"
      >
        {{ showReplies ? 'Hide replies' : comment.replyCount === 1 ? '1 reply' : `${comment.replyCount || ''} replies`.trim() }}
      </button>
      <div
        v-if="showReplies"
        class="replies"
      >
        <CommentItem
          v-for="item in replies"
          :key="item.id"
          :comment="item"
          :video-id="videoId"
          :sort="sort"
          reply
          @seek="emit('seek', $event)"
        />
        <p v-if="loading">
          Loading
        </p>
        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>
        <button
          v-if="moreReplies && !loading"
          type="button"
          class="replies-toggle"
          @click="loadReplies(moreReplies)"
        >
          Show more replies
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.comment {
  display: flex;
  gap: 12px;
  margin-block-start: 16px;
}

.body {
  flex: 1;
  min-inline-size: 0;
}

p {
  margin: 0;
}

.pinned {
  margin-block-end: 2px;
  font-size: 0.8rem;
  opacity: 0.75;
}

.header {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  align-items: baseline;
  font-size: 0.85rem;
}

.author {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.author.creator {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--color-surface);
}

.published {
  opacity: 0.7;
}

.content {
  margin-block-start: 2px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: center;
  margin-block-start: 4px;
  font-size: 0.85rem;
}

.likes {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.likes svg {
  inline-size: 14px;
  block-size: 14px;
  fill: currentColor;
}

.heart {
  position: relative;
  display: inline-flex;
}

.heart img {
  inline-size: 18px;
  block-size: 18px;
  border-radius: 50%;
}

.heart-mark {
  color: #ff4d6a;
  font-size: 0.7rem;
}

.heart img + .heart-mark {
  position: absolute;
  inset-block-end: -4px;
  inset-inline-end: -6px;
}

.replies-toggle {
  margin-block-start: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.error {
  color: #ff6b6b;
}
</style>
