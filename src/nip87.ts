import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'
import type { Filter } from './filter.js'

// ── Event Kinds ────────────────────────────────────────────────────────

/** A user's recommendation of an ecash mint. */
export const MINT_RECOMMENDATION_KIND = 38000

/** A Cashu mint announcing itself. */
export const CASHU_MINT_KIND = 38172

/** A Fedimint federation announcing itself. */
export const FEDIMINT_KIND = 38173

/** The announcement kinds a recommendation can point at. */
export type MintAnnouncementKind = typeof CASHU_MINT_KIND | typeof FEDIMINT_KIND

export type MintNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest'

// ── Types ──────────────────────────────────────────────────────────────

/** An `a` tag pointing at a mint announcement, with its optional relay hint. */
export type MintAnnouncementRef = {
  address: string
  relayHint?: string
  /** Optional third slot used by some clients to label the mint type. */
  label?: string
}

/** A `u` tag: a mint URL or a Fedimint invite code. */
export type MintConnection = {
  /** Mint URL (Cashu) or invite code (Fedimint). */
  url: string
  /** Optional marker, e.g. `"cashu"` / `"fedimint"`. */
  label?: string
}

/** kind 38000 - one user's recommendation of a mint. */
export type MintRecommendation = {
  /**
   * The `d` tag: the identifier of the announcement being recommended (the
   * Cashu mint pubkey or the federation id). Can be computed even when no
   * announcement event exists.
   */
  identifier: string
  /** The `k` tag: the announcement kind being recommended. */
  recommendedKind?: MintAnnouncementKind
  /** `u` tags: how to reach the mint. */
  connections?: MintConnection[]
  /** `a` tags: pointers to the announcement events. */
  announcements?: MintAnnouncementRef[]
  /** Free-form review. */
  content?: string
  extraTags?: string[][]
}

/** kind 38172 - a Cashu mint announcement. */
export type CashuMintAnnouncement = {
  /** The `d` tag: the mint's pubkey, as returned by `/v1/info`. */
  identifier: string
  /** `u` tags: mint URLs. */
  urls: string[]
  /** The `nuts` tag: supported NUT numbers. */
  nuts?: number[]
  network?: MintNetwork
  /** Optional kind-0 style metadata JSON. */
  content?: string
  extraTags?: string[][]
}

/** kind 38173 - a Fedimint announcement. */
export type FedimintAnnouncement = {
  /** The `d` tag: the federation id. */
  identifier: string
  /** `u` tags: invite codes. */
  inviteCodes: string[]
  /** The `modules` tag: supported modules. */
  modules?: string[]
  network?: MintNetwork
  /** Optional kind-0 style metadata JSON. */
  content?: string
  extraTags?: string[][]
}

// ── Tag helpers ────────────────────────────────────────────────────────

function connectionTag(c: MintConnection): string[] {
  return c.label ? ['u', c.url, c.label] : ['u', c.url]
}

function announcementTag(a: MintAnnouncementRef): string[] {
  if (a.label) return ['a', a.address, a.relayHint ?? '', a.label]
  if (a.relayHint) return ['a', a.address, a.relayHint]
  return ['a', a.address]
}

function collectExtraTags(event: NostrEvent, recognized: Set<string>): string[][] {
  return event.tags.filter(tag => !recognized.has(tag[0]))
}

/** Split a comma-separated tag value such as `"1,2,3"` or `"lightning,mint"`. */
function splitList(value: string | undefined): string[] {
  if (!value) return []
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

// ── Recommendation (kind 38000) ────────────────────────────────────────

const RECOMMENDATION_TAGS = new Set(['d', 'k', 'u', 'a'])

/**
 * Create a kind 38000 mint recommendation template.
 */
export function createMintRecommendationTemplate(rec: MintRecommendation): EventTemplate {
  const tags: string[][] = [['d', rec.identifier]]

  if (rec.recommendedKind !== undefined) tags.push(['k', String(rec.recommendedKind)])
  for (const c of rec.connections ?? []) tags.push(connectionTag(c))
  for (const a of rec.announcements ?? []) tags.push(announcementTag(a))
  if (rec.extraTags) tags.push(...rec.extraTags)

  return {
    kind: MINT_RECOMMENDATION_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: rec.content ?? '',
  }
}

/**
 * Create and sign a kind 38000 mint recommendation.
 */
export function createMintRecommendation(
  rec: MintRecommendation,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createMintRecommendationTemplate(rec), secretKey)
}

