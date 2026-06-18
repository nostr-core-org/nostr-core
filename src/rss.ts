import { XMLParser } from 'fast-xml-parser'
import TurndownService from 'turndown'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { utf8Encoder } from './utils.js'
import { createLongFormEventTemplate, type LongFormContent } from './nip23.js'
import {
  createAuthEventTemplate,
  uploadBlob,
  mirrorBlob,
  type BlobDescriptor,
} from './blossom.js'
import type { Signer } from './signer.js'
import type { NostrEvent } from './event.js'

// ── Types ──────────────────────────────────────────────────────────────

export type FeedFormat = 'rss' | 'atom' | 'jsonfeed'

export type FeedItem = {
  /** Stable id from the feed (guid/id/url). Used to derive the NIP-23 d-tag. */
  guid: string
  title: string
  link?: string
  summary?: string
  /** Full HTML body when the feed provides it; falls back to summary HTML. */
  contentHtml: string
  /** Unix seconds. */
  publishedAt?: number
  categories?: string[]
  image?: string
  author?: string
}

export type Feed = {
  format: FeedFormat
  title: string
  link?: string
  description?: string
  items: FeedItem[]
}

export class RssError extends Error {
  code: string
  constructor(message: string, code = 'RSS_ERROR') {
    super(message)
    this.name = 'RssError'
    this.code = code
  }
}

// ── Internal helpers ───────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
  cdataPropName: '#cdata',
  htmlEntities: true,
  // Real-world feeds embed large escaped HTML blobs in <content:encoded> /
  // <description>. fast-xml-parser (4.5.x) counts every entity token
  // (&lt; &gt; &amp; …) cumulatively across the whole document and aborts
  // past processEntities.maxTotalExpansions (default 1000) — a 400 KB feed
  // trips this inside the first <item>, surfacing as
  // "Entity expansion limit exceeded". These are 1:1 predefined entities
  // (not recursive expansion bombs), so raising the cap is safe.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 1_000_000,
  },
  // Same feeds also nest HTML deeper than the default cap of 100, which
  // throws "Maximum nested tags exceeded". Raise that too.
  maxNestedTags: 10000,
  isArray: (name) =>
    ['item', 'entry', 'category', 'author'].includes(name),
})

function pickLink(linkNode: unknown): string | undefined {
  if (!linkNode) return undefined
  const arr = Array.isArray(linkNode) ? linkNode : [linkNode]
  for (const l of arr) {
    if (typeof l === 'string' && l) return l
    if (l && typeof l === 'object') {
      const rec = l as Record<string, unknown>
      if ((rec['@_rel'] ?? 'alternate') !== 'alternate') continue
      const href = rec['@_href']
      if (typeof href === 'string' && href) return href
      const t = text(l)
      if (t) return t
    }
  }
  return undefined
}

function text(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj['#cdata'] === 'string') return obj['#cdata'] as string
    if (typeof obj['#text'] === 'string') return obj['#text'] as string
  }
  return ''
}

function parseDate(s: string | undefined): number | undefined {
  if (!s) return undefined
  const t = Date.parse(s)
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined
}

function firstImageFromHtml(html: string): string | undefined {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m?.[1]
}

function deriveIdentifier(item: { guid?: string; link?: string; title?: string }, prefix?: string): string {
  const seed = item.guid || item.link || item.title || ''
  if (!seed) {
    throw new RssError('Cannot derive identifier: item has no guid, link, or title', 'NO_IDENTIFIER')
  }
  const hash = bytesToHex(sha256(utf8Encoder.encode(seed))).slice(0, 16)
  return prefix ? `${prefix}${hash}` : hash
}

// ── Feed parsing ───────────────────────────────────────────────────────

function parseRss(root: any): Feed {
  const channel = root.rss?.channel
  if (!channel) throw new RssError('Missing <rss><channel>', 'INVALID_RSS')

  const items: FeedItem[] = (channel.item ?? []).map((it: any) => {
    const contentEncoded = text(it['content:encoded'])
    const description = text(it.description)
    const contentHtml = contentEncoded || description
    const link = pickLink(it.link)
    const categories = (it.category ?? [])
      .map((c: any) => text(c))
      .filter((c: string) => c.length > 0)
    const enclosure = it.enclosure
    const enclosureUrl =
      enclosure && (enclosure['@_type'] ?? '').startsWith('image/')
        ? enclosure['@_url']
        : undefined
    const mediaContent = it['media:content']?.['@_url']
    const mediaThumb = it['media:thumbnail']?.['@_url']

    return {
      guid: text(it.guid) || link || text(it.title),
      title: text(it.title),
      link,
      summary: description && description !== contentHtml ? description : undefined,
      contentHtml,
      publishedAt: parseDate(text(it.pubDate)),
      categories: categories.length ? categories : undefined,
      image: enclosureUrl || mediaContent || mediaThumb || firstImageFromHtml(contentHtml),
      author: text(it['dc:creator']) || text(it.author) || undefined,
    }
  })

  return {
    format: 'rss',
    title: text(channel.title),
    link: typeof channel.link === 'string' ? channel.link : text(channel.link),
    description: text(channel.description),
    items,
  }
}

