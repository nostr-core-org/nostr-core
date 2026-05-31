import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { base64 } from '@scure/base'

import { finalizeEvent, verifyEvent, type NostrEvent, type EventTemplate } from './event.js'
import { utf8Encoder } from './utils.js'

export type HttpAuthOptions = {
  url: string
  method: string
  body?: Uint8Array | string
}

/**
 * Create a kind 27235 HTTP auth event template (unsigned).
 */
export function createHttpAuthEventTemplate(opts: HttpAuthOptions): EventTemplate {
  const tags: string[][] = [
    ['u', opts.url],
    ['method', opts.method.toUpperCase()],
  ]

  if (opts.body) {
    const bodyBytes = typeof opts.body === 'string' ? utf8Encoder.encode(opts.body) : opts.body
    const hash = bytesToHex(sha256(bodyBytes))
    tags.push(['payload', hash])
  }

  return {
    kind: 27235,
    tags,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 27235 HTTP auth event.
 */
export function createHttpAuthEvent(opts: HttpAuthOptions, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createHttpAuthEventTemplate(opts), secretKey)
}

/**
 * Get the Authorization header value from a signed HTTP auth event.
 * Returns "Nostr <base64>" format.
 */
export function getAuthorizationHeader(event: NostrEvent): string {
  const json = JSON.stringify(event)
  const encoded = base64.encode(utf8Encoder.encode(json))
  return `Nostr ${encoded}`
}

/**
 * Verify an HTTP auth event against expected request parameters.
 */
export function verifyHttpAuthEvent(event: NostrEvent, opts: HttpAuthOptions): boolean {
  if (event.kind !== 27235) return false
  if (!verifyEvent(event)) return false

  // Check timestamp is within 60 seconds
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(event.created_at - now) > 60) return false

  const urlTag = event.tags.find(t => t[0] === 'u')
  const methodTag = event.tags.find(t => t[0] === 'method')

  if (!urlTag || urlTag[1] !== opts.url) return false
  if (!methodTag || methodTag[1] !== opts.method.toUpperCase()) return false

  if (opts.body) {
    const bodyBytes = typeof opts.body === 'string' ? utf8Encoder.encode(opts.body) : opts.body
    const expectedHash = bytesToHex(sha256(bodyBytes))
    const payloadTag = event.tags.find(t => t[0] === 'payload')
    if (!payloadTag || payloadTag[1] !== expectedHash) return false
  }

  return true
}
