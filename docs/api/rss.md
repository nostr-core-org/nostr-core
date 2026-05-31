# RSS Import

Import articles from RSS 2.0, Atom, and JSON Feed sources and convert them into signed [NIP-23](./nip23) long-form events. Optionally rehost inline images on Blossom servers as part of the same pipeline.

## Import

```ts
import { rss } from 'nostr-core'
// or import individual functions
import {
  parseFeed,
  fetchFeed,
  htmlToMarkdown,
  itemToDraft,
  rehostImagesInMarkdown,
  importFeedAsDrafts,
  RssError,
} from 'nostr-core'
```

## Feed Types

```ts
type FeedFormat = 'rss' | 'atom' | 'jsonfeed'

type FeedItem = {
  guid: string
  title: string
  link?: string
  summary?: string
  contentHtml: string
  publishedAt?: number
  categories?: string[]
  image?: string
  author?: string
}

type Feed = {
  format: FeedFormat
  title: string
  link?: string
  description?: string
  items: FeedItem[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `guid` | `string` | Stable feed-level id (RSS `<guid>`, Atom `<id>`, JSON Feed `id`). Becomes the seed for the NIP-23 `d`-tag. |
| `title` | `string` | Item title. |
| `link` | `string` (optional) | Canonical URL of the original post. |
| `summary` | `string` (optional) | Short excerpt or description. |
| `contentHtml` | `string` | Full HTML body when the feed provides it; otherwise falls back to the summary HTML. |
| `publishedAt` | `number` (optional) | Publish date in unix seconds. |
| `categories` | `string[]` (optional) | Feed categories — mapped to NIP-23 `t` hashtag tags. |
| `image` | `string` (optional) | Lead image URL extracted from `enclosure`, `media:content`, `media:thumbnail`, or the first `<img>` in the body. |
| `author` | `string` (optional) | Author name (RSS `<dc:creator>`, Atom `<author><name>`, JSON Feed `author.name`). |

## RssError Class

```ts
class RssError extends Error {
  code: string
}
```

| Code | When |
|------|------|
| `INVALID_RSS` | XML parsed but no `<rss><channel>` |
| `INVALID_ATOM` | XML parsed but no `<feed>` |
| `INVALID_JSONFEED` | JSON parsed but missing `items` array |
| `UNKNOWN_FORMAT` | Could not detect RSS, Atom, or JSON Feed |
| `FETCH_ERROR` | Network fetch failed (also surfaces HTTP status) |
| `NO_IDENTIFIER` | Item has no guid, link, or title to derive a `d`-tag |
| `NO_SERVERS` | `rehostImagesInMarkdown` called without Blossom servers |
| `IMG_FETCH` | Image download failed in `upload` mode |

## parseFeed

```ts
function parseFeed(input: string): Feed
```

Parses a feed string. Auto-detects RSS 2.0, Atom, or JSON Feed. Pure — no network.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string` | Raw XML or JSON text |

**Returns:** `Feed` — normalized representation regardless of source format.

```ts
const feed = rss.parseFeed(xmlString)
console.log(feed.format, feed.title, feed.items.length)
```

## fetchFeed

```ts
function fetchFeed(url: string, init?: RequestInit): Promise<Feed>
```

Fetches a feed URL using the global `fetch` and parses the response.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Absolute feed URL |
| `init` | `RequestInit` (optional) | Standard fetch options (headers, signal, etc.) |

**Returns:** `Promise<Feed>`.

**Browser CORS:** the target site must allow cross-origin requests. If it does not, fetch the XML through your own proxy (or a Cloudflare Worker) and call `parseFeed` directly.

```ts
const feed = await rss.fetchFeed('https://example.com/feed/')
```

## htmlToMarkdown

```ts
function htmlToMarkdown(html: string): string
```

