import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'
import type { Filter } from './filter.js'
import {
  createHistoryEventTemplate,
  parseHistoryEvent,
  type CashuHistoryRef,
  type CashuProof,
} from './nip60.js'

// ── Event Kinds ────────────────────────────────────────────────────────

/** Nutzap informational event: where and how to send a user ecash. */
export const NUTZAP_INFO_KIND = 10019

/** The nutzap itself: P2PK-locked proofs addressed to the recipient. */
export const NUTZAP_KIND = 9321

/** NIP-60 spending history, reused to record nutzap redemptions. */
export const NUTZAP_HISTORY_KIND = 7376

/** Default base unit when a nutzap omits its `unit` tag. */
export const DEFAULT_NUTZAP_UNIT = 'sat'

// ── Types ──────────────────────────────────────────────────────────────

/** A mint listed in a kind 10019 event, with the base units it is used for. */
export type NutzapMint = {
  url: string
  /** Optional base-unit markers, e.g. `['usd', 'sat']`. */
  units?: string[]
}

/** Decoded kind 10019 nutzap informational event. */
export type NutzapInfo = {
  /** Relays the user reads nutzaps from - senders must publish there. */
  relays: string[]
  /** Mints the user agrees to receive on. Sending elsewhere risks burning funds. */
  mints: NutzapMint[]
  /**
   * The P2PK public key incoming nutzaps must be locked to. This is the
   * `privkey` from the user's NIP-60 wallet event, never their Nostr identity
   * key.
   */
  p2pkPubkey: string
  extraTags?: string[][]
}

/** Decoded kind 9321 nutzap event. */
export type Nutzap = {
  /** P2PK-locked Cashu proofs, including their DLEQ proof. */
  proofs: CashuProof[]
  /** The `u` tag: mint URL, EXACTLY as listed in the recipient's kind 10019. */
  mint: string
  /** The `p` tag: the recipient's Nostr identity pubkey. */
  recipient: string
  /** The `unit` tag. Defaults to `sat`. */
  unit?: string
  /** The `e` tag: the event being nutzapped, if any. */
  eventId?: string
  eventRelayHint?: string
  /** The `k` tag: the kind of the nutzapped event. */
  eventKind?: number
  /** Optional comment. */
  content?: string
  extraTags?: string[][]
}

/** A parsed nutzap plus the envelope fields the sender signed. */
export type ParsedNutzap = Nutzap & {
  sender: string
  id: string
  created_at: number
}

/** A NUT-10 spending condition secret. */
export type P2PKSecret = {
  nonce: string
  /** The locked-to key, in 33-byte compressed hex (`02` + 32 bytes). */
  data: string
  tags?: string[][]
}

/** Record of claiming one or more nutzaps. */
export type NutzapRedemption = {
  /** The kind 9321 event(s) being redeemed. */
  nutzapEventId: string
  nutzapRelayHint?: string
  /** The nutzap sender, p-tagged so they can see the ecash was claimed. */
  senderPubkey: string
  amount: string
  unit?: string
  /** The kind 7375 token event the proofs were swapped into. */
  createdTokenEventId?: string
  createdTokenRelayHint?: string
}

// ── P2PK helpers ───────────────────────────────────────────────────────

/**
 * Convert a 32-byte x-only Nostr public key into the 33-byte compressed form
 * Cashu P2PK requires.
 *
 * NIP-61 mandates the `02` prefix for nostr<>cashu compatibility.
 */
export function toP2PKLockKey(pubkey: string): string {
  if (/^0[23][0-9a-f]{64}$/i.test(pubkey)) return pubkey.toLowerCase()
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    throw new Error(`Invalid public key: expected 32-byte hex, got "${pubkey}"`)
  }
  return `02${pubkey.toLowerCase()}`
}

/**
 * Strip the compressed-point prefix, returning the 32-byte x-only key.
 */
export function fromP2PKLockKey(lockKey: string): string {
  if (/^0[23][0-9a-f]{64}$/i.test(lockKey)) return lockKey.slice(2).toLowerCase()
  if (/^[0-9a-f]{64}$/i.test(lockKey)) return lockKey.toLowerCase()
  throw new Error(`Invalid P2PK lock key: "${lockKey}"`)
}

