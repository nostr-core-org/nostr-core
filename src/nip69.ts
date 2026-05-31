import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

/**
 * NIP-69 — Peer-to-peer order events (kind 38383, addressable).
 * https://github.com/nostr-protocol/nips/blob/master/69.md
 */

export const ORDER_KIND = 38383

export type OrderType = 'buy' | 'sell'

export type OrderStatus = 'pending' | 'canceled' | 'in-progress' | 'success' | 'expired'

export type P2POrder = {
  /** Unique identifier for the order (`d` tag). */
  id: string
  /** Order direction. */
  type: OrderType
  /** Fiat currency being traded, ISO 4217 code (e.g. `VES`, `USD`). */
  fiatCurrency: string
  status: OrderStatus
  /** Bitcoin amount in satoshis. `0` means the amount is taken from a public price API. */
  amount: number
  /** Fiat amount. A single number, or `[min, max]` for a range order. */
  fiatAmount: number | [number, number]
  /** Accepted payment method(s). */
  paymentMethods: string[]
  /** Premium percentage the maker is willing to pay. */
  premium: number
  /** Network: `mainnet`, `testnet`, `signet`, etc. */
  network: string
  /** Layer: `onchain`, `lightning`, `liquid`, etc. */
  layer: string
  /** Platform identifier that created the order (`y` tag). */
  platform: string
  /** Date the pending order should transition to `expired`. */
  expiresAt?: number
  /** Date after which the relay should delete the event (NIP-40 `expiration`). */
  expiration?: number
  /** Order source or redirect link. */
  source?: string
  /** Maker's rating object; shape is platform-defined. */
  rating?: Record<string, unknown>
  /** Maker's display name. */
  name?: string
  /** Geohash for face-to-face trades. */
  geohash?: string
  /** Security deposit required, in satoshis. */
  bond?: number
}

/**
 * Create a kind 38383 P2P order event template (unsigned).
 */
export function createOrderEventTemplate(order: P2POrder): EventTemplate {
  const tags: string[][] = [
    ['d', order.id],
    ['k', order.type],
    ['f', order.fiatCurrency],
    ['s', order.status],
    ['amt', String(order.amount)],
    Array.isArray(order.fiatAmount)
      ? ['fa', String(order.fiatAmount[0]), String(order.fiatAmount[1])]
      : ['fa', String(order.fiatAmount)],
    ['pm', ...order.paymentMethods],
    ['premium', String(order.premium)],
    ['network', order.network],
    ['layer', order.layer],
    ['y', order.platform],
    ['z', 'order'],
  ]

  if (order.source !== undefined) tags.push(['source', order.source])
  if (order.rating !== undefined) tags.push(['rating', JSON.stringify(order.rating)])
  if (order.name !== undefined) tags.push(['name', order.name])
  if (order.geohash !== undefined) tags.push(['g', order.geohash])
  if (order.bond !== undefined) tags.push(['bond', String(order.bond)])
  if (order.expiresAt !== undefined) tags.push(['expires_at', String(order.expiresAt)])
  if (order.expiration !== undefined) tags.push(['expiration', String(order.expiration)])

  return {
    kind: ORDER_KIND,
    tags,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 38383 P2P order event.
 */
export function createOrderEvent(order: P2POrder, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createOrderEventTemplate(order), secretKey)
}

/**
 * Parse a kind 38383 P2P order event.
 */
export function parseOrder(event: NostrEvent): P2POrder {
  const result: P2POrder = {
    id: '',
    type: 'buy',
    fiatCurrency: '',
    status: 'pending',
    amount: 0,
    fiatAmount: 0,
    paymentMethods: [],
    premium: 0,
    network: '',
    layer: '',
    platform: '',
  }

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.id = tag[1] ?? ''
        break
      case 'k':
        result.type = tag[1] as OrderType
        break
      case 'f':
        result.fiatCurrency = tag[1] ?? ''
        break
      case 's':
        result.status = tag[1] as OrderStatus
        break
      case 'amt':
        result.amount = parseInt(tag[1], 10)
        break
      case 'fa':
        result.fiatAmount = tag[2] !== undefined
          ? [parseFloat(tag[1]), parseFloat(tag[2])]
          : parseFloat(tag[1])
        break
      case 'pm':
        result.paymentMethods = tag.slice(1)
        break
      case 'premium':
        result.premium = parseFloat(tag[1])
        break
      case 'network':
        result.network = tag[1] ?? ''
        break
      case 'layer':
        result.layer = tag[1] ?? ''
        break
      case 'y':
        result.platform = tag[1] ?? ''
        break
      case 'source':
        result.source = tag[1]
        break
      case 'rating':
        try {
          result.rating = JSON.parse(tag[1])
        } catch {
          // Ignore malformed rating payloads.
        }
        break
      case 'name':
        result.name = tag[1]
        break
      case 'g':
        result.geohash = tag[1]
        break
      case 'bond':
        result.bond = parseInt(tag[1], 10)
        break
      case 'expires_at':
        result.expiresAt = parseInt(tag[1], 10)
        break
      case 'expiration':
        result.expiration = parseInt(tag[1], 10)
        break
    }
  }

  return result
}
