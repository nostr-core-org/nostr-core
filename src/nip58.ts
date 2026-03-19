import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

// Badge Definition (kind 30009)

export type BadgeDefinition = {
  identifier: string
  name?: string
  description?: string
  image?: string
  thumbs?: string[]
}

/**
 * Create a kind 30009 badge definition event template.
 */
export function createBadgeDefinitionTemplate(badge: BadgeDefinition): EventTemplate {
  const tags: string[][] = [['d', badge.identifier]]

  if (badge.name) tags.push(['name', badge.name])
  if (badge.description) tags.push(['description', badge.description])
  if (badge.image) tags.push(['image', badge.image])
  if (badge.thumbs) {
    for (const thumb of badge.thumbs) tags.push(['thumb', thumb])
  }

  return {
    kind: 30009,
    tags,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a badge definition event.
 */
export function createBadgeDefinitionEvent(badge: BadgeDefinition, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createBadgeDefinitionTemplate(badge), secretKey)
}

/**
 * Parse a kind 30009 badge definition event.
 */
export function parseBadgeDefinition(event: NostrEvent): BadgeDefinition {
  const result: BadgeDefinition = { identifier: '' }
  const thumbs: string[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'name':
        result.name = tag[1]
        break
      case 'description':
        result.description = tag[1]
        break
      case 'image':
        result.image = tag[1]
        break
      case 'thumb':
        if (tag[1]) thumbs.push(tag[1])
        break
    }
  }

  if (thumbs.length > 0) result.thumbs = thumbs

  return result
}

// Badge Award (kind 8)

export type BadgeAward = {
  badgeAddress: string
  recipients: string[]
}

/**
 * Create a kind 8 badge award event template.
 */