function parseAtom(root: any): Feed {
  const feed = root.feed
  if (!feed) throw new RssError('Missing <feed>', 'INVALID_ATOM')

  const items: FeedItem[] = (feed.entry ?? []).map((e: any) => {
    const contentHtml = text(e.content) || text(e.summary)
    const summary = text(e.summary)
    const link = pickLink(e.link)
    const categories = (e.category ?? [])
      .map((c: any) => c['@_term'] || text(c))
      .filter((c: string) => c && c.length > 0)
    const authorArr = e.author ?? []
    const author = authorArr.length ? text(authorArr[0]?.name) : undefined

    return {
      guid: text(e.id) || link || text(e.title),
      title: text(e.title),
      link,
      summary: summary && summary !== contentHtml ? summary : undefined,
      contentHtml,
      publishedAt: parseDate(text(e.published) || text(e.updated)),
      categories: categories.length ? categories : undefined,
      image: firstImageFromHtml(contentHtml),
      author,
    }
  })

  return {
    format: 'atom',
    title: text(feed.title),
    link: pickLink(feed.link),
    description: text(feed.subtitle),
    items,
  }
}

function parseJsonFeed(json: any): Feed {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) {
    throw new RssError('Invalid JSON Feed', 'INVALID_JSONFEED')
  }
  const items: FeedItem[] = json.items.map((it: any) => {
    const contentHtml = it.content_html || it.content_text || it.summary || ''
    return {
      guid: it.id || it.url || it.title,
      title: it.title || '',
      link: it.url,
      summary: it.summary,
      contentHtml,
      publishedAt: parseDate(it.date_published),
      categories: Array.isArray(it.tags) ? it.tags : undefined,
      image: it.image || it.banner_image || firstImageFromHtml(contentHtml),
      author: it.author?.name || (Array.isArray(it.authors) ? it.authors[0]?.name : undefined),
    }
  })
  return {
    format: 'jsonfeed',
    title: json.title || '',
    link: json.home_page_url,
    description: json.description,
    items,
  }
}

/**
 * Parse a feed string. Auto-detects RSS 2.0, Atom, or JSON Feed.
 */
export function parseFeed(input: string): Feed {
  const trimmed = input.trimStart()
  if (trimmed.startsWith('{')) {
    return parseJsonFeed(JSON.parse(trimmed))
  }
  const root = xmlParser.parse(trimmed)
  if (root.rss) return parseRss(root)
  if (root.feed) return parseAtom(root)
  throw new RssError('Unrecognized feed format', 'UNKNOWN_FORMAT')
}

/**
 * Fetch a feed URL and parse it. Uses the global fetch.
 *
 * Note: in browsers, the target site must allow CORS. If it doesn't, fetch
 * the XML through your own proxy and call `parseFeed` directly.
 */
export async function fetchFeed(url: string, init?: RequestInit): Promise<Feed> {
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new RssError(`Feed fetch failed: ${res.status} ${res.statusText}`, 'FETCH_ERROR')
  }
  return parseFeed(await res.text())
}

// ── HTML → Markdown ────────────────────────────────────────────────────

let _turndown: TurndownService | undefined
function getTurndown(): TurndownService {
  if (!_turndown) {
    _turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '_',
    })
  }
  return _turndown
}

/**
 * Convert HTML to Markdown using turndown.
 *
 * Browser/Deno: works out of the box. Node: turndown ships with a DOM shim,
 * but if you see errors install `@mixmark-io/domino` explicitly.
 */
export function htmlToMarkdown(html: string): string {
  return getTurndown().turndown(html)
}

// ── Feed item → NIP-23 draft ───────────────────────────────────────────

export type ItemToDraftOptions = {
  /** Extra hashtags merged with the item's categories. */
  hashtags?: string[]
  /** Prefix prepended to the derived d-tag identifier. */
  identifierPrefix?: string
  /** Append the original post URL as a footer when present (default true). */
  appendSourceLink?: boolean
  /** Override the HTML→Markdown converter. Defaults to turndown. */
  htmlToMarkdown?: (html: string) => string
}

/**
 * Convert a FeedItem into a `LongFormContent` ready for `createLongFormEvent`.
 *
 * The result is markdown by default. Pass `isDraft: true` on the caller side
 * to publish as kind 30024.
 */
export function itemToDraft(item: FeedItem, opts: ItemToDraftOptions = {}): LongFormContent {
  const convert = opts.htmlToMarkdown ?? htmlToMarkdown
  let markdown = convert(item.contentHtml || '').trim()

  if ((opts.appendSourceLink ?? true) && item.link) {
    markdown += `\n\n---\n\n*Originally published at [${item.link}](${item.link})*`
  }

  const tagSet = new Set<string>()
  for (const t of item.categories ?? []) tagSet.add(t.toLowerCase().trim())
  for (const t of opts.hashtags ?? []) tagSet.add(t.toLowerCase().trim())
  tagSet.delete('')

  return {
    identifier: deriveIdentifier(item, opts.identifierPrefix),
    title: item.title || undefined,
    image: item.image,
    summary: item.summary,
    publishedAt: item.publishedAt,
    hashtags: tagSet.size ? Array.from(tagSet) : undefined,
    content: markdown,
  }
}

