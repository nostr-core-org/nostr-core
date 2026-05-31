# NIP-68

Picture-first feeds (kind 20) - self-contained image posts designed for visual, Instagram-style feeds. Each post carries one or more externally-hosted images described by `imeta` tags, plus a title and optional description.

## Import

```ts
import { nip68 } from 'nostr-core'
// or import individual functions
import {
  createPictureEventTemplate,
  createPictureEvent,
  parsePicturePost,
  buildImetaTag,
  parseImetaTag,
  PICTURE_KIND,
  ACCEPTED_MEDIA_TYPES,
} from 'nostr-core'
```

## Types

```ts
type ImageAnnotation = {
  pubkey: string
  x: number
  y: number
}

type ImageMetadata = {
  url: string
  mimeType?: string
  alt?: string
  hash?: string        // SHA-256, lowercase hex (NIP-94 `x`)
  dim?: string         // "WIDTHxHEIGHT"
  blurhash?: string
  thumbhash?: string
  fallback?: string[]  // alternate URLs for the same file
  annotations?: ImageAnnotation[]
}

type TaggedUser = {
  pubkey: string
  relay?: string
}

type PicturePost = {
  title: string
  description?: string
  images: ImageMetadata[]
  contentWarning?: string
  hashtags?: string[]
  taggedUsers?: TaggedUser[]
  location?: string
  geohash?: string
  language?: string    // ISO-639-1, e.g. "en"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Short title of the post |
| `description` | `string` (optional) | Post description (stored as event content) |
| `images` | `ImageMetadata[]` | One or more images; each becomes an `imeta` tag |
| `contentWarning` | `string` (optional) | NSFW/sensitive content reason |
| `hashtags` | `string[]` (optional) | `t` tags for discovery |
| `taggedUsers` | `TaggedUser[]` (optional) | `p` tags with optional relay hints |
| `location` | `string` (optional) | Human-readable location |
| `geohash` | `string` (optional) | `g` geohash tag |
| `language` | `string` (optional) | ISO-639-1 language code |

## Constants

```ts
PICTURE_KIND          // 20
ACCEPTED_MEDIA_TYPES  // ['image/apng', 'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']
```

## nip68.createPictureEventTemplate

```ts
function createPictureEventTemplate(post: PicturePost): EventTemplate
```

Creates an unsigned kind 20 picture event template. Use with `finalizeEvent()` or pass to a `Signer`.

**Returns:** `EventTemplate` - Unsigned kind 20 event. Each image is serialized as an `imeta` tag; top-level `m` and `x` tags mirror the images so relays can filter feeds without parsing `imeta`.

```ts
const template = nip68.createPictureEventTemplate({
  title: 'Costa Rica',
  description: 'Sunset over the Pacific coast',
  images: [
    {
      url: 'https://nostr.build/i/my-image.jpg',
      mimeType: 'image/jpeg',
      alt: 'A scenic photo overlooking the coast',
      hash: '<sha256>',
      dim: '3024x4032',
      blurhash: 'eVF$^OI:...',
      fallback: ['https://void.cat/alt.jpg'],
    },
  ],
  hashtags: ['travel', 'photography'],
})

const signed = await signer.signEvent(template)
```

## nip68.createPictureEvent

```ts
function createPictureEvent(post: PicturePost, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 20 picture event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `post` | `PicturePost` | Post content and image metadata |
| `secretKey` | `Uint8Array` | Signer's secret key (32 bytes) |

**Returns:** `NostrEvent` - Signed kind 20 event ready to publish.

## nip68.parsePicturePost

```ts
function parsePicturePost(event: NostrEvent): PicturePost
```

Parses a kind 20 event into a `PicturePost`, including every `imeta` image, tagged users, hashtags, and metadata.

```ts
const post = nip68.parsePicturePost(event)
console.log(post.title, post.images.length)
```

## nip68.buildImetaTag / parseImetaTag

```ts
function buildImetaTag(image: ImageMetadata): string[]
function parseImetaTag(tag: string[]): ImageMetadata | null
```

Low-level helpers for the `imeta` tag format (space-separated `key value` pairs). `parseImetaTag` returns `null` if the tag has no `url`. Useful for reading images out of other event kinds that reuse `imeta` (NIP-92).

```ts
const tag = nip68.buildImetaTag({ url: 'https://x.jpg', mimeType: 'image/jpeg', hash: 'abc' })
// ['imeta', 'url https://x.jpg', 'm image/jpeg', 'x abc']

const image = nip68.parseImetaTag(tag)
```

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip68, RelayPool } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)
const pool = new RelayPool()

const post = nip68.createPictureEvent(
  {
    title: 'Two from the trip',
    description: 'Costa Rica, 2024',
    images: [
      {
        url: 'https://nostr.build/i/1.jpg',
        mimeType: 'image/jpeg',
        alt: 'Coastline at sunset',
        hash: '<sha256>',
        dim: '3024x4032',
      },
      {
        url: 'https://nostr.build/i/2.jpg',
        mimeType: 'image/jpeg',
        alt: 'Rainforest canopy',
        hash: '<sha256>',
        dim: '3024x4032',
        annotations: [{ pubkey: pk, x: 1200, y: 800 }],
      },
    ],
    contentWarning: undefined,
    hashtags: ['travel', 'costarica'],
    location: 'Costa Rica',
    geohash: 'd1q',
    language: 'en',
  },
  sk,
)

await pool.publish(['wss://relay.example.com'], post)

// Read it back
const parsed = nip68.parsePicturePost(post)
console.log(`${parsed.title}: ${parsed.images.length} images`)

pool.close()
```

## How It Works

- **Kind 20** is a picture-first event; the `content` field holds the post description
- A `title` tag carries the short title
- Each image is one `imeta` tag whose elements are space-separated `key value` pairs: `url`, `m` (MIME), `alt`, `x` (SHA-256), `dim`, `blurhash`, `thumbhash`, `fallback` (repeatable), and `annotate-user` (repeatable, formatted `pubkey:posX:posY`)
- Top-level `m` and `x` tags duplicate each image's MIME type and hash so relays can filter feeds without parsing `imeta`
- `content-warning`, `p` (tagged users), `t` (hashtags), `location`, `g` (geohash), and `L`/`l` (language) tags are optional
- Only image media types are valid: `image/apng`, `image/avif`, `image/gif`, `image/jpeg`, `image/png`, `image/webp`
- For video-first feeds, see NIP-71 (kind 22), which uses the same `imeta` convention
