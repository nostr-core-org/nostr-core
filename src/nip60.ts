import { getPublicKey } from './crypto.js'
import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'
import * as nip44 from './nip44.js'

// ── Event Kinds ────────────────────────────────────────────────────────

export const WALLET_KIND = 17375
export const TOKEN_KIND = 7375
export const HISTORY_KIND = 7376
export const QUOTE_KIND = 7374

// ── Types ──────────────────────────────────────────────────────────────

/** A single Cashu proof (token unit). */
export type CashuProof = {
  id: string
  amount: number
  secret: string
  C: string
}

/** Decrypted content of a kind 7375 token event. */
export type CashuToken = {
  mint: string
  proofs: CashuProof[]
  unit?: string
  del?: string[]
}

/** Decrypted content of a kind 17375 wallet event. */
export type CashuWallet = {
  privkey: string
  mints: string[]
}

/** An event reference inside a history entry. */
export type CashuHistoryRef = {
  id: string
  relay?: string
  marker: 'created' | 'destroyed' | 'redeemed'
}

/** Decrypted content of a kind 7376 history event. */
export type CashuHistory = {
  direction: 'in' | 'out'
  amount: string
  unit: string
  events: CashuHistoryRef[]
}

/** Parameters for a kind 7374 quote event. */
export type CashuQuote = {
  quoteId: string
  mint: string
  expiration: number
}

// ── Self-encryption helpers ────────────────────────────────────────────

function selfEncrypt(content: string, secretKey: Uint8Array): string {
  const ck = nip44.getConversationKey(secretKey, getPublicKey(secretKey))
  return nip44.encrypt(content, ck)
}

function selfDecrypt(content: string, secretKey: Uint8Array): string {
  const ck = nip44.getConversationKey(secretKey, getPublicKey(secretKey))
  return nip44.decrypt(content, ck)
}

// ── Wallet (kind 17375) ────────────────────────────────────────────────

/**
 * Create a kind 17375 wallet event template (unsigned).
 *
 * The wallet event is a replaceable event storing the wallet's private key
 * and mint list, NIP-44 encrypted to self.
 */
export function createWalletEventTemplate(
  wallet: CashuWallet,
  secretKey: Uint8Array,
): EventTemplate {
  const tags: string[][] = [
    ['privkey', wallet.privkey],
    ...wallet.mints.map(m => ['mint', m]),
  ]
  return {
    kind: WALLET_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: selfEncrypt(JSON.stringify(tags), secretKey),
  }
}

/**
 * Create and sign a kind 17375 wallet event.
 */
export function createWalletEvent(
  wallet: CashuWallet,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createWalletEventTemplate(wallet, secretKey), secretKey)
}

/**
 * Decrypt and parse a kind 17375 wallet event.
 */
export function parseWalletEvent(
  event: NostrEvent,
  secretKey: Uint8Array,
): CashuWallet {
  if (event.kind !== WALLET_KIND) {
    throw new Error(`Expected kind ${WALLET_KIND}, got ${event.kind}`)
  }
  const tags = JSON.parse(selfDecrypt(event.content, secretKey)) as string[][]
  let privkey = ''
  const mints: string[] = []
  for (const tag of tags) {
    if (tag[0] === 'privkey') privkey = tag[1]
    else if (tag[0] === 'mint') mints.push(tag[1])
  }
  return { privkey, mints }
}

// ── Token (kind 7375) ──────────────────────────────────────────────────

/**
 * Create a kind 7375 token event template (unsigned).
 *
 * Each token event stores unspent Cashu proofs for a single mint,
 * NIP-44 encrypted to self.
 */
export function createTokenEventTemplate(
  token: CashuToken,
  secretKey: Uint8Array,
): EventTemplate {
  const payload: Record<string, unknown> = {
    mint: token.mint,
    proofs: token.proofs,
  }
  if (token.unit) payload.unit = token.unit
  if (token.del?.length) payload.del = token.del
  return {
    kind: TOKEN_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: selfEncrypt(JSON.stringify(payload), secretKey),
  }
}

/**
 * Create and sign a kind 7375 token event.
 */
export function createTokenEvent(
  token: CashuToken,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createTokenEventTemplate(token, secretKey), secretKey)
}

/**
 * Decrypt and parse a kind 7375 token event.
 */
export function parseTokenEvent(
  event: NostrEvent,
  secretKey: Uint8Array,
): CashuToken {
  if (event.kind !== TOKEN_KIND) {
    throw new Error(`Expected kind ${TOKEN_KIND}, got ${event.kind}`)
  }
  const data = JSON.parse(selfDecrypt(event.content, secretKey)) as Record<string, unknown>
  return {
    mint: data.mint as string,
    proofs: data.proofs as CashuProof[],
    unit: (data.unit as string) || undefined,
    del: (data.del as string[]) || undefined,
  }
}

// ── Spending History (kind 7376) ───────────────────────────────────────

/**
 * Create a kind 7376 spending history event template (unsigned).
 *
 * Records a wallet transaction. Event references with "redeemed" marker
 * are placed in unencrypted tags; all others are NIP-44 encrypted.
 */
