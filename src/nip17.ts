import { getPublicKey } from './crypto.js'
import type { Rumor } from './nip59.js'
import { createRumor, createSeal, createWrap, unwrap } from './nip59.js'
import type { NostrEvent } from './event.js'

// Kind constants
const DM_KIND = 14
const FILE_MESSAGE_KIND = 15
const REACTION_KIND = 7
const MESSAGE_KINDS: ReadonlySet<number> = new Set([DM_KIND, FILE_MESSAGE_KIND, REACTION_KIND])

const HEX_64 = /^[0-9a-f]{64}$/

// Types

export type DirectMessage = {
  sender: string
  content: string
  tags: string[][]
  created_at: number
  id: string
}

/** Rumor kinds NIP-17 sends to a chat: 14 message, 15 file message, 7 reaction. */
export type MessageKind = 14 | 15 | 7

/** Parameters for {@link createMessage}. All pubkeys are 64-char lowercase hex. */
export type MessageParams = {
  /** Rumor kind. Default 14. */
  kind?: MessageKind
  content: string
  /**
   * Extra rumor tags: reply `e`, `subject`, file tags for kind 15, `e`/`k`
   * for kind 7. A `p` tag is added for every recipient not already tagged.
   */
  tags?: string[][]
  /** Receivers. Duplicates are dropped; the sender is only ever wrapped once. */
  recipients: string[]
  senderSecretKey: Uint8Array
  /** Also wrap for the sender, so the message shows on their other devices. Default true. */
  selfCopy?: boolean
  /** NIP-40 expiration (unix seconds), set on every gift wrap and seal. */
  expiration?: number
  /** Rumor timestamp (unix seconds). Default now. */
  created_at?: number
}

/** One gift-wrapped copy of a message, addressed to `recipient`. */
export type MessageWrap = {
  recipient: string
  wrap: NostrEvent
}

/** Result of {@link unwrapMessage}. */
export type UnwrappedMessage = {
  kind: MessageKind
  /** The real sender (the rumor's pubkey, matched against the seal's signer). */
  sender: string
  rumor: Rumor
}

// Helpers

function assertPubkey(pubkey: unknown, label: string): asserts pubkey is string {
  if (typeof pubkey !== 'string' || !HEX_64.test(pubkey)) {
    throw new Error(`Invalid ${label}: expected a 64-char lowercase hex pubkey, got ${JSON.stringify(pubkey)}`)
  }
}

function assertUnixSeconds(value: number, label: string, positive: boolean): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error(`Invalid ${label}: expected a ${positive ? 'positive' : 'non-negative'} integer of unix seconds, got ${value}`)
  }
}

// Public API

/**
 * Create a NIP-17 chat message (kind 14), file message (kind 15) or reaction
 * (kind 7), gift-wrapped for every recipient and, by default, the sender.
 *
 * One rumor is shared by all copies, so every copy has the same id. Each wrap
 * is independent: its own seal, its own ephemeral key and its own randomised
 * timestamps, so relays cannot link the copies.
 *
 * `wraps` lists the recipients in input order, the sender's copy last. Publish
 * each `wrap` to that recipient's DM relays (kind 10050).
 */
export function createMessage(params: MessageParams): { rumor: Rumor; wraps: MessageWrap[] } {
  const {
    kind = DM_KIND,
    content,
    tags = [],
    recipients,
    senderSecretKey,
    selfCopy = true,
    expiration,
    created_at = Math.floor(Date.now() / 1000),
  } = params

  if (!MESSAGE_KINDS.has(kind)) {
    throw new Error(`Unsupported NIP-17 message kind ${kind}: expected 14, 15 or 7`)
  }
  if (typeof content !== 'string') {
    throw new Error('Message content must be a string')
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error('A message needs at least one recipient')
  }
  recipients.forEach(pubkey => assertPubkey(pubkey, 'recipient pubkey'))
  if (expiration !== undefined) assertUnixSeconds(expiration, 'expiration', true)
  assertUnixSeconds(created_at, 'created_at', false)

  const senderPubkey = getPublicKey(senderSecretKey)
  const receivers = [...new Set(recipients)]
  // The sender is wrapped once, by selfCopy alone, even when listed as a recipient.
  const targets = receivers.filter(pubkey => pubkey !== senderPubkey)
  if (selfCopy) targets.push(senderPubkey)
  if (targets.length === 0) {
    throw new Error('Nothing to wrap: the only recipient is the sender and selfCopy is off')
  }

  const tagged = new Set(tags.filter(t => t[0] === 'p').map(t => t[1]))
  const rumor = createRumor(
    {
      kind,
      tags: [
        ...receivers.filter(pubkey => !tagged.has(pubkey)).map(pubkey => ['p', pubkey]),
        ...tags.map(tag => [...tag]),
      ],
      content,
      created_at,
    },
    senderPubkey,
  )

  const extra = expiration !== undefined ? { tags: [['expiration', String(expiration)]] } : undefined
  const wraps = targets.map(recipient => ({
    recipient,
    wrap: createWrap(createSeal(rumor, senderSecretKey, recipient, extra), recipient, extra),
  }))

  return { rumor, wraps }
}

/**
 * Unwrap a NIP-17 gift wrap holding a chat message (kind 14), file message
 * (kind 15) or reaction (kind 7). Verifies the seal like
 * {@link unwrapDirectMessage}; throws for any other rumor kind.
 */
export function unwrapMessage(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array,
): UnwrappedMessage {
  const rumor = unwrap(wrap, recipientSecretKey)

  if (!MESSAGE_KINDS.has(rumor.kind)) {
    throw new Error(`Expected a kind 14, 15 or 7 NIP-17 message, got kind ${rumor.kind}`)
  }

  return { kind: rumor.kind as MessageKind, sender: rumor.pubkey, rumor }
}

export function wrapDirectMessage(
  content: string,
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
  tags: string[][] = [],
): NostrEvent {
  const senderPubkey = getPublicKey(senderSecretKey)

  const rumor = createRumor(
    {
      kind: DM_KIND,
      tags: [['p', recipientPubkey], ...tags],
      content,
      created_at: Math.floor(Date.now() / 1000),
    },
    senderPubkey,
  )

  const seal = createSeal(rumor, senderSecretKey, recipientPubkey)
  return createWrap(seal, recipientPubkey)
}

export function unwrapDirectMessage(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array,
): DirectMessage {
  const rumor = unwrap(wrap, recipientSecretKey)

  if (rumor.kind !== DM_KIND) {
    throw new Error(`Expected kind ${DM_KIND} direct message, got kind ${rumor.kind}`)
  }

  return {
    sender: rumor.pubkey,
    content: rumor.content,
    tags: rumor.tags,
    created_at: rumor.created_at,
    id: rumor.id,
  }
}
