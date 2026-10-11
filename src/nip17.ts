import { getPublicKey } from './crypto.js'
import type { Rumor } from './nip59.js'
import { createRumor, createSeal, createWrap, unwrap } from './nip59.js'
import type { NostrEvent } from './event.js'

// Kind constants
const DM_KIND = 14
const MESSAGE_KINDS = [14, 15, 7]

// Types

export type DirectMessage = {
  sender: string
  content: string
  tags: string[][]
  created_at: number
  id: string
}

/** Rumor kinds of a NIP-17 chat: 14 message, 15 file message, 7 reaction. */
export type MessageKind = 14 | 15 | 7

export type MessageParams = {
  /** Default 14. */
  kind?: MessageKind
  content: string
  tags?: string[][]
  recipients: string[]
  senderSecretKey: Uint8Array
  /** Also wrap for the sender, for their other devices. Default true. */
  selfCopy?: boolean
  /** NIP-40 expiration (unix seconds) on every wrap and seal. */
  expiration?: number
}

export type UnwrappedMessage = {
  kind: MessageKind
  sender: string
  rumor: Rumor
}

// Public API

/**
 * Create a NIP-17 message, file message or reaction, gift-wrapped for every
 * recipient and (by default) the sender. All copies share one rumor, so one id.
 * Publish each `wrap` to that recipient's DM relays (kind 10050).
 */
export function createMessage(params: MessageParams): { rumor: Rumor; wraps: { recipient: string; wrap: NostrEvent }[] } {
  const { kind = DM_KIND, content, tags = [], senderSecretKey, selfCopy = true, expiration } = params
  const recipients = [...new Set(params.recipients)]
  if (recipients.length === 0) throw new Error('A message needs at least one recipient')

  const senderPubkey = getPublicKey(senderSecretKey)
  const rumor = createRumor(
    {
      kind,
      tags: [...recipients.map(pubkey => ['p', pubkey]), ...tags],
      content,
      created_at: Math.floor(Date.now() / 1000),
    },
    senderPubkey,
  )

  const targets = recipients.filter(pubkey => pubkey !== senderPubkey)
  if (selfCopy) targets.push(senderPubkey)
  const opts = expiration ? { tags: [['expiration', String(expiration)]] } : undefined
  const wraps = targets.map(recipient => ({
    recipient,
    wrap: createWrap(createSeal(rumor, senderSecretKey, recipient, opts), recipient, opts),
  }))
  return { rumor, wraps }
}

/** Unwrap a NIP-17 message, file message or reaction; throws for any other kind. */
export function unwrapMessage(wrap: NostrEvent, recipientSecretKey: Uint8Array): UnwrappedMessage {
  const rumor = unwrap(wrap, recipientSecretKey)
  if (!MESSAGE_KINDS.includes(rumor.kind)) {
    throw new Error(`Expected a kind 14, 15 or 7 message, got kind ${rumor.kind}`)
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