export function createBadgeAwardTemplate(award: BadgeAward): EventTemplate {
  const tags: string[][] = [['a', award.badgeAddress]]

  for (const recipient of award.recipients) {
    tags.push(['p', recipient])
  }

  return {
    kind: 8,
    tags,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a badge award event.
 */
export function createBadgeAwardEvent(award: BadgeAward, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createBadgeAwardTemplate(award), secretKey)
}

/**
 * Parse a kind 8 badge award event.
 */
export function parseBadgeAward(event: NostrEvent): BadgeAward {
  let badgeAddress = ''
  const recipients: string[] = []

  for (const tag of event.tags) {
    if (tag[0] === 'a') badgeAddress = tag[1]
    else if (tag[0] === 'p') recipients.push(tag[1])
  }

  return { badgeAddress, recipients }
}

// Profile Badges (kind 30008)

export type ProfileBadge = {
  badgeAddress: string
  awardEventId: string
}

/**
 * Create a kind 30008 profile badges event template.
 */
export function createProfileBadgesTemplate(badges: ProfileBadge[]): EventTemplate {
  const tags: string[][] = [['d', 'profile_badges']]

  for (const badge of badges) {
    tags.push(['a', badge.badgeAddress])
    tags.push(['e', badge.awardEventId])
  }

  return {
    kind: 30008,
    tags,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a profile badges event.
 */
export function createProfileBadgesEvent(badges: ProfileBadge[], secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createProfileBadgesTemplate(badges), secretKey)
}

/**
 * Parse a kind 30008 profile badges event.
 */
export function parseProfileBadges(event: NostrEvent): ProfileBadge[] {
  const badges: ProfileBadge[] = []

  // Tags come in pairs: ['a', address], ['e', awardId]
  const tags = event.tags.filter(t => t[0] === 'a' || t[0] === 'e')

  let currentAddress: string | undefined
  for (const tag of tags) {
    if (tag[0] === 'a') {
      currentAddress = tag[1]
    } else if (tag[0] === 'e' && currentAddress) {
      badges.push({ badgeAddress: currentAddress, awardEventId: tag[1] })
      currentAddress = undefined
    }
  }

  return badges
}

// ── Badge Request (kind 30058) & Denial (kind 30059) — NIP-58 Extension ──
// Draft: https://github.com/nostr-protocol/nips/pull/2204
// Working implementation: https://badgebox.rinbal.de
// Wider adoption across the network is needed to get this merged into the NIP-58 spec.

export type BadgeRequest = {
  badgeAddress: string
  issuerPubkey: string
  proofs?: string[]
  content?: string
  relayUrl?: string
}

/**
 * Create a kind 30058 badge request event template (addressable).
 * The `d` tag is the badge address, ensuring one active request per badge per user.
 * Withdrawal is done via NIP-09 deletion (kind 5).
 */
export function createBadgeRequestTemplate(request: BadgeRequest): EventTemplate {
  const tags: string[][] = [
    ['d', request.badgeAddress],
    ['a', request.badgeAddress, ...(request.relayUrl ? [request.relayUrl] : [])],
    ['p', request.issuerPubkey],
  ]

  if (request.proofs) {
    for (const proof of request.proofs) {
      tags.push(['proof', proof])
    }
  }

  return {
    kind: 30058,
    tags,
    content: request.content ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a badge request event.
 */
export function createBadgeRequestEvent(request: BadgeRequest, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createBadgeRequestTemplate(request), secretKey)
}

/**
 * Parse a kind 30058 badge request event.
 */
export function parseBadgeRequest(event: NostrEvent): BadgeRequest {
  let badgeAddress = ''
  let issuerPubkey = ''
  let relayUrl: string | undefined
  const proofs: string[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        badgeAddress = tag[1] ?? ''
        break
      case 'a':
        if (!badgeAddress && tag[1]) badgeAddress = tag[1]
        if (tag[2]) relayUrl = tag[2]
        break
      case 'p':
        issuerPubkey = tag[1] ?? ''
        break
      case 'proof':
        if (tag[1]) proofs.push(tag[1])
        break
    }
  }

  return {
    badgeAddress,
    issuerPubkey,
    ...(proofs.length > 0 ? { proofs } : {}),
    ...(event.content ? { content: event.content } : {}),
    ...(relayUrl ? { relayUrl } : {}),
  }
}

// ── Badge Denial (kind 30059) — NIP-58 Extension ───────────────────────

export type BadgeDenial = {
  requestEventId: string
  badgeAddress: string
  requesterPubkey: string
  reason?: string
  relayUrl?: string
}

/**
 * Create a kind 30059 badge denial event template (addressable).
 * The `d` tag is the request event id, ensuring one denial per request.
 * Revocation is done via NIP-09 deletion (kind 5).
 */
export function createBadgeDenialTemplate(denial: BadgeDenial): EventTemplate {
  return {
    kind: 30059,
    tags: [
      ['d', denial.requestEventId],
      ['a', denial.badgeAddress, ...(denial.relayUrl ? [denial.relayUrl] : [])],
      ['e', denial.requestEventId, ...(denial.relayUrl ? [denial.relayUrl] : [])],
      ['p', denial.requesterPubkey],
    ],
    content: denial.reason ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a badge denial event.
 */
export function createBadgeDenialEvent(denial: BadgeDenial, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createBadgeDenialTemplate(denial), secretKey)
}

/**
 * Parse a kind 30059 badge denial event.
 */
export function parseBadgeDenial(event: NostrEvent): BadgeDenial {
  let requestEventId = ''
  let badgeAddress = ''
  let requesterPubkey = ''
  let relayUrl: string | undefined

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        requestEventId = tag[1] ?? ''
        break
      case 'a':
        badgeAddress = tag[1] ?? ''
        if (tag[2]) relayUrl = tag[2]
        break
      case 'p':
        requesterPubkey = tag[1] ?? ''
        break
    }
  }

  return {
    requestEventId,
    badgeAddress,
    requesterPubkey,
    ...(event.content ? { reason: event.content } : {}),
    ...(relayUrl ? { relayUrl } : {}),
  }
}

// ── Badge Request State Resolution ─────────────────────────────────────

export type BadgeRequestState = 'fulfilled' | 'denied' | 'pending'

/**
 * Resolve the state of a badge request.
 * Priority: Fulfilled (kind 8 award exists) > Denied (kind 30059 exists) > Pending.
 */
export function resolveBadgeRequestState(
  requestEvent: NostrEvent,
  badgeAwards: NostrEvent[],
  badgeDenials: NostrEvent[],
): BadgeRequestState {
  const badgeAddress = requestEvent.tags.find(t => t[0] === 'd')?.[1] ?? ''
  const requesterPubkey = requestEvent.pubkey

  // 1. Check for fulfillment — kind 8 award from issuer to requester for this badge
  const fulfilled = badgeAwards.some(
    award =>
      award.kind === 8 &&
      award.tags.some(t => t[0] === 'a' && t[1] === badgeAddress) &&
      award.tags.some(t => t[0] === 'p' && t[1] === requesterPubkey),
  )
  if (fulfilled) return 'fulfilled'

  // 2. Check for denial — kind 30059 referencing this request
  const denied = badgeDenials.some(
    denial =>
      denial.kind === 30059 &&
      denial.tags.some(t => t[0] === 'e' && t[1] === requestEvent.id),
  )
  if (denied) return 'denied'

  // 3. Otherwise pending
  return 'pending'
}

// ── Badge Utilities ────────────────────────────────────────────────────

/**
 * Validate that a badge award event references the correct badge definition.
 */
export function validateBadgeAward(award: NostrEvent, definition: NostrEvent): boolean {
  if (award.kind !== 8 || definition.kind !== 30009) return false

  const awardAddress = award.tags.find(t => t[0] === 'a')?.[1]
  if (!awardAddress) return false

  const defIdentifier = definition.tags.find(t => t[0] === 'd')?.[1]
  if (!defIdentifier) return false

  const expectedAddress = `30009:${definition.pubkey}:${defIdentifier}`
  return awardAddress === expectedAddress
}

/**
 * Build a badge address string (`30009:pubkey:identifier`) from a badge definition event.
 */
export function buildBadgeAddress(definition: NostrEvent): string {
  const identifier = definition.tags.find(t => t[0] === 'd')?.[1] ?? ''
  return `30009:${definition.pubkey}:${identifier}`
}

/**
 * Check if a user has been awarded a specific badge by inspecting badge award events.
 */
export function hasBeenAwarded(pubkey: string, badgeAwards: NostrEvent[]): boolean {
  return badgeAwards.some(
    award => award.kind === 8 && award.tags.some(t => t[0] === 'p' && t[1] === pubkey),
  )
}