/**
 * Parse a kind 38000 mint recommendation.
 */
export function parseMintRecommendation(event: NostrEvent): MintRecommendation {
  const result: MintRecommendation = { identifier: '' }
  const connections: MintConnection[] = []
  const announcements: MintAnnouncementRef[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'k': {
        const kind = parseInt(tag[1], 10)
        if (kind === CASHU_MINT_KIND || kind === FEDIMINT_KIND) result.recommendedKind = kind
        break
      }
      case 'u':
        if (tag[1]) connections.push(tag[2] ? { url: tag[1], label: tag[2] } : { url: tag[1] })
        break
      case 'a':
        if (tag[1]) {
          const ref: MintAnnouncementRef = { address: tag[1] }
          if (tag[2]) ref.relayHint = tag[2]
          if (tag[3]) ref.label = tag[3]
          announcements.push(ref)
        }
        break
    }
  }

  if (event.content) result.content = event.content
  if (connections.length > 0) result.connections = connections
  if (announcements.length > 0) result.announcements = announcements

  const extraTags = collectExtraTags(event, RECOMMENDATION_TAGS)
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Cashu mint announcement (kind 38172) ───────────────────────────────

const CASHU_TAGS = new Set(['d', 'u', 'nuts', 'n'])

/**
 * Create a kind 38172 Cashu mint announcement template.
 */
export function createCashuMintAnnouncementTemplate(mint: CashuMintAnnouncement): EventTemplate {
  const tags: string[][] = [['d', mint.identifier]]

  for (const url of mint.urls) tags.push(['u', url])
  if (mint.nuts?.length) tags.push(['nuts', mint.nuts.join(',')])
  if (mint.network) tags.push(['n', mint.network])
  if (mint.extraTags) tags.push(...mint.extraTags)

  return {
    kind: CASHU_MINT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: mint.content ?? '',
  }
}

/**
 * Create and sign a kind 38172 Cashu mint announcement.
 */
export function createCashuMintAnnouncement(
  mint: CashuMintAnnouncement,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createCashuMintAnnouncementTemplate(mint), secretKey)
}

/**
 * Parse a kind 38172 Cashu mint announcement.
 */
export function parseCashuMintAnnouncement(event: NostrEvent): CashuMintAnnouncement {
  const result: CashuMintAnnouncement = { identifier: '', urls: [] }

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'u':
        if (tag[1]) result.urls.push(tag[1])
        break
      case 'nuts': {
        const nuts = splitList(tag[1]).map(n => parseInt(n, 10)).filter(Number.isFinite)
        if (nuts.length) result.nuts = nuts
        break
      }
      case 'n':
        if (tag[1]) result.network = tag[1] as MintNetwork
        break
    }
  }

  if (event.content) result.content = event.content

  const extraTags = collectExtraTags(event, CASHU_TAGS)
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Fedimint announcement (kind 38173) ─────────────────────────────────

const FEDIMINT_TAGS = new Set(['d', 'u', 'modules', 'n'])

/**
 * Create a kind 38173 Fedimint announcement template.
 */
export function createFedimintAnnouncementTemplate(fed: FedimintAnnouncement): EventTemplate {
  const tags: string[][] = [['d', fed.identifier]]

  for (const code of fed.inviteCodes) tags.push(['u', code])
  if (fed.modules?.length) tags.push(['modules', fed.modules.join(',')])
  if (fed.network) tags.push(['n', fed.network])
  if (fed.extraTags) tags.push(...fed.extraTags)

  return {
    kind: FEDIMINT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: fed.content ?? '',
  }
}

