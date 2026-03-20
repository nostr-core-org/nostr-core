<script setup lang="ts">
defineProps<{
  title: string
  description: string
  image: string
  link: string
}>()
</script>

<template>
  <a :href="link" class="blog-card">
    <div class="blog-card-image">
      <img :src="image" :alt="title" loading="lazy" />
    </div>
    <div class="blog-card-body">
      <h3 class="blog-card-title">{{ title }}</h3>
      <p class="blog-card-description">{{ description }}</p>
      <span class="blog-card-read">Read more &rarr;</span>
    </div>
  </a>
</template>

<style scoped>
.blog-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
  text-decoration: none;
  color: inherit;
}

.blog-card:hover {
  border-color: var(--nwc-purple);
  box-shadow: 0 4px 20px rgba(137, 127, 255, 0.18);
  transform: translateY(-2px);
}

.blog-card-image {
  width: 100%;
  aspect-ratio: 2 / 1;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.blog-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.blog-card:hover .blog-card-image img {
  transform: scale(1.03);
}

.blog-card-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.blog-card-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin: 0 0 0.5rem;
  line-height: 1.4;
}

.blog-card-description {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin: 0 0 1rem;
  flex: 1;
}

.blog-card-read {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--nwc-orange);
  transition: color 0.2s;
}

.blog-card:hover .blog-card-read {
  color: var(--nwc-purple);
}
</style>
