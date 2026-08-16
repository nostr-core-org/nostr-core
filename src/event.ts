import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

import { utf8Encoder } from './utils.js'

export const verifiedSymbol = Symbol('verified')

export type NostrEvent = {
  kind: number
  tags: string[][]
  content: string
  created_at: number
  pubkey: string
  id: string
  sig: string
  [verifiedSymbol]?: boolean
}

export type EventTemplate = Pick<NostrEvent, 'kind' | 'tags' | 'content' | 'created_at'>
export type UnsignedEvent = Pick<NostrEvent, 'kind' | 'tags' | 'content' | 'created_at' | 'pubkey'>

export interface VerifiedEvent extends NostrEvent {
  [verifiedSymbol]: true
}

const isRecord = (obj: unknown): obj is Record<string, unknown> => obj instanceof Object

export function validateEvent<T>(event: T): event is T & UnsignedEvent {
  if (!isRecord(event)) return false
  if (typeof event.kind !== 'number') return false
  if (typeof event.content !== 'string') return false
  if (typeof event.created_at !== 'number') return false
  if (typeof event.pubkey !== 'string') return false
  if (!event.pubkey.match(/^[a-f0-9]{64}$/)) return false

  if (!Array.isArray(event.tags)) return false
  for (let i = 0; i < event.tags.length; i++) {
    const tag = event.tags[i]
    if (!Array.isArray(tag)) return false
    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] !== 'string') return false
    }
  }

  return true
}

export function serializeEvent(evt: UnsignedEvent): string {
  if (!validateEvent(evt)) throw new Error("can't serialize event with wrong or missing properties")
  return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content])
}

export function getEventHash(event: UnsignedEvent): string {
  const eventHash = sha256(utf8Encoder.encode(serializeEvent(event)))
  return bytesToHex(eventHash)
}

export function finalizeEvent(t: EventTemplate, secretKey: Uint8Array): VerifiedEvent {
  const event = t as VerifiedEvent
  event.pubkey = bytesToHex(schnorr.getPublicKey(secretKey))
  event.id = getEventHash(event)
  event.sig = bytesToHex(schnorr.sign(hexToBytes(event.id), secretKey))
  event[verifiedSymbol] = true
  return event
}

/**
 * Verify an event's id and signature from scratch.
 *
 * Unlike {@link verifyEvent} this consults no cache and writes none, so it is
 * the right choice for validating untrusted input. `verifiedSymbol` is an own
 * enumerable symbol property, which means object spread copies it: a tampered
 * `{ ...signedEvent, content: 'changed' }` would otherwise inherit the original
 * event's "already verified" flag.
 */
export function verifyEventSignature(event: NostrEvent): boolean {
  const hash = getEventHash(event)
  if (hash !== event.id) return false

  try {
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(hash), hexToBytes(event.pubkey))
  } catch {
    return false
  }
}

export function verifyEvent(event: NostrEvent): event is VerifiedEvent {
  if (typeof event[verifiedSymbol] === 'boolean') return event[verifiedSymbol]

  const valid = verifyEventSignature(event)
  event[verifiedSymbol] = valid
  return valid
}
