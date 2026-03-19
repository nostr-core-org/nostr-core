import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

// ── Event Kinds ────────────────────────────────────────────────────────

/** BUD-03: User server list (replaceable) */
export const SERVER_LIST_KIND = 10063

/** BUD-11: Authorization token */
export const AUTH_KIND = 24242

// ── Types ──────────────────────────────────────────────────────────────

/** Blob metadata returned by Blossom servers. */
export type BlobDescriptor = {
  url: string
  sha256: string
  size: number
  type?: string
  uploaded?: number
}

/** Authorization action types for kind 24242. */
export type BlossomAuthAction = 'get' | 'upload' | 'list' | 'delete' | 'media'

export class BlossomError extends Error {
  code: string
  status?: number
  constructor(message: string, code = 'BLOSSOM_ERROR', status?: number) {
    super(message)
    this.name = 'BlossomError'
    this.code = code
    this.status = status
  }
}

// ── Server List (kind 10063 / BUD-03) ──────────────────────────────────

/**
 * Create a kind 10063 server list event template (unsigned).
 *
 * Declares which Blossom servers a user prefers for media storage.
 */
export function createServerListEventTemplate(servers: string[]): EventTemplate {
  return {
    kind: SERVER_LIST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: servers.map(s => ['server', s]),
    content: '',
  }
}

/**
 * Create and sign a kind 10063 server list event.
 */
export function createServerListEvent(
  servers: string[],
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createServerListEventTemplate(servers), secretKey)
}

/**
 * Parse a kind 10063 server list event.
 */
export function parseServerList(event: NostrEvent): string[] {
  if (event.kind !== SERVER_LIST_KIND) {
    throw new Error(`Expected kind ${SERVER_LIST_KIND}, got ${event.kind}`)
  }
  return event.tags
    .filter(t => t[0] === 'server' && t[1])
    .map(t => t[1])
}

// ── Authorization Event (kind 24242 / BUD-11) ─────────────────────────

/**
 * Create a kind 24242 Blossom authorization event template (unsigned).
 *
 * @param opts.action - Operation type: get, upload, list, delete, media
 * @param opts.content - Human-readable description (e.g. "Upload Blob")
 * @param opts.expiration - Unix timestamp when the token expires
 * @param opts.hashes - SHA-256 hashes to scope the token to (x tags)
 * @param opts.size - Blob size in bytes
 * @param opts.servers - Server URLs to restrict the token to
 */
export function createAuthEventTemplate(opts: {
  action: BlossomAuthAction
  content: string
  expiration: number
  hashes?: string[]
  size?: number
  servers?: string[]
}): EventTemplate {
  const tags: string[][] = [
    ['t', opts.action],
    ['expiration', String(opts.expiration)],
  ]
  if (opts.hashes) {
    for (const hash of opts.hashes) tags.push(['x', hash])
  }
  if (opts.size !== undefined) {
    tags.push(['size', String(opts.size)])
  }
  if (opts.servers) {
    for (const server of opts.servers) {
      try {
        tags.push(['server', new URL(server).hostname.toLowerCase()])
      } catch {
        tags.push(['server', server.toLowerCase()])
      }
    }
  }
  return {
    kind: AUTH_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: opts.content,
  }
}

/**
 * Create and sign a kind 24242 Blossom authorization event.
 */
export function createAuthEvent(
  opts: Parameters<typeof createAuthEventTemplate>[0],
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createAuthEventTemplate(opts), secretKey)
}

// ── Authorization Header ───────────────────────────────────────────────

/**
 * Encode a signed kind 24242 event as a Blossom Authorization header value.
 *
 * Format: `Nostr <base64url-no-pad-encoded-event>`
 */
export function getAuthorizationHeader(event: NostrEvent): string {
  const json = JSON.stringify(event)
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `Nostr ${b64}`
}

// ── HTTP Operations ────────────────────────────────────────────────────

