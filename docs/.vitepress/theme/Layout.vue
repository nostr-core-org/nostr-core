<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useRoute } from 'vitepress'
import { computed } from 'vue'
import BlogFeeds from './components/BlogFeeds.vue'

const route = useRoute()
// blog posts only (numbered pages), not the blog index
const isBlogPost = computed(() => /\/blog\/\d/.test(route.path))
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <BlogFeeds v-if="isBlogPost" variant="inline" />
    </template>
    <template #doc-after>
      <BlogFeeds v-if="isBlogPost" />
    </template>
  </DefaultTheme.Layout>
</template>
