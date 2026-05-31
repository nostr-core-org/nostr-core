import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

/**
 * NIP-68 — Picture-first feeds (kind 20).
 * https://github.com/nostr-protocol/nips/blob/master/68.md
 */

export const PICTURE_KIND = 20

/** Media types accepted by NIP-68 picture events. */
export const ACCEPTED_MEDIA_TYPES = [
  'image/apng',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/** A user annotated at a position within an image. */
export type ImageAnnotation = {
  pubkey: string
  x: number
  y: number
}

/** Metadata for a single image, serialized as an `imeta` tag (NIP-92/NIP-94). */
export type ImageMetadata = {
  url: string
  /** MIME type, e.g. `image/jpeg`. */
  mimeType?: string
  /** Accessibility description. */
  alt?: string
  /** SHA-256 hash of the file, lowercase hex (NIP-94 `x`). */
  hash?: string
  /** Dimensions as `WIDTHxHEIGHT`, e.g. `3024x4032`. */
  dim?: string
  blurhash?: string
  thumbhash?: string
  /** Alternate URLs serving the same file. */
  fallback?: string[]
  /** Users tagged at coordinates within the image. */
  annotations?: ImageAnnotation[]
}

export type TaggedUser = {
  pubkey: string
  relay?: string
}

export type PicturePost = {
  title: string
  /** Post description (event content). */
  description?: string
  images: ImageMetadata[]
  contentWarning?: string
  hashtags?: string[]
  /** Users mentioned in the post (`p` tags). */
  taggedUsers?: TaggedUser[]
  location?: string
  geohash?: string
  /** Language tag (ISO-639-1), e.g. `en`. */
  language?: string
}

/** Build a single `imeta` tag array from image metadata. */
export function buildImetaTag(image: ImageMetadata): string[] {
  const tag = ['imeta', `url ${image.url}`]

  if (image.mimeType) tag.push(`m ${image.mimeType}`)
  if (image.alt) tag.push(`alt ${image.alt}`)
  if (image.hash) tag.push(`x ${image.hash}`)
  if (image.dim) tag.push(`dim ${image.dim}`)
  if (image.blurhash) tag.push(`blurhash ${image.blurhash}`)
  if (image.thumbhash) tag.push(`thumbhash ${image.thumbhash}`)
  if (image.fallback) {
    for (const url of image.fallback) tag.push(`fallback ${url}`)
  }
  if (image.annotations) {
    for (const a of image.annotations) tag.push(`annotate-user ${a.pubkey}:${a.x}:${a.y}`)
  }

  return tag
}

/** Parse a single `imeta` tag array into image metadata. */
export function parseImetaTag(tag: string[]): ImageMetadata | null {
  const image: ImageMetadata = { url: '' }
  const fallback: string[] = []
  const annotations: ImageAnnotation[] = []

  // Skip the leading "imeta" element; each remaining element is "key value".
  for (const field of tag.slice(1)) {
    const sep = field.indexOf(' ')
    if (sep === -1) continue
    const key = field.slice(0, sep)
    const value = field.slice(sep + 1)

    switch (key) {
      case 'url':
        image.url = value
        break
      case 'm':
        image.mimeType = value
        break
      case 'alt':
        image.alt = value
        break
      case 'x':
        image.hash = value
        break
      case 'dim':
        image.dim = value
        break
      case 'blurhash':
        image.blurhash = value
        break
      case 'thumbhash':
        image.thumbhash = value
        break
      case 'fallback':
        fallback.push(value)
        break
      case 'annotate-user': {
        const [pubkey, x, y] = value.split(':')
        if (pubkey) annotations.push({ pubkey, x: parseInt(x, 10), y: parseInt(y, 10) })
        break
      }
    }
  }

  if (!image.url) return null
  if (fallback.length > 0) image.fallback = fallback
  if (annotations.length > 0) image.annotations = annotations

  return image
}

/**
 * Create a kind 20 picture-first event template (unsigned).
 */
export function createPictureEventTemplate(post: PicturePost): EventTemplate {
  const tags: string[][] = [['title', post.title]]

  for (const image of post.images) {
    tags.push(buildImetaTag(image))
  }

  // Top-level `m`/`x` tags mirror the images so relays can filter feeds
  // without parsing `imeta`. De-duplicate MIME types; one `x` per image.
  const mimeTypes = new Set<string>()
  for (const image of post.images) {
    if (image.mimeType) mimeTypes.add(image.mimeType)
    if (image.hash) tags.push(['x', image.hash])
  }
  for (const m of mimeTypes) tags.push(['m', m])

  if (post.contentWarning !== undefined) tags.push(['content-warning', post.contentWarning])

  if (post.taggedUsers) {
    for (const user of post.taggedUsers) {
      tags.push(user.relay ? ['p', user.pubkey, user.relay] : ['p', user.pubkey])
    }
  }

  if (post.hashtags) {
    for (const t of post.hashtags) tags.push(['t', t])
  }

  if (post.location !== undefined) tags.push(['location', post.location])
  if (post.geohash !== undefined) tags.push(['g', post.geohash])
  if (post.language !== undefined) {
    tags.push(['L', 'ISO-639-1'])
    tags.push(['l', post.language, 'ISO-639-1'])
  }

  return {
    kind: PICTURE_KIND,
    tags,
    content: post.description ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 20 picture-first event.
 */
export function createPictureEvent(post: PicturePost, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createPictureEventTemplate(post), secretKey)
}

/**
 * Parse a kind 20 picture-first event.
 */
export function parsePicturePost(event: NostrEvent): PicturePost {
  const result: PicturePost = {
    title: '',
    description: event.content,
    images: [],
  }

  const hashtags: string[] = []
  const taggedUsers: TaggedUser[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'title':
        result.title = tag[1] ?? ''
        break
      case 'imeta': {
        const image = parseImetaTag(tag)
        if (image) result.images.push(image)
        break
      }
      case 'content-warning':
        result.contentWarning = tag[1] ?? ''
        break
      case 'p':
        if (tag[1]) taggedUsers.push(tag[2] ? { pubkey: tag[1], relay: tag[2] } : { pubkey: tag[1] })
        break
      case 't':
        if (tag[1]) hashtags.push(tag[1])
        break
      case 'location':
        result.location = tag[1]
        break
      case 'g':
        result.geohash = tag[1]
        break
      case 'l':
        if (tag[1]) result.language = tag[1]
        break
    }
  }

  if (hashtags.length > 0) result.hashtags = hashtags
  if (taggedUsers.length > 0) result.taggedUsers = taggedUsers

  return result
}