/**
 * Compare two keys ignoring the compressed-point prefix and case.
 */
export function isSameLockKey(a: string, b: string): boolean {
  try {
    return fromP2PKLockKey(a) === fromP2PKLockKey(b)
  } catch {
    return false
  }
}

/**
 * Parse a NUT-10 `P2PK` secret out of a Cashu proof.
 *
 * Returns `undefined` for plain (non-P2PK) secrets, which are spendable by
 * anyone and therefore never a valid nutzap.
 */
export function parseP2PKSecret(secret: string): P2PKSecret | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(secret)
  } catch {
    return undefined
  }

  if (!Array.isArray(parsed) || parsed[0] !== 'P2PK') return undefined

  const payload = parsed[1] as Record<string, unknown> | undefined
  if (!payload || typeof payload.data !== 'string') return undefined

  return {
    nonce: typeof payload.nonce === 'string' ? payload.nonce : '',
    data: payload.data,
    tags: Array.isArray(payload.tags) ? (payload.tags as string[][]) : undefined,
  }
}

/**
 * The public key a proof is P2PK-locked to, or `undefined` if it is unlocked.
 */
export function getProofLockKey(proof: CashuProof): string | undefined {
  return parseP2PKSecret(proof.secret)?.data
}

// ── Nutzap info (kind 10019) ───────────────────────────────────────────

const INFO_TAGS = new Set(['relay', 'mint', 'pubkey'])

/**
 * Create a kind 10019 nutzap informational event template.
 */
export function createNutzapInfoTemplate(info: NutzapInfo): EventTemplate {
  const tags: string[][] = []

  for (const relay of info.relays) tags.push(['relay', relay])
  for (const mint of info.mints) tags.push(['mint', mint.url, ...(mint.units ?? [])])
  tags.push(['pubkey', toP2PKLockKey(info.p2pkPubkey)])
  if (info.extraTags) tags.push(...info.extraTags)

  return {
    kind: NUTZAP_INFO_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  }
}

/**
 * Create and sign a kind 10019 nutzap informational event.
 */
export function createNutzapInfoEvent(info: NutzapInfo, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createNutzapInfoTemplate(info), secretKey)
}

/**
 * Parse a kind 10019 nutzap informational event.
 */
export function parseNutzapInfo(event: NostrEvent): NutzapInfo {
  const relays: string[] = []
  const mints: NutzapMint[] = []
  let p2pkPubkey = ''

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'relay':
        if (tag[1]) relays.push(tag[1])
        break
      case 'mint':
        if (tag[1]) {
          const units = tag.slice(2).filter(Boolean)
          mints.push(units.length ? { url: tag[1], units } : { url: tag[1] })
        }
        break
      case 'pubkey':
        if (tag[1]) p2pkPubkey = tag[1]
        break
    }
  }

  const result: NutzapInfo = { relays, mints, p2pkPubkey }
  const extraTags = event.tags.filter(t => !INFO_TAGS.has(t[0]))
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Nutzap (kind 9321) ─────────────────────────────────────────────────

const NUTZAP_TAGS = new Set(['proof', 'unit', 'u', 'e', 'k', 'p'])

/**
 * Create a kind 9321 nutzap template.
 *
 * The proofs must already be minted or swapped at `mint` and P2PK-locked to
 * the `pubkey` from the recipient's kind 10019 event.
 */
export function createNutzapTemplate(nutzap: Nutzap): EventTemplate {
  if (!nutzap.proofs.length) throw new Error('A nutzap must carry at least one proof')

  const tags: string[][] = nutzap.proofs.map(proof => ['proof', JSON.stringify(proof)])

  if (nutzap.unit) tags.push(['unit', nutzap.unit])
  tags.push(['u', nutzap.mint])
  if (nutzap.eventId) {
    tags.push(nutzap.eventRelayHint ? ['e', nutzap.eventId, nutzap.eventRelayHint] : ['e', nutzap.eventId])
  }
  if (nutzap.eventKind !== undefined) tags.push(['k', String(nutzap.eventKind)])
  tags.push(['p', nutzap.recipient])
  if (nutzap.extraTags) tags.push(...nutzap.extraTags)

  return {
    kind: NUTZAP_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: nutzap.content ?? '',
  }
}

