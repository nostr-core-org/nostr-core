import { createContentLoader, defineConfig, type SiteConfig } from 'vitepress'
import { statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SITE = 'https://nostr-core.netlify.app'
const BLOG_TITLE = 'nostr-core Blog'
const BLOG_DESCRIPTION = 'Thoughts on building with Nostr, from the team behind nostr-core.'

type FeedPost = {
  url: string
  title: string
  description: string
  image: string
  date: Date
  html: string
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&ZeroWidthSpace;|​/g, '').trim()
const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const absolutize = (html: string) =>
  html.replace(/(src|href)="\//g, `$1="${SITE}/`)
// Strip viewer chrome that only makes sense inside the VitePress app.
const cleanHtml = (html: string) =>
  html
    .replace(/<a class="header-anchor"[\s\S]*?<\/a>/g, '')
    .replace(/<button title="Copy Code" class="copy"><\/button>/g, '')
    .replace(/<span class="lang">[^<]*<\/span>/g, '')

async function collectPosts(): Promise<FeedPost[]> {
  const pages = await createContentLoader('blog/*.md', { render: true }).load()
  return pages
    .filter(p => /\/blog\/\d/.test(p.url))
    .map(p => {
      const html = cleanHtml(p.html ?? '')
      const title = stripTags(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? p.url)
      const description = stripTags(/<strong>([\s\S]*?)<\/strong>/.exec(html)?.[1] ?? '')
      const image = /<img[^>]+src="([^"]+)"/.exec(html)?.[1] ?? ''
      return {
        url: `${SITE}${p.url}`,
        title,
        description,
        image: image.startsWith('/') ? `${SITE}${image}` : image,
        date: new Date(p.frontmatter.date),
        html: absolutize(html),
      }
    })
    // newest first; same-day posts tie-break by slug number
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.url.localeCompare(a.url))
}

function enclosureFor(post: FeedPost, outDir: string): { url: string; length: number } | undefined {
  // Feed readers want a raster image; every SVG header ships a PNG twin.
  const png = post.image.replace(`${SITE}/`, '').replace(/\.svg$/, '.png')
  if (!png) return undefined
  try {
    return { url: `${SITE}/${png}`, length: statSync(join(outDir, png)).size }
  } catch {
    return undefined
  }
}

function renderRss(posts: FeedPost[], outDir: string): string {
  const items = posts.map(p => {
    const enclosure = enclosureFor(p, outDir)
    return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <description>${escapeXml(p.description)}</description>
${enclosure ? `      <enclosure url="${enclosure.url}" length="${enclosure.length}" type="image/png"/>\n` : ''}      <content:encoded><![CDATA[${p.html}]]></content:encoded>
    </item>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(BLOG_TITLE)}</title>
    <link>${SITE}/blog/</link>
    <description>${escapeXml(BLOG_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${(posts[0]?.date ?? new Date()).toUTCString()}</lastBuildDate>
    <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

function renderJsonFeed(posts: FeedPost[]): string {
  return JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    home_page_url: `${SITE}/blog/`,
    feed_url: `${SITE}/blog/feed.json`,
    items: posts.map(p => ({
      id: p.url,
      url: p.url,
      title: p.title,
      summary: p.description,
      image: p.image,
      date_published: p.date.toISOString(),
      content_html: p.html,
    })),
  }, null, 2)
}

export default defineConfig({
  title: 'nostr-core',
  description: 'Dead simple, vendor neutral NWC client',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/nwc-logo.svg' }],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: BLOG_TITLE, href: `${SITE}/blog/feed.xml` }],
    ['link', { rel: 'alternate', type: 'application/feed+json', title: BLOG_TITLE, href: `${SITE}/blog/feed.json` }],
  ],

  buildEnd: async (config: SiteConfig) => {
    const posts = await collectPosts()
    writeFileSync(join(config.outDir, 'blog', 'feed.xml'), renderRss(posts, config.outDir))
    writeFileSync(join(config.outDir, 'blog', 'feed.json'), renderJsonFeed(posts))
  },

  themeConfig: {
    logo: '/nwc-logo.svg',

    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Blogs', link: '/blog/', activeMatch: '/blog/' },
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API Reference', link: '/api/nwc' },
      { text: 'Agent Docs', link: '/agent' },
      { text: 'Team', link: '/team' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          {
            text: 'Getting Started',
            collapsed: true,
            items: [
              { text: 'Introduction', link: '/guide/introduction' },
              { text: 'Installation', link: '/guide/installation' },
              { text: 'Quick Start', link: '/guide/quick-start' },
            ],
          },
          {
            text: 'Core Concepts',
            collapsed: true,
            items: [
              { text: 'Wallet Operations', link: '/guide/wallet-operations' },
              { text: 'Encryption', link: '/guide/encryption' },
              { text: 'Relays', link: '/guide/relays' },
              { text: 'Error Handling', link: '/guide/error-handling' },
            ],
          },
          {
            text: 'Resources',
            collapsed: true,
            items: [
              { text: 'Comparison', link: '/guide/comparison' },
            ],
          },
        ],
      },
      {
        text: 'API Reference',
        items: [
          {
            text: 'Client',
            collapsed: true,
            items: [
              { text: 'NWC', link: '/api/nwc' },
              { text: 'NostrConnect', link: '/api/nip46' },
            ],
          },
          {
            text: 'Primitives',
            collapsed: true,
            items: [
              { text: 'Relay', link: '/api/relay' },
              { text: 'RelayPool', link: '/api/pool' },
              { text: 'Signer', link: '/api/signer' },
              { text: 'Filter', link: '/api/filter' },
              { text: 'Event', link: '/api/event' },
              { text: 'Crypto', link: '/api/crypto' },
            ],
          },
          {
            text: 'NIPs',
            collapsed: true,
            items: [
              { text: 'NIP-02', link: '/api/nip02' },
              { text: 'NIP-04', link: '/api/nip04' },
              { text: 'NIP-05', link: '/api/nip05' },
              { text: 'NIP-06', link: '/api/nip06' },
              { text: 'NIP-07', link: '/api/nip07' },
              { text: 'NIP-09', link: '/api/nip09' },
              { text: 'NIP-10', link: '/api/nip10' },
              { text: 'NIP-11', link: '/api/nip11' },
              { text: 'NIP-13', link: '/api/nip13' },
              { text: 'NIP-17', link: '/api/nip17' },
              { text: 'NIP-18', link: '/api/nip18' },
              { text: 'NIP-19', link: '/api/nip19' },
              { text: 'NIP-21', link: '/api/nip21' },
              { text: 'NIP-22', link: '/api/nip22' },
              { text: 'NIP-23', link: '/api/nip23' },
              { text: 'NIP-24', link: '/api/nip24' },
              { text: 'NIP-25', link: '/api/nip25' },
              { text: 'NIP-27', link: '/api/nip27' },
              { text: 'NIP-28', link: '/api/nip28' },
              { text: 'NIP-29', link: '/api/nip29' },
              { text: 'NIP-30', link: '/api/nip30' },
              { text: 'NIP-31', link: '/api/nip31' },
              { text: 'NIP-36', link: '/api/nip36' },
              { text: 'NIP-40', link: '/api/nip40' },
              { text: 'NIP-42', link: '/api/nip42' },
              { text: 'NIP-44', link: '/api/nip44' },
              { text: 'NIP-46', link: '/api/nip46' },
              { text: 'NIP-48', link: '/api/nip48' },
              { text: 'NIP-50', link: '/api/nip50' },
              { text: 'NIP-51', link: '/api/nip51' },
              { text: 'NIP-52', link: '/api/nip52' },
              { text: 'NIP-56', link: '/api/nip56' },
              { text: 'NIP-57', link: '/api/nip57' },
              { text: 'NIP-58', link: '/api/nip58' },
              { text: 'NIP-59', link: '/api/nip59' },
              { text: 'NIP-60', link: '/api/nip60' },
              { text: 'NIP-61', link: '/api/nip61' },
              { text: 'NIP-65', link: '/api/nip65' },
              { text: 'NIP-68', link: '/api/nip68' },
              { text: 'NIP-69', link: '/api/nip69' },
              { text: 'NIP-75', link: '/api/nip75' },
              { text: 'NIP-78', link: '/api/nip78' },
              { text: 'NIP-87', link: '/api/nip87' },
              { text: 'NIP-98', link: '/api/nip98' },
            ],
          },
          {
            text: 'Protocols',
            collapsed: true,
            items: [
              { text: 'LNURL Protocol', link: '/api/lnurl' },
              { text: 'BOLT-11 Decoder', link: '/api/bolt11' },
              { text: 'Blossom Media', link: '/api/blossom' },
              { text: 'RSS Import', link: '/api/rss' },
            ],
          },
          {
            text: 'Validation',
            collapsed: true,
            items: [
              { text: 'Schema', link: '/api/schema' },
              { text: 'Policy', link: '/api/policy' },
            ],
          },
          {
            text: 'Experimental',
            collapsed: true,
            items: [
              { text: 'Mail over Nostr', link: '/api/mail' },
              { text: 'Appointment Scheduling', link: '/api/scheduling' },
            ],
          },
          {
            text: 'Utilities',
            collapsed: true,
            items: [
              { text: 'Types', link: '/api/types' },
              { text: 'Errors', link: '/api/errors' },
              { text: 'Utils', link: '/api/utils' },
            ],
          },
        ],
      },
    ],

    socialLinks: [

      { icon: 'github', link: 'https://github.com/nostr-core-org/nostr-core' },
      { icon: 'x', link: 'https://x.com/PratikPatel_227' },
    ],

    footer: {
      message: 'Released under the MIT License.',
    },
  },
})