Converts HTML to Markdown via [turndown](https://github.com/mixmark-io/turndown). Used internally by `itemToDraft`; exposed for direct use.

| Parameter | Type | Description |
|-----------|------|-------------|
| `html` | `string` | HTML fragment |

**Returns:** `string` — Markdown with ATX headings, fenced code blocks, and `-` bullet markers.

```ts
const md = rss.htmlToMarkdown('<h1>Hi</h1><p><strong>bold</strong></p>')
// "# Hi\n\n**bold**"
```

## itemToDraft

```ts
function itemToDraft(item: FeedItem, opts?: ItemToDraftOptions): LongFormContent
```

Converts a `FeedItem` into a [`LongFormContent`](./nip23#longformcontent-type) ready for `createLongFormEvent` (set `isDraft: true` for kind 30024, or false/omit for kind 30023).

```ts
type ItemToDraftOptions = {
  hashtags?: string[]
  identifierPrefix?: string
  appendSourceLink?: boolean
  htmlToMarkdown?: (html: string) => string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `hashtags` | `string[]` | Extra hashtags merged (lowercased, de-duped) with the item's `categories`. |
| `identifierPrefix` | `string` | Prepended to the derived `d`-tag identifier (e.g. `'rss-'`). |
| `appendSourceLink` | `boolean` | If `true` (default), appends `*Originally published at [link](link)*` when the item has a `link`. |
| `htmlToMarkdown` | `(html) => string` | Override the HTML → Markdown converter (default: turndown). |

The `d`-tag is derived as `sha256(guid \|\| link \|\| title)` (16 hex chars). Re-importing the same item produces the same identifier, so the kind 30023 publish will replace any previous draft.

```ts
const article = rss.itemToDraft(feed.items[0], {
  identifierPrefix: 'rss-',
  hashtags: ['imported'],
})
```

## rehostImagesInMarkdown

```ts
function rehostImagesInMarkdown(
  markdown: string,
  opts: RehostOptions,
): Promise<{ markdown: string; blobs: BlobDescriptor[] }>
```

Scans markdown for `![alt](url)` images, pushes each to a Blossom server, and rewrites the markdown to point at the new Blossom URL. `data:` URIs and missing URLs are skipped. If a single image fails to rehost, the original URL is preserved and other images still process.

```ts
type RehostMode = 'mirror' | 'upload'

type RehostOptions = {
  servers: string[]
  signer: Signer
  mode?: RehostMode
  authTtl?: number
}
```

| Field | Type | Description |
|-------|------|-------------|
| `servers` | `string[]` | Blossom server URLs; the first is used as the primary. |
| `signer` | `Signer` | Used to sign kind 24242 auth events (BUD-11). |
| `mode` | `'mirror' \| 'upload'` | `'mirror'` (default, BUD-04) — Blossom server pulls the URL itself, no browser CORS. `'upload'` — client downloads the image then PUTs it. |
| `authTtl` | `number` | Auth event lifetime in seconds (default `300`). |

**Returns:** the rewritten markdown plus the list of [`BlobDescriptor`](./blossom#blobdescriptor-type)s for each successfully hosted image.

::: tip
In browsers, prefer **`mirror`** mode. The Blossom server fetches the source URL on your behalf so you avoid CORS issues on the image origin.
:::

```ts
const { markdown, blobs } = await rss.rehostImagesInMarkdown(article.content, {
  servers: ['https://blossom.primal.net'],
  signer,
  mode: 'mirror',
})
article.content = markdown
```

## importFeedAsDrafts

```ts
function importFeedAsDrafts(
  feedUrl: string,
  opts: ImportFeedOptions,
): Promise<NostrEvent[]>
```

End-to-end glue: fetch a feed, transform each item to a long-form event, optionally rehost images via Blossom, and return signed events. The caller publishes the resulting events to relays.

```ts
type ImportFeedOptions = {
  signer: Signer
  limit?: number
  since?: number
  draft?: ItemToDraftOptions
  blossom?: { servers: string[]; mode?: RehostMode }
  asDraft?: boolean
}
```

| Field | Type | Description |
|-------|------|-------------|
| `signer` | `Signer` | Signs the long-form events and any Blossom auth events. |
| `limit` | `number` | Cap on items to import (after `since` filtering). |
| `since` | `number` | Skip items published before this unix-seconds timestamp. |
| `draft` | `ItemToDraftOptions` | Forwarded to [`itemToDraft`](#itemtodraft) for each item. |
| `blossom` | `{ servers, mode? }` | When set, image URLs are rehosted before signing. |
| `asDraft` | `boolean` | `true` (default) → kind 30024. `false` → kind 30023 (published). |

```ts
const events = await rss.importFeedAsDrafts('https://example.com/feed/', {
  signer,
  limit: 5,
  draft: { identifierPrefix: 'rss-' },
  blossom: { servers: ['https://blossom.primal.net'], mode: 'mirror' },
})

await pool.publish(['wss://relay.example.com'], events)
```

## Full Example

```ts
import {
  generateSecretKey,
  createSecretKeySigner,
  fetchFeed,
  itemToDraft,
  rehostImagesInMarkdown,
  createLongFormEventTemplate,
  RelayPool,
} from 'nostr-core'

const sk = generateSecretKey()
const signer = createSecretKeySigner(sk)
const pool = new RelayPool()

// 1. Pull a feed
const feed = await fetchFeed('https://example.com/feed/')

// 2. Pick items (or import all)
const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60 // last 7 days
const recent = feed.items.filter(i => (i.publishedAt ?? 0) >= since)

const drafts = []
for (const item of recent) {
  const article = itemToDraft(item, { identifierPrefix: 'rss-' })

  // 3. Optionally mirror images to Blossom so the post survives the source going down
  const { markdown } = await rehostImagesInMarkdown(article.content, {
    servers: ['https://blossom.primal.net'],
    signer,
    mode: 'mirror',
  })
  article.content = markdown

  // 4. Sign as a kind 30024 draft
  const tpl = createLongFormEventTemplate({ ...article, isDraft: true })
  drafts.push(await signer.signEvent(tpl))
}

// 5. Publish drafts to your relays
await pool.publish(['wss://relay.example.com'], ...drafts)

// 6. Later, flip a draft to published: same `d`-tag, isDraft: false → kind 30023
//    The new event automatically replaces the 30024 draft.

pool.close()
```

## Site Coverage

Most blog hosts expose a working RSS or Atom feed at well-known paths.

| Source | Feed path | Notes |
|--------|-----------|-------|
| Blogger | `/feeds/posts/default` | Atom, full content. |
| WordPress (self-hosted & .com) | `/feed/` | Full HTML via `<content:encoded>`. Pages are not in the feed — see below. |
| Substack | `/feed` | Full HTML. |
| Ghost | `/rss/` | Full HTML. |
| Medium | `medium.com/feed/@user` | Excerpt only — body is truncated. |
| Tumblr | `/rss` | Full HTML. |

**WordPress Pages** (as opposed to Posts) are not included in `/feed/`. If you need to import a specific Page, fetch it from the REST API: `GET /wp-json/wp/v2/pages/<id>` returns `{ title.rendered, content.rendered, … }`, which you can shape into a `FeedItem` and pass to `itemToDraft`.

## How It Works

- **Format detection.** `parseFeed` looks at the first non-whitespace character: `{` → JSON Feed; otherwise XML is parsed once and dispatched to RSS or Atom based on the root element.
- **XML parsing.** Uses [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) with HTML entity decoding enabled, so numeric references like `&#8211;` are properly decoded.
- **HTML → Markdown.** Uses turndown with ATX headings, fenced code blocks, and `_` for emphasis.
- **`d`-tag determinism.** `sha256(guid || link || title)` truncated to 16 hex chars and prefixed by `identifierPrefix`. The same source item maps to the same `d`-tag every time, so re-imports replace cleanly.
- **Drafts vs published.** Kind 30024 (draft) and 30023 (published) share the same `d`-tag, so publishing the final version with `isDraft: false` automatically replaces the draft on the relays.
- **Image rehosting modes.** `mirror` (BUD-04) is the default and recommended in browsers — the Blossom server fetches the source URL itself. `upload` is for environments without CORS constraints; it downloads the image, computes a SHA-256, and PUTs it with a hash-scoped auth token.

## See Also

- [NIP-23 Long-form Content](./nip23) — the event kind this module produces
- [Blossom Media](./blossom) — server lists, auth events, and the underlying upload/mirror APIs
- [Signer](./signer) — the signing interface accepted by `rehostImagesInMarkdown` and `importFeedAsDrafts`