/**
 * Create and sign a kind 9321 nutzap.
 */
export function createNutzapEvent(nutzap: Nutzap, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createNutzapTemplate(nutzap), secretKey)
}

/**
 * Parse a kind 9321 nutzap. Malformed `proof` tags are skipped.
 */
export function parseNutzap(event: NostrEvent): ParsedNutzap {
  const proofs: CashuProof[] = []
  let mint = ''
  let recipient = ''
  let unit: string | undefined
  let eventId: string | undefined
  let eventRelayHint: string | undefined
  let eventKind: number | undefined

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'proof': {
        if (!tag[1]) break
        try {
          const proof = JSON.parse(tag[1]) as CashuProof
          if (
            typeof proof?.id === 'string' &&
            typeof proof?.amount === 'number' &&
            typeof proof?.secret === 'string' &&
            typeof proof?.C === 'string'
          ) {
            proofs.push(proof)
          }
        } catch {
          // skip unparseable proofs
        }
        break
      }
      case 'unit':
        unit = tag[1]
        break
      case 'u':
        mint = tag[1] ?? ''
        break
      case 'e':
        eventId = tag[1]
        if (tag[2]) eventRelayHint = tag[2]
        break
      case 'k': {
        const kind = parseInt(tag[1], 10)
        if (Number.isFinite(kind)) eventKind = kind
        break
      }
      case 'p':
        recipient = tag[1] ?? ''
        break
    }
  }

  const result: ParsedNutzap = {
    proofs,
    mint,
    recipient,
    unit: unit ?? DEFAULT_NUTZAP_UNIT,
    sender: event.pubkey,
    id: event.id,
    created_at: event.created_at,
  }

  if (eventId) result.eventId = eventId
  if (eventRelayHint) result.eventRelayHint = eventRelayHint
  if (eventKind !== undefined) result.eventKind = eventKind
  if (event.content) result.content = event.content

  const extraTags = event.tags.filter(t => !NUTZAP_TAGS.has(t[0]))
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

/**
 * Sum the value of a nutzap's proofs, in its base unit.
 */
export function getNutzapAmount(nutzap: Pick<Nutzap, 'proofs'>): number {
  return nutzap.proofs.reduce((sum, p) => sum + p.amount, 0)
}

// ── Verification ───────────────────────────────────────────────────────

export type NutzapVerification = {
  valid: boolean
  errors: string[]
}

/**
 * Check a nutzap against the recipient's kind 10019 event.
 *
 * Covers everything an observer can check offline except the DLEQ proof, which
 * needs the mint's keyset and belongs to a Cashu library:
 *
 * - the proofs come from a mint the recipient listed;
 * - they are P2PK-locked, and locked to the key the recipient published;
 * - the nutzap actually p-tags the recipient.
 */
export function verifyNutzap(
  nutzap: Nutzap | ParsedNutzap,
  info: NutzapInfo,
  recipientPubkey?: string,
): NutzapVerification {
  const errors: string[] = []

  if (!nutzap.proofs.length) errors.push('Nutzap carries no proofs')

  if (!info.mints.some(m => m.url === nutzap.mint)) {
    errors.push(`Mint "${nutzap.mint}" is not listed in the recipient's kind 10019`)
  }

  if (!info.p2pkPubkey) {
    errors.push("Recipient's kind 10019 has no P2PK pubkey")
  } else {
    for (const proof of nutzap.proofs) {
      const lock = getProofLockKey(proof)
      if (!lock) {
        errors.push('Proof is not P2PK-locked - anyone could spend it')
      } else if (!isSameLockKey(lock, info.p2pkPubkey)) {
        errors.push(`Proof is locked to ${lock}, not to the recipient's ${info.p2pkPubkey}`)
      }
    }
  }

  if (recipientPubkey && nutzap.recipient !== recipientPubkey) {
    errors.push(`Nutzap p-tags ${nutzap.recipient}, not ${recipientPubkey}`)
  }

  return { valid: errors.length === 0, errors }
}