/**
 * Create and sign a kind 38173 Fedimint announcement.
 */
export function createFedimintAnnouncement(
  fed: FedimintAnnouncement,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createFedimintAnnouncementTemplate(fed), secretKey)
}

/**
 * Parse a kind 38173 Fedimint announcement.
 */
export function parseFedimintAnnouncement(event: NostrEvent): FedimintAnnouncement {
  const result: FedimintAnnouncement = { identifier: '', inviteCodes: [] }

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'u':
        if (tag[1]) result.inviteCodes.push(tag[1])
        break
      case 'modules': {
        const modules = splitList(tag[1])
        if (modules.length) result.modules = modules
        break
      }
      case 'n':
        if (tag[1]) result.network = tag[1] as MintNetwork
        break
    }
  }

  if (event.content) result.content = event.content

  const extraTags = collectExtraTags(event, FEDIMINT_TAGS)
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Addressing & filters ───────────────────────────────────────────────

/**
 * Build the `a` tag coordinate for a mint announcement.
 */
export function buildMintAnnouncementAddress(
  kind: MintAnnouncementKind,
  pubkey: string,
  identifier: string,
): string {
  return `${kind}:${pubkey}:${identifier}`
}

/**
 * Build a filter for mint recommendations, typically from the user's own
 * follow list rather than the whole network.
 */
export function getMintRecommendationFilter(opts?: {
  authors?: string[]
  kind?: MintAnnouncementKind
  identifiers?: string[]
}): Filter {
  const filter: Filter = { kinds: [MINT_RECOMMENDATION_KIND] }
  if (opts?.authors?.length) filter.authors = opts.authors
  if (opts?.kind !== undefined) filter['#k'] = [String(opts.kind)]
  if (opts?.identifiers?.length) filter['#d'] = opts.identifiers
  return filter
}

/**
 * Build a filter for mint announcements.
 *
 * Querying announcements directly bypasses the web of trust, so clients SHOULD
 * pair it with spam prevention or a curated relay.
 */
export function getMintAnnouncementFilter(opts?: {
  kinds?: MintAnnouncementKind[]
  identifiers?: string[]
  authors?: string[]
}): Filter {
  const filter: Filter = { kinds: opts?.kinds ?? [CASHU_MINT_KIND, FEDIMINT_KIND] }
  if (opts?.identifiers?.length) filter['#d'] = opts.identifiers
  if (opts?.authors?.length) filter.authors = opts.authors
  return filter
}

// ── Utilities ──────────────────────────────────────────────────────────

/**
 * Count how many distinct pubkeys recommend each mint identifier.
 *
 * Recommendations are addressable, so only the newest event per
 * (author, identifier) pair is counted.
 */
export function tallyRecommendations(events: NostrEvent[]): Map<string, number> {
  const newest = new Map<string, NostrEvent>()

  for (const event of events) {
    if (event.kind !== MINT_RECOMMENDATION_KIND) continue
    const identifier = event.tags.find(t => t[0] === 'd')?.[1] ?? ''
    const key = `${event.pubkey}:${identifier}`
    const current = newest.get(key)
    if (!current || current.created_at < event.created_at) newest.set(key, event)
  }

  const counts = new Map<string, number>()
  for (const event of newest.values()) {
    const identifier = event.tags.find(t => t[0] === 'd')?.[1] ?? ''
    counts.set(identifier, (counts.get(identifier) ?? 0) + 1)
  }
  return counts
}

/**
 * Check whether an event is one of the NIP-87 kinds.
 */
export function isMintDiscoveryEvent(event: NostrEvent): boolean {
  return (
    event.kind === MINT_RECOMMENDATION_KIND ||
    event.kind === CASHU_MINT_KIND ||
    event.kind === FEDIMINT_KIND
  )
}