export function createHistoryEventTemplate(
  history: CashuHistory,
  secretKey: Uint8Array,
): EventTemplate {
  const encryptedTags: string[][] = [
    ['direction', history.direction],
    ['amount', history.amount],
    ['unit', history.unit],
  ]
  const plainTags: string[][] = []

  for (const ev of history.events) {
    const tag = ['e', ev.id, ev.relay || '', ev.marker]
    if (ev.marker === 'redeemed') {
      plainTags.push(tag)
    } else {
      encryptedTags.push(tag)
    }
  }

  return {
    kind: HISTORY_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: plainTags,
    content: selfEncrypt(JSON.stringify(encryptedTags), secretKey),
  }
}

/**
 * Create and sign a kind 7376 spending history event.
 */
export function createHistoryEvent(
  history: CashuHistory,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createHistoryEventTemplate(history, secretKey), secretKey)
}

/**
 * Decrypt and parse a kind 7376 spending history event.
 */
export function parseHistoryEvent(
  event: NostrEvent,
  secretKey: Uint8Array,
): CashuHistory {
  if (event.kind !== HISTORY_KIND) {
    throw new Error(`Expected kind ${HISTORY_KIND}, got ${event.kind}`)
  }
  const tags = JSON.parse(selfDecrypt(event.content, secretKey)) as string[][]

  let direction: 'in' | 'out' = 'in'
  let amount = '0'
  let unit = 'sat'
  const events: CashuHistoryRef[] = []

  for (const tag of tags) {
    if (tag[0] === 'direction') direction = tag[1] as 'in' | 'out'
    else if (tag[0] === 'amount') amount = tag[1]
    else if (tag[0] === 'unit') unit = tag[1]
    else if (tag[0] === 'e') events.push({ id: tag[1], relay: tag[2] || undefined, marker: tag[3] as CashuHistoryRef['marker'] })
  }

  // Merge unencrypted tags (redeemed markers)
  for (const tag of event.tags) {
    if (tag[0] === 'e') {
      events.push({ id: tag[1], relay: tag[2] || undefined, marker: tag[3] as CashuHistoryRef['marker'] })
    }
  }

  return { direction, amount, unit, events }
}

// ── Quote (kind 7374) ──────────────────────────────────────────────────

/**
 * Create a kind 7374 quote event template (unsigned).
 *
 * Tracks a pending mint quote while a Lightning payment is in-flight.
 * Uses NIP-40 expiration tag.
 */
export function createQuoteEventTemplate(
  quote: CashuQuote,
  secretKey: Uint8Array,
): EventTemplate {
  return {
    kind: QUOTE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['expiration', String(quote.expiration)],
      ['mint', quote.mint],
    ],
    content: selfEncrypt(quote.quoteId, secretKey),
  }
}

/**
 * Create and sign a kind 7374 quote event.
 */
export function createQuoteEvent(
  quote: CashuQuote,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createQuoteEventTemplate(quote, secretKey), secretKey)
}

/**
 * Decrypt and parse a kind 7374 quote event.
 */
export function parseQuoteEvent(
  event: NostrEvent,
  secretKey: Uint8Array,
): CashuQuote {
  if (event.kind !== QUOTE_KIND) {
    throw new Error(`Expected kind ${QUOTE_KIND}, got ${event.kind}`)
  }
  const mint = event.tags.find(t => t[0] === 'mint')?.[1] || ''
  const expiration = parseInt(event.tags.find(t => t[0] === 'expiration')?.[1] || '0', 10)
  return {
    quoteId: selfDecrypt(event.content, secretKey),
    mint,
    expiration,
  }
}

// ── Token Deletion ─────────────────────────────────────────────────────

/**
 * Create a kind 5 deletion event template for spent token events.
 *
 * Per NIP-60, the deletion MUST include `["k", "7375"]` for filtering.
 */
export function createTokenDeleteTemplate(tokenEventIds: string[]): EventTemplate {
  return {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ...tokenEventIds.map(id => ['e', id]),
      ['k', String(TOKEN_KIND)],
    ],
    content: '',
  }
}

/**
 * Create and sign a kind 5 deletion event for spent token events.
 */
export function createTokenDeleteEvent(
  tokenEventIds: string[],
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createTokenDeleteTemplate(tokenEventIds), secretKey)
}

// ── Relay Filters ──────────────────────────────────────────────────────

/**
 * Build filters to fetch a user's wallet and all unspent token events.
 */
export function getWalletFilters(pubkey: string) {
  return [
    { kinds: [WALLET_KIND], authors: [pubkey] },
    { kinds: [TOKEN_KIND], authors: [pubkey] },
  ]
}

/**
 * Build a filter to fetch a user's spending history.
 */
export function getHistoryFilter(pubkey: string) {
  return { kinds: [HISTORY_KIND], authors: [pubkey] }
}

// ── Utilities ──────────────────────────────────────────────────────────

/**
 * Sum the total amount of a set of Cashu proofs.
 */
export function getProofsBalance(proofs: CashuProof[]): number {
  return proofs.reduce((sum, p) => sum + p.amount, 0)
}