// ── Redemption history (kind 7376) ─────────────────────────────────────

/**
 * Create a kind 7376 event recording that a nutzap has been claimed.
 *
 * The redeemed reference stays in plaintext tags (so the sender can see the
 * ecash was picked up) while the amount and the new token event are NIP-44
 * encrypted to self, per NIP-60.
 *
 * Publish these to the *sender's* NIP-65 read relays.
 */
export function createNutzapRedemptionTemplate(
  redemption: NutzapRedemption,
  secretKey: Uint8Array,
): EventTemplate {
  const events: CashuHistoryRef[] = [
    {
      id: redemption.nutzapEventId,
      relay: redemption.nutzapRelayHint,
      marker: 'redeemed',
    },
  ]

  if (redemption.createdTokenEventId) {
    events.push({
      id: redemption.createdTokenEventId,
      relay: redemption.createdTokenRelayHint,
      marker: 'created',
    })
  }

  const template = createHistoryEventTemplate(
    {
      direction: 'in',
      amount: redemption.amount,
      unit: redemption.unit ?? DEFAULT_NUTZAP_UNIT,
      events,
    },
    secretKey,
  )

  template.tags.push(['p', redemption.senderPubkey])
  return template
}

/**
 * Create and sign a kind 7376 nutzap redemption event.
 */
export function createNutzapRedemptionEvent(
  redemption: NutzapRedemption,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createNutzapRedemptionTemplate(redemption, secretKey), secretKey)
}

/**
 * Decrypt and parse a kind 7376 nutzap redemption event.
 */
export function parseNutzapRedemption(
  event: NostrEvent,
  secretKey: Uint8Array,
): NutzapRedemption {
  const history = parseHistoryEvent(event, secretKey)
  const redeemed = history.events.find(e => e.marker === 'redeemed')
  const created = history.events.find(e => e.marker === 'created')

  return {
    nutzapEventId: redeemed?.id ?? '',
    nutzapRelayHint: redeemed?.relay,
    senderPubkey: event.tags.find(t => t[0] === 'p')?.[1] ?? '',
    amount: history.amount,
    unit: history.unit,
    createdTokenEventId: created?.id,
    createdTokenRelayHint: created?.relay,
  }
}

/**
 * The kind 9321 event ids a set of kind 7376 events have already claimed.
 *
 * Reads the plaintext `redeemed` tags only, so it needs no secret key.
 */
export function getRedeemedNutzapIds(historyEvents: NostrEvent[]): Set<string> {
  const ids = new Set<string>()
  for (const event of historyEvents) {
    if (event.kind !== NUTZAP_HISTORY_KIND) continue
    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[3] === 'redeemed' && tag[1]) ids.add(tag[1])
    }
  }
  return ids
}

// ── Filters ────────────────────────────────────────────────────────────

/**
 * Build a filter for incoming nutzaps.
 *
 * Always narrow by `mints`: filtering with `#u` keeps the client from even
 * interacting with mints the user never signalled. Pass `since` as the
 * `created_at` of the newest kind 7376 event to skip already-claimed nutzaps.
 */
export function getNutzapFilter(
  pubkey: string,
  mints: string[],
  since?: number,
): Filter {
  const filter: Filter = { kinds: [NUTZAP_KIND], '#p': [pubkey] }
  if (mints.length) filter['#u'] = mints
  if (since !== undefined) filter.since = since
  return filter
}

/**
 * Build a filter for a user's kind 10019 nutzap informational event.
 */
export function getNutzapInfoFilter(pubkeys: string | string[]): Filter {
  return {
    kinds: [NUTZAP_INFO_KIND],
    authors: Array.isArray(pubkeys) ? pubkeys : [pubkeys],
  }
}

/**
 * Build a filter for a user's own nutzap redemption history.
 */
export function getNutzapRedemptionFilter(pubkey: string): Filter {
  return { kinds: [NUTZAP_HISTORY_KIND], authors: [pubkey] }
}