// ── Blossom image rehosting ────────────────────────────────────────────

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

export type RehostMode = 'mirror' | 'upload'

export type RehostOptions = {
  servers: string[]
  signer: Signer
  /** 'mirror' (BUD-04, server-side pull — no browser CORS) or 'upload' (fetch then PUT). */
  mode?: RehostMode
  /** Seconds until the Blossom auth token expires (default 300). */
  authTtl?: number
}

/**
 * Find image URLs in markdown, push each to a Blossom server, and rewrite
 * the markdown to reference the Blossom-hosted blob.
 *
 * In `mirror` mode the Blossom server fetches the URL itself (recommended in
 * the browser to avoid CORS). In `upload` mode we download the image then
 * PUT it. Already-hosted Blossom URLs and data: URIs are left untouched.
 */
export async function rehostImagesInMarkdown(
  markdown: string,
  opts: RehostOptions,
): Promise<{ markdown: string; blobs: BlobDescriptor[] }> {
  const mode: RehostMode = opts.mode ?? 'mirror'
  const ttl = opts.authTtl ?? 300
  const servers = opts.servers.filter(Boolean)
  if (!servers.length) {
    throw new RssError('rehostImagesInMarkdown: at least one Blossom server is required', 'NO_SERVERS')
  }
  const primary = servers[0]

  const urls = new Set<string>()
  for (const match of markdown.matchAll(MD_IMAGE_RE)) {
    const url = match[2]
    if (!url || url.startsWith('data:')) continue
    urls.add(url)
  }

  const blobs: BlobDescriptor[] = []
  const remap = new Map<string, string>()

  for (const url of urls) {
    try {
      let blob: BlobDescriptor
      if (mode === 'mirror') {
        const authTpl = createAuthEventTemplate({
          action: 'upload',
          content: 'Mirror image from RSS import',
          expiration: Math.floor(Date.now() / 1000) + ttl,
        })
        const authEvent = (await opts.signer.signEvent(authTpl)) as NostrEvent
        blob = await mirrorBlob(primary, url, authEvent)
      } else {
        const res = await fetch(url)
        if (!res.ok) throw new RssError(`Image fetch failed: ${res.status}`, 'IMG_FETCH')
        const data = new Uint8Array(await res.arrayBuffer())
        const hash = bytesToHex(sha256(data))
        const authTpl = createAuthEventTemplate({
          action: 'upload',
          content: 'Upload image from RSS import',
          expiration: Math.floor(Date.now() / 1000) + ttl,
          hashes: [hash],
          size: data.length,
        })
        const authEvent = (await opts.signer.signEvent(authTpl)) as NostrEvent
        blob = await uploadBlob(primary, data, authEvent, res.headers.get('content-type') ?? undefined)
      }
      blobs.push(blob)
      remap.set(url, blob.url)
    } catch {
      // Leave the original URL in place if rehosting fails for one image.
    }
  }

  const rewritten = markdown.replace(MD_IMAGE_RE, (full, alt, url) => {
    const next = remap.get(url)
    return next ? `![${alt}](${next})` : full
  })

  return { markdown: rewritten, blobs }
}

// ── One-shot import ────────────────────────────────────────────────────

export type ImportFeedOptions = {
  signer: Signer
  /** Cap on items to import (default: all). */
  limit?: number
  /** Skip items published before this unix-seconds timestamp. */
  since?: number
  /** Forwarded to itemToDraft. */
  draft?: ItemToDraftOptions
  /** When provided, image URLs are rehosted via Blossom before signing. */
  blossom?: {
    servers: string[]
    mode?: RehostMode
  }
  /** Publish as kind 30024 draft (default true). false → kind 30023. */
  asDraft?: boolean
}

/**
 * Glue: fetch a feed, transform each item to a NIP-23 long-form event, and
 * return the signed events. Caller is responsible for publishing to relays.
 */
export async function importFeedAsDrafts(
  feedUrl: string,
  opts: ImportFeedOptions,
): Promise<NostrEvent[]> {
  const feed = await fetchFeed(feedUrl)
  const asDraft = opts.asDraft ?? true
  const out: NostrEvent[] = []

  let items = feed.items
  if (opts.since !== undefined) {
    items = items.filter((i) => (i.publishedAt ?? 0) >= opts.since!)
  }
  if (opts.limit !== undefined) {
    items = items.slice(0, opts.limit)
  }

  for (const item of items) {
    const article = itemToDraft(item, opts.draft)

    if (opts.blossom?.servers?.length) {
      const { markdown } = await rehostImagesInMarkdown(article.content, {
        servers: opts.blossom.servers,
        mode: opts.blossom.mode,
        signer: opts.signer,
      })
      article.content = markdown
    }

    const tpl = createLongFormEventTemplate({ ...article, isDraft: asDraft })
    const signed = (await opts.signer.signEvent(tpl)) as NostrEvent
    out.push(signed)
  }

  return out
}
