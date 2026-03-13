import { randomBytes } from '@noble/hashes/utils'

import { generateSecretKey, getPublicKey } from './crypto.js'
import { finalizeEvent, getEventHash, verifyEvent, type EventTemplate, type NostrEvent } from './event.js'
import * as nip44 from './nip44.js'

// Kind constants
const SEAL_KIND = 13
const GIFT_WRAP_KIND = 1059

// Types

export type Rumor = {
  id: string
  kind: number
  tags: string[][]
  content: string
  created_at: number
  pubkey: string
}

// Helpers

function randomTimestamp(): number {
  // Randomize up to 2 days in the past
  const twoDays = 2 * 24 * 60 * 60
  const offset = Math.floor(Math.random() * twoDays)
  return Math.floor(Date.now() / 1000) - offset
}

// Public API

export function createRumor(event: EventTemplate, senderPubkey: string): Rumor {
  const rumor = {
    ...event,
    pubkey: senderPubkey,
  }
  const id = getEventHash(rumor)
  return { ...rumor, id }
}

export function createSeal(
  rumor: Rumor,
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
): NostrEvent {
  const convKey = nip44.getConversationKey(senderSecretKey, recipientPubkey)
  const encrypted = nip44.encrypt(JSON.stringify(rumor), convKey)

  return finalizeEvent(
    {
      kind: SEAL_KIND,
      tags: [],
      content: encrypted,
      created_at: randomTimestamp(),
    },
    senderSecretKey,
  )
}

export function createWrap(
  seal: NostrEvent,
  recipientPubkey: string,
): NostrEvent {
  const ephemeralKey = generateSecretKey()
  const convKey = nip44.getConversationKey(ephemeralKey, recipientPubkey)
  const encrypted = nip44.encrypt(JSON.stringify(seal), convKey)

  return finalizeEvent(
    {
      kind: GIFT_WRAP_KIND,
      tags: [['p', recipientPubkey]],
      content: encrypted,
      created_at: randomTimestamp(),
    },
    ephemeralKey,
  )
}

export function unwrap(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array,
): Rumor {
  if (wrap.kind !== GIFT_WRAP_KIND) {
    throw new Error(`Expected kind ${GIFT_WRAP_KIND} gift wrap, got kind ${wrap.kind}`)
  }

  // Decrypt the gift wrap to get the seal
  const convKey = nip44.getConversationKey(recipientSecretKey, wrap.pubkey)
  const sealJson = nip44.decrypt(wrap.content, convKey)
  const seal: NostrEvent = JSON.parse(sealJson)

  // Verify the seal signature
  if (seal.kind !== SEAL_KIND) {
    throw new Error(`Expected kind ${SEAL_KIND} seal, got kind ${seal.kind}`)
  }
  if (!verifyEvent(seal)) {
    throw new Error('Seal signature verification failed')
  }

  // Decrypt the seal to get the rumor
  const sealConvKey = nip44.getConversationKey(recipientSecretKey, seal.pubkey)
  const rumorJson = nip44.decrypt(seal.content, sealConvKey)
  const rumor: Rumor = JSON.parse(rumorJson)

  // Verify pubkey consistency: seal.pubkey must match rumor.pubkey
  if (seal.pubkey !== rumor.pubkey) {
    throw new Error('Seal pubkey does not match rumor pubkey - possible impersonation')
  }

  return rumor
}
