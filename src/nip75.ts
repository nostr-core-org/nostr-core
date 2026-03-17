import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

// ── Kind 9041: Zap Goal ────────────────────────────────────────────────

export type ZapBeneficiary = {
  pubkey: string
  relay?: string
  weight?: string
}

export type ZapGoal = {
  content: string // human-readable goal description
  amount: number // target amount in millisatoshis
  relays: string[] // relays to track zaps
  closedAt?: number // unix timestamp cutoff
  image?: string
  summary?: string
  references?: string[] // external URLs (r tags)
  addresses?: string[] // addressable event references (a tags)
  beneficiaries?: ZapBeneficiary[] // NIP-57 zap split targets
}

/**
 * Create a kind 9041 zap goal event template.
 */
export function createZapGoalTemplate(goal: ZapGoal): EventTemplate {
  const tags: string[][] = [
    ['amount', String(goal.amount)],
    ['relays', ...goal.relays],
  ]

  if (goal.closedAt) tags.push(['closed_at', String(goal.closedAt)])
  if (goal.image) tags.push(['image', goal.image])
  if (goal.summary) tags.push(['summary', goal.summary])
  if (goal.references) {
    for (const r of goal.references) tags.push(['r', r])
  }
  if (goal.addresses) {
    for (const a of goal.addresses) tags.push(['a', a])
  }
  if (goal.beneficiaries) {
    for (const b of goal.beneficiaries) {
      const tag = ['zap', b.pubkey]
      if (b.relay) tag.push(b.relay)
      if (b.weight) tag.push(b.weight)
      tags.push(tag)
    }
  }

  return {
    kind: 9041,
    tags,
    content: goal.content,
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 9041 zap goal event.
 */
export function createZapGoalEvent(goal: ZapGoal, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createZapGoalTemplate(goal), secretKey)
}

/**
 * Parse a kind 9041 zap goal event.
 */
export function parseZapGoal(event: NostrEvent): ZapGoal {
  const result: ZapGoal = { content: event.content, amount: 0, relays: [] }
  const references: string[] = []
  const addresses: string[] = []
  const beneficiaries: ZapBeneficiary[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'amount':
        result.amount = parseInt(tag[1], 10)
        break
      case 'relays':
        result.relays = tag.slice(1)
        break
      case 'closed_at':
        result.closedAt = parseInt(tag[1], 10)
        break
      case 'image':
        result.image = tag[1]
        break
      case 'summary':
        result.summary = tag[1]
        break
      case 'r':
        if (tag[1]) references.push(tag[1])
        break
      case 'a':
        if (tag[1]) addresses.push(tag[1])
        break
      case 'zap': {
        if (tag[1]) {
          const b: ZapBeneficiary = { pubkey: tag[1] }
          if (tag[2]) b.relay = tag[2]
          if (tag[3]) b.weight = tag[3]
          beneficiaries.push(b)
        }
        break
      }
    }
  }

  if (references.length > 0) result.references = references
  if (addresses.length > 0) result.addresses = addresses
  if (beneficiaries.length > 0) result.beneficiaries = beneficiaries

  return result
}

/**
 * Check if a zap goal is still open (not past its closed_at timestamp).
 */
export function isZapGoalOpen(event: NostrEvent): boolean {
  const closedAtTag = event.tags.find(t => t[0] === 'closed_at')
  if (!closedAtTag) return true
  const closedAt = parseInt(closedAtTag[1], 10)
  return Math.floor(Date.now() / 1000) < closedAt
}

/**
 * Calculate the zap goal progress from a list of zap receipt events (kind 9735).
 * Returns the total amount received in millisatoshis.
 */
export function calculateZapGoalProgress(zapReceipts: NostrEvent[]): number {
  let total = 0

  for (const receipt of zapReceipts) {
    if (receipt.kind !== 9735) continue

    const descriptionTag = receipt.tags.find(t => t[0] === 'description')
    if (!descriptionTag?.[1]) continue

    try {
      const zapRequest = JSON.parse(descriptionTag[1]) as NostrEvent
      const amountTag = zapRequest.tags.find(t => t[0] === 'amount')
      if (amountTag) total += parseInt(amountTag[1], 10)
    } catch {
      // Invalid description JSON, skip
    }
  }

  return total
}

/**
 * Build a `goal` tag for an addressable event that references a zap goal.
 */
export function buildGoalTag(goalEventId: string, relay?: string): string[] {
  const tag = ['goal', goalEventId]
  if (relay) tag.push(relay)
  return tag
}
