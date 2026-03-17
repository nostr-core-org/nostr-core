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

// Extended Badge Proofs — Badges as Identity Verifiers

export type BadgeProofPow = { type: 'pow'; difficulty: number; nonce: string }
export type BadgeProofPayment = { type: 'payment'; preimage: string; invoice: string }
export type BadgeProofMembership = { type: 'membership'; groupId: string; membershipEventId: string }

export type BadgeProof =
  | BadgeProofPow
  | BadgeProofPayment
  | BadgeProofMembership

export type BadgeRequest = {
  badgeAddress: string
  proof?: BadgeProof
  content?: string
}

/**
 * Create a badge request event template (kind 8433) with optional proof.
 * This is a custom request flow — the requester publishes a request referencing
 * a badge definition, along with a proof that qualifies them for the badge.
 * The badge issuer can then verify the proof and award the badge.
 */
export function createBadgeRequestTemplate(request: BadgeRequest): EventTemplate {
  const tags: string[][] = [['a', request.badgeAddress]]

  if (request.proof) {
    switch (request.proof.type) {
      case 'pow':
        tags.push(['proof', 'pow', String(request.proof.difficulty), request.proof.nonce])
        break
      case 'payment':
        tags.push(['proof', 'payment', request.proof.preimage, request.proof.invoice])
        break
      case 'membership':
        tags.push(['proof', 'membership', request.proof.groupId, request.proof.membershipEventId])
        break
    }
  }

  return {
    kind: 8433,
    tags,
    content: request.content ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Parse a badge request event (kind 8433).
 */
export function parseBadgeRequest(event: NostrEvent): BadgeRequest {
  const result: BadgeRequest = { badgeAddress: '' }

  for (const tag of event.tags) {
    if (tag[0] === 'a') result.badgeAddress = tag[1]
  }

  const proof = extractBadgeProof(event)
  if (proof) result.proof = proof
  if (event.content) result.content = event.content

  return result
}

/**
 * Extract a badge proof from event tags.
 */
export function extractBadgeProof(event: NostrEvent): BadgeProof | undefined {
  const proofTag = event.tags.find(t => t[0] === 'proof')
  if (!proofTag) return undefined

  switch (proofTag[1]) {
    case 'pow':
      return { type: 'pow', difficulty: parseInt(proofTag[2], 10), nonce: proofTag[3] }
    case 'payment':
      return { type: 'payment', preimage: proofTag[2], invoice: proofTag[3] }
    case 'membership':
      return { type: 'membership', groupId: proofTag[2], membershipEventId: proofTag[3] }
    default:
      return undefined
  }
}

/**
 * @deprecated Use `extractBadgeProof` instead.
 */
export const verifyBadgeProof = extractBadgeProof

/**
 * Validate that a badge award event references the correct badge definition.
 */
export function validateBadgeAward(award: NostrEvent, definition: NostrEvent): boolean {
  if (award.kind !== 8 || definition.kind !== 30009) return false

  const awardAddress = award.tags.find(t => t[0] === 'a')?.[1]
  if (!awardAddress) return false

  const defIdentifier = definition.tags.find(t => t[0] === 'd')?.[1]
  if (!defIdentifier) return false

  // Address format: kind:pubkey:identifier
  const expectedAddress = `30009:${definition.pubkey}:${defIdentifier}`
  return awardAddress === expectedAddress
}

// ── Badge Acceptance / Rejection (Request Flow) ────────────────────────

export type BadgeAcceptance = {
  requestEventId: string
  badgeAddress: string
  recipientPubkey: string
}

export type BadgeRejection = {
  requestEventId: string
  badgeAddress: string
  reason?: string
}

/**
 * Create a badge acceptance event template (kind 8434).
 * Published by the badge issuer to accept a badge request and implicitly award.
 */
export function createBadgeAcceptanceTemplate(acceptance: BadgeAcceptance): EventTemplate {
  return {
    kind: 8434,
    tags: [
      ['e', acceptance.requestEventId],
      ['a', acceptance.badgeAddress],
      ['p', acceptance.recipientPubkey],
    ],
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a badge acceptance event.
 */
export function createBadgeAcceptanceEvent(acceptance: BadgeAcceptance, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createBadgeAcceptanceTemplate(acceptance), secretKey)
}

/**
 * Create a badge rejection event template (kind 8435).
 * Published by the badge issuer to reject a badge request.
 */
export function createBadgeRejectionTemplate(rejection: BadgeRejection): EventTemplate {
  return {
    kind: 8435,
    tags: [
      ['e', rejection.requestEventId],
      ['a', rejection.badgeAddress],
    ],
    content: rejection.reason ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a badge rejection event.
 */
export function createBadgeRejectionEvent(rejection: BadgeRejection, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createBadgeRejectionTemplate(rejection), secretKey)
}

// ── Badge Utility: Build address from definition ───────────────────────

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
