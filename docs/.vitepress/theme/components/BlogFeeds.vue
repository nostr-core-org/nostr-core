<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  /** 'inline' renders a slim one-line version; default is the full box. */
  variant?: 'inline' | 'box'
}>()

const SITE = 'https://nostr-core.netlify.app'
const feeds = [
  { label: 'RSS 2.0', path: '/blog/feed.xml' },
  { label: 'JSON Feed', path: '/blog/feed.json' },
]

const copied = ref<string | null>(null)

async function copy(path: string) {
  try {
    await navigator.clipboard.writeText(SITE + path)
    copied.value = path
    setTimeout(() => { if (copied.value === path) copied.value = null }, 1600)
  } catch {
    /* clipboard unavailable; the link itself still works */
  }
}
</script>

<template>
  <div v-if="props.variant === 'inline'" class="bf-inline">
    <span class="bf-inline-label">Feeds:</span>
    <a v-for="f in feeds" :key="f.path" :href="f.path" class="bf-inline-link">{{ f.label }}</a>
  </div>

  <div v-else class="bf-box">
    <p class="bf-title">Subscribe to this blog</p>
    <p class="bf-sub">
      Works in any feed reader, and
      <a href="/api/rss"><code>rss.importFeedAsDrafts</code></a>
      turns it straight into Nostr long-form events.
    </p>
    <div v-for="f in feeds" :key="f.path" class="bf-row">
      <span class="bf-badge">{{ f.label }}</span>
      <a :href="f.path" class="bf-url"><code>{{ SITE + f.path }}</code></a>
      <button class="bf-copy" type="button" :title="'Copy ' + f.label + ' URL'" @click="copy(f.path)">
        {{ copied === f.path ? 'copied' : 'copy' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* slim variant, sits above a post */
.bf-inline {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 0.6em;
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  margin-bottom: 0.5rem;
}

.bf-inline-link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.bf-inline-link:hover {
  text-decoration: underline;
}

/* full box, sits under a post and on the blog index */
.bf-box {
  margin-top: 2rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.bf-title {
  margin: 0;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.bf-sub {
  margin: 0.25rem 0 0.9rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.bf-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0;
  min-width: 0;
}

.bf-badge {
  flex: none;
  width: 88px;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0;
  border-radius: 6px;
  border: 1px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.bf-url {
  min-width: 0;
  text-decoration: none;
}

.bf-url code {
  display: block;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
  background: transparent;
  padding: 0;
  color: var(--vp-c-text-2);
}

.bf-url:hover code {
  color: var(--vp-c-brand-1);
}

.bf-copy {
  flex: none;
  margin-left: auto;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg);
  cursor: pointer;
}

.bf-copy:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>