function baseUrl(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * Upload a blob to a Blossom server (BUD-02).
 *
 * @param serverUrl - Blossom server base URL
 * @param data - Binary data to upload
 * @param authEvent - Signed kind 24242 auth event with action "upload"
 * @param contentType - MIME type (default: application/octet-stream)
 * @returns Blob descriptor from the server
 */
export async function uploadBlob(
  serverUrl: string,
  data: Uint8Array,
  authEvent: NostrEvent,
  contentType?: string,
): Promise<BlobDescriptor> {
  const hash = bytesToHex(sha256(data))
  const res = await fetch(`${baseUrl(serverUrl)}/upload`, {
    method: 'PUT',
    headers: {
      'Authorization': getAuthorizationHeader(authEvent),
      'Content-Type': contentType || 'application/octet-stream',
      'X-SHA-256': hash,
    },
    body: data as unknown as BodyInit,
  })
  if (!res.ok) {
    const reason = res.headers.get('X-Reason') || (await res.text().catch(() => ''))
    throw new BlossomError(reason || res.statusText, 'UPLOAD_ERROR', res.status)
  }
  return (await res.json()) as BlobDescriptor
}

/**
 * Retrieve a blob from a Blossom server (BUD-01).
 *
 * @param serverUrl - Blossom server base URL
 * @param sha256Hash - SHA-256 hash of the blob (hex)
 * @param ext - Optional file extension (e.g. ".png")
 * @returns The raw blob data
 */
export async function getBlob(
  serverUrl: string,
  sha256Hash: string,
  ext?: string,
): Promise<ArrayBuffer> {
  const path = ext ? `${sha256Hash}${ext}` : sha256Hash
  const res = await fetch(`${baseUrl(serverUrl)}/${path}`)
  if (!res.ok) {
    throw new BlossomError(
      res.headers.get('X-Reason') || res.statusText,
      'NOT_FOUND',
      res.status,
    )
  }
  return res.arrayBuffer()
}

/**
 * Check if a blob exists on a Blossom server (BUD-01).
 */
export async function checkBlob(
  serverUrl: string,
  sha256Hash: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(serverUrl)}/${sha256Hash}`, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Delete a blob from a Blossom server (BUD-02).
 *
 * @param serverUrl - Blossom server base URL
 * @param sha256Hash - SHA-256 hash of the blob to delete (hex)
 * @param authEvent - Signed kind 24242 auth event with action "delete"
 */
export async function deleteBlob(
  serverUrl: string,
  sha256Hash: string,
  authEvent: NostrEvent,
): Promise<void> {
  const res = await fetch(`${baseUrl(serverUrl)}/${sha256Hash}`, {
    method: 'DELETE',
    headers: { 'Authorization': getAuthorizationHeader(authEvent) },
  })
  if (!res.ok) {
    const reason = res.headers.get('X-Reason') || (await res.text().catch(() => ''))
    throw new BlossomError(reason || res.statusText, 'DELETE_ERROR', res.status)
  }
}

/**
 * List blobs uploaded by a pubkey (BUD-02).
 *
 * @param serverUrl - Blossom server base URL
 * @param pubkey - Hex public key
 * @param opts.cursor - SHA-256 hash of last blob for pagination
 * @param opts.limit - Maximum number of results
 * @returns Array of blob descriptors sorted by upload date descending
 */
export async function listBlobs(
  serverUrl: string,
  pubkey: string,
  opts?: { cursor?: string; limit?: number },
): Promise<BlobDescriptor[]> {
  const params = new URLSearchParams()
  if (opts?.cursor) params.set('cursor', opts.cursor)
  if (opts?.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  const url = `${baseUrl(serverUrl)}/list/${pubkey}${qs ? `?${qs}` : ''}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new BlossomError(
      res.headers.get('X-Reason') || res.statusText,
      'LIST_ERROR',
      res.status,
    )
  }
  return (await res.json()) as BlobDescriptor[]
}

/**
 * Mirror a blob from a remote URL to a Blossom server (BUD-04).
 *
 * @param serverUrl - Destination Blossom server base URL
 * @param sourceUrl - Public URL of the blob to mirror
 * @param authEvent - Signed kind 24242 auth event with action "upload"
 * @returns Blob descriptor from the destination server
 */
export async function mirrorBlob(
  serverUrl: string,
  sourceUrl: string,
  authEvent: NostrEvent,
): Promise<BlobDescriptor> {
  const res = await fetch(`${baseUrl(serverUrl)}/mirror`, {
    method: 'PUT',
    headers: {
      'Authorization': getAuthorizationHeader(authEvent),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: sourceUrl }),
  })
  if (!res.ok) {
    const reason = res.headers.get('X-Reason') || (await res.text().catch(() => ''))
    throw new BlossomError(reason || res.statusText, 'MIRROR_ERROR', res.status)
  }
  return (await res.json()) as BlobDescriptor
}

// ── Utilities ──────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a blob (hex).
 *
 * This is the content-addressable identifier used by Blossom servers.
 */
export function getBlobHash(data: Uint8Array): string {
  return bytesToHex(sha256(data))
}
