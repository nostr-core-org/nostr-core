import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { Icon } from '@iconify/vue'
import StatCard from './components/StatCard.vue'
import ComparisonBar from './components/ComparisonBar.vue'
import FeatureGrid from './components/FeatureGrid.vue'
import FeatureCard from './components/FeatureCard.vue'
import TeamCard from './components/TeamCard.vue'
import BlogCard from './components/BlogCard.vue'
import BlogFeeds from './components/BlogFeeds.vue'
import Layout from './Layout.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('Icon', Icon)
    app.component('StatCard', StatCard)
    app.component('ComparisonBar', ComparisonBar)
    app.component('FeatureGrid', FeatureGrid)
    app.component('FeatureCard', FeatureCard)
    app.component('TeamCard', TeamCard)
    app.component('BlogCard', BlogCard)
    app.component('BlogFeeds', BlogFeeds)
  },
} satisfies Theme
