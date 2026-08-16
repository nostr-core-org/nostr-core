import { type NostrEvent, validateEvent, verifyEventSignature } from './event.js'
import type { Filter } from './filter.js'

/**
 * Runtime validation for untrusted Nostr data.
 *
 * TypeScript types say nothing about what a relay, a client, or an external API
 * actually sent you. These validators check the shape at the edges so malformed
 * input is rejected early instead of surfacing as an odd bug three layers in.
 *
 * Every validator exposes the same three methods:
 *
 * - `is(value)` - a type guard, for `if` checks
 * - `safeParse(value)` - a result object, for reporting why something failed
 * - `parse(value)` - returns the value or throws {@link SchemaError}
 */

// ── Result types ───────────────────────────────────────────────────────

export type ValidationIssue = {
  /** Dotted path to the offending field, `''` for the root value. */
  path: string
  message: string
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] }

export class SchemaError extends Error {
  issues: ValidationIssue[]
  constructor(name: string, issues: ValidationIssue[]) {
    const detail = issues.map(i => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ')
    super(`Invalid ${name}: ${detail}`)
    this.name = 'SchemaError'
    this.issues = issues
  }
}

export type Validator<T> = {
  readonly name: string
  is(value: unknown): value is T
  safeParse(value: unknown): ValidationResult<T>
  parse(value: unknown): T
}

// ── Validator factory ──────────────────────────────────────────────────

/**
 * Build a validator from a function that reports issues.
 *
 * The check pushes onto `issues` and returns nothing; an empty `issues` array
 * means the value is valid.
 */
export function defineValidator<T>(
  name: string,
  check: (value: unknown, issue: (message: string, path?: string) => void) => void,
): Validator<T> {
  const safeParse = (value: unknown): ValidationResult<T> => {
    const issues: ValidationIssue[] = []
    check(value, (message, path = '') => issues.push({ path, message }))
    return issues.length === 0 ? { ok: true, value: value as T } : { ok: false, issues }
  }

  return {
    name,
    safeParse,
    is: (value: unknown): value is T => safeParse(value).ok,
    parse: (value: unknown): T => {
      const result = safeParse(value)
      if (!result.ok) throw new SchemaError(name, result.issues)
      return result.value
    },
  }
}

// ── Primitives ─────────────────────────────────────────────────────────

const HEX_64 = /^[0-9a-f]{64}$/
const HEX_128 = /^[0-9a-f]{128}$/

/** A 32-byte lowercase hex string: a pubkey or an event id. */
export const hex32 = defineValidator<string>('hex32', (value, issue) => {
  if (typeof value !== 'string') return issue(`expected a string, got ${typeName(value)}`)
  if (!HEX_64.test(value)) issue('expected 64 lowercase hex characters')
})

/** A public key. */
export const pubkey = defineValidator<string>('pubkey', (value, issue) => {
  if (typeof value !== 'string') return issue(`expected a string, got ${typeName(value)}`)
  if (!HEX_64.test(value)) issue('expected 64 lowercase hex characters')
})

/** An event id. */
export const eventId = defineValidator<string>('event id', (value, issue) => {
  if (typeof value !== 'string') return issue(`expected a string, got ${typeName(value)}`)
  if (!HEX_64.test(value)) issue('expected 64 lowercase hex characters')
})

/** A 64-byte schnorr signature. */
export const signature = defineValidator<string>('signature', (value, issue) => {
  if (typeof value !== 'string') return issue(`expected a string, got ${typeName(value)}`)
  if (!HEX_128.test(value)) issue('expected 128 lowercase hex characters')
})

/** A `ws://` or `wss://` relay URL. */
export const relayUrl = defineValidator<string>('relay URL', (value, issue) => {
  if (typeof value !== 'string') return issue(`expected a string, got ${typeName(value)}`)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return issue(`not a URL: ${value}`)
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    issue(`expected a ws:// or wss:// URL, got "${parsed.protocol}"`)
  }
})

/** A NIP-05 identifier, `name@domain` or bare `domain` (which means `_@domain`). */
export const nip05Address = defineValidator<string>('NIP-05 address', (value, issue) => {
  if (typeof value !== 'string') return issue(`expected a string, got ${typeName(value)}`)
  const parts = value.split('@')
  const [name, domain] = parts.length === 1 ? ['_', parts[0]] : parts
  if (parts.length > 2) return issue('expected at most one "@"')
  if (!/^[a-z0-9\-_.]+$/i.test(name)) issue('local part may only contain a-z0-9-_.')
  if (!domain || !domain.includes('.')) issue('missing or malformed domain')
})

/** An array of string arrays, each with at least one element. */
export const tags = defineValidator<string[][]>('tags', (value, issue) => {
  if (!Array.isArray(value)) return issue(`expected an array, got ${typeName(value)}`)
  value.forEach((tag, i) => {
    if (!Array.isArray(tag)) return issue(`expected an array, got ${typeName(tag)}`, `[${i}]`)
    if (tag.length === 0) return issue('tag is empty', `[${i}]`)
    tag.forEach((item, j) => {
      if (typeof item !== 'string') {
        issue(`expected a string, got ${typeName(item)}`, `[${i}][${j}]`)
      }
    })
  })
})

// ── Events ─────────────────────────────────────────────────────────────

/**
 * A structurally valid Nostr event: every field present and correctly typed.
 * Does NOT check the id or the signature - use {@link verifiedEvent} for that.
 */
export const nostrEvent = defineValidator<NostrEvent>('event', (value, issue) => {
  if (typeof value !== 'object' || value === null) {
    return issue(`expected an object, got ${typeName(value)}`)
  }
  const event = value as Record<string, unknown>

  if (typeof event.id !== 'string' || !HEX_64.test(event.id)) {
    issue('expected 64 lowercase hex characters', 'id')
  }
  if (typeof event.pubkey !== 'string' || !HEX_64.test(event.pubkey)) {
    issue('expected 64 lowercase hex characters', 'pubkey')
  }
  if (typeof event.sig !== 'string' || !HEX_128.test(event.sig)) {
    issue('expected 128 lowercase hex characters', 'sig')
  }
  if (typeof event.kind !== 'number' || !Number.isInteger(event.kind) || event.kind < 0) {
    issue('expected a non-negative integer', 'kind')
  }
  if (typeof event.created_at !== 'number' || !Number.isInteger(event.created_at)) {
    issue('expected an integer unix timestamp', 'created_at')
  }
  if (typeof event.content !== 'string') {
    issue(`expected a string, got ${typeName(event.content)}`, 'content')
  }

  const tagResult = tags.safeParse(event.tags)
  if (!tagResult.ok) {
    for (const t of tagResult.issues) issue(t.message, `tags${t.path}`)
  }
})

/**
 * A Nostr event whose id hashes correctly and whose signature verifies.
 *
 * This runs schnorr verification, so it is meaningfully more expensive than
 * {@link nostrEvent}. Use it on anything you did not sign yourself. Verification
 * is always done from scratch - a cached `verifiedSymbol` on the input is
 * deliberately ignored.
 */
export const verifiedNostrEvent = defineValidator<NostrEvent>('verified event', (value, issue) => {
  const structural = nostrEvent.safeParse(value)
  if (!structural.ok) {
    for (const i of structural.issues) issue(i.message, i.path)
    return
  }
  if (!validateEvent(value)) return issue('event failed structural validation')
  if (!verifyEventSignature(value as NostrEvent)) issue('event id or signature is invalid')
})

/** An unsigned event template: `kind`, `tags`, `content`, `created_at`. */
export const eventTemplate = defineValidator<{
  kind: number
  tags: string[][]
  content: string
  created_at: number
}>('event template', (value, issue) => {
  if (typeof value !== 'object' || value === null) {
    return issue(`expected an object, got ${typeName(value)}`)
  }
  const template = value as Record<string, unknown>

  if (typeof template.kind !== 'number' || !Number.isInteger(template.kind) || template.kind < 0) {
    issue('expected a non-negative integer', 'kind')
  }
  if (typeof template.created_at !== 'number' || !Number.isInteger(template.created_at)) {
    issue('expected an integer unix timestamp', 'created_at')
  }
  if (typeof template.content !== 'string') {
    issue(`expected a string, got ${typeName(template.content)}`, 'content')
  }

  const tagResult = tags.safeParse(template.tags)
  if (!tagResult.ok) {
    for (const t of tagResult.issues) issue(t.message, `tags${t.path}`)
  }
})

// ── Filters ────────────────────────────────────────────────────────────

const FILTER_SCALAR_KEYS = new Set(['since', 'until', 'limit'])
const FILTER_HEX_ARRAY_KEYS = new Set(['ids', 'authors'])

/** A REQ filter. */
export const filter = defineValidator<Filter>('filter', (value, issue) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return issue(`expected an object, got ${typeName(value)}`)
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined) continue

    if (FILTER_HEX_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(item)) {
        issue(`expected an array, got ${typeName(item)}`, key)
        continue
      }
      item.forEach((entry, i) => {
        if (typeof entry !== 'string' || !HEX_64.test(entry)) {
          issue('expected 64 lowercase hex characters', `${key}[${i}]`)
        }
      })
    } else if (key === 'kinds') {
      if (!Array.isArray(item)) {
        issue(`expected an array, got ${typeName(item)}`, key)
        continue
      }
      item.forEach((entry, i) => {
        if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0) {
          issue('expected a non-negative integer', `${key}[${i}]`)
        }
      })
    } else if (FILTER_SCALAR_KEYS.has(key)) {
      if (typeof item !== 'number' || !Number.isInteger(item) || item < 0) {
        issue('expected a non-negative integer', key)
      }
    } else if (key === 'search') {
      if (typeof item !== 'string') issue(`expected a string, got ${typeName(item)}`, key)
    } else if (key.startsWith('#')) {
      if (key.length < 2) {
        issue('tag filter needs a tag name after "#"', key)
        continue
      }
      if (!Array.isArray(item)) {
        issue(`expected an array, got ${typeName(item)}`, key)
        continue
      }
      item.forEach((entry, i) => {
        if (typeof entry !== 'string') {
          issue(`expected a string, got ${typeName(entry)}`, `${key}[${i}]`)
        }
      })
    } else {
      issue(`unknown filter key "${key}"`, key)
    }
  }
})

// ── Wire messages ──────────────────────────────────────────────────────

export type RelayMessage =
  | ['EVENT', string, NostrEvent]
  | ['OK', string, boolean, string]
  | ['EOSE', string]
  | ['CLOSED', string, string]
  | ['NOTICE', string]
  | ['AUTH', string]
  | ['COUNT', string, { count: number }]

export type ClientMessage =
  | ['EVENT', NostrEvent]
  | ['REQ', string, ...Filter[]]
  | ['CLOSE', string]
  | ['AUTH', NostrEvent]
  | ['COUNT', string, ...Filter[]]

/** A message sent by a relay to a client (NIP-01 / NIP-42 / NIP-45). */
export const relayMessage = defineValidator<RelayMessage>('relay message', (value, issue) => {
  if (!Array.isArray(value) || value.length === 0) {
    return issue(`expected a non-empty array, got ${typeName(value)}`)
  }

  const [type, ...rest] = value as unknown[]
  if (typeof type !== 'string') return issue('expected a string message type', '[0]')

  const requireSubId = (index = 0) => {
    if (typeof rest[index] !== 'string') issue('expected a subscription id', `[${index + 1}]`)
  }

  switch (type) {
    case 'EVENT': {
      requireSubId()
      const result = nostrEvent.safeParse(rest[1])
      if (!result.ok) for (const i of result.issues) issue(i.message, `[2]${i.path && '.' + i.path}`)
      return
    }
    case 'OK':
      if (typeof rest[0] !== 'string') issue('expected an event id', '[1]')
      if (typeof rest[1] !== 'boolean') issue('expected a boolean', '[2]')
      if (rest.length > 2 && typeof rest[2] !== 'string') issue('expected a string', '[3]')
      return
    case 'EOSE':
    case 'NOTICE':
    case 'AUTH':
      requireSubId()
      return
    case 'CLOSED':
      requireSubId()
      if (typeof rest[1] !== 'string') issue('expected a reason string', '[2]')
      return
    case 'COUNT':
      requireSubId()
      if (typeof rest[1] !== 'object' || rest[1] === null || typeof (rest[1] as Record<string, unknown>).count !== 'number') {
        issue('expected a { count } object', '[2]')
      }
      return
    default:
      issue(`unknown relay message type "${type}"`, '[0]')
  }
})

/** A message sent by a client to a relay (NIP-01 / NIP-42 / NIP-45). */
export const clientMessage = defineValidator<ClientMessage>('client message', (value, issue) => {
  if (!Array.isArray(value) || value.length === 0) {
    return issue(`expected a non-empty array, got ${typeName(value)}`)
  }

  const [type, ...rest] = value as unknown[]
  if (typeof type !== 'string') return issue('expected a string message type', '[0]')

  const checkFilters = (offset: number) => {
    if (rest.length <= offset) return issue('expected at least one filter', `[${offset + 1}]`)
    for (let i = offset; i < rest.length; i++) {
      const result = filter.safeParse(rest[i])
      if (!result.ok) {
        for (const f of result.issues) issue(f.message, `[${i + 1}].${f.path}`)
      }
    }
  }

  switch (type) {
    case 'EVENT':
    case 'AUTH': {
      const result = nostrEvent.safeParse(rest[0])
      if (!result.ok) for (const i of result.issues) issue(i.message, `[1]${i.path && '.' + i.path}`)
      return
    }
    case 'REQ':
    case 'COUNT':
      if (typeof rest[0] !== 'string') issue('expected a subscription id', '[1]')
      checkFilters(1)
      return
    case 'CLOSE':
      if (typeof rest[0] !== 'string') issue('expected a subscription id', '[1]')
      return
    default:
      issue(`unknown client message type "${type}"`, '[0]')
  }
})

// ── Combinators ────────────────────────────────────────────────────────

/**
 * Wrap a validator so it first JSON-parses a string.
 *
 * Handy for relay frames and for NIP event content that carries JSON.
 */
export function json<T>(inner: Validator<T>): Validator<T> {
  return defineValidator<T>(`JSON ${inner.name}`, (value, issue) => {
    if (typeof value !== 'string') return issue(`expected a JSON string, got ${typeName(value)}`)
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch (err) {
      return issue(`not valid JSON: ${(err as Error).message}`)
    }
    const result = inner.safeParse(parsed)
    if (!result.ok) for (const i of result.issues) issue(i.message, i.path)
  })
}

/**
 * A validator for an array whose every item satisfies `inner`.
 */
export function arrayOf<T>(inner: Validator<T>): Validator<T[]> {
  return defineValidator<T[]>(`${inner.name}[]`, (value, issue) => {
    if (!Array.isArray(value)) return issue(`expected an array, got ${typeName(value)}`)
    value.forEach((item, i) => {
      const result = inner.safeParse(item)
      if (!result.ok) {
        for (const inner of result.issues) issue(inner.message, `[${i}]${inner.path && '.' + inner.path}`)
      }
    })
  })
}

/**
 * A validator that accepts `undefined` in addition to `inner`'s values.
 */
export function optional<T>(inner: Validator<T>): Validator<T | undefined> {
  return defineValidator<T | undefined>(`${inner.name}?`, (value, issue) => {
    if (value === undefined) return
    const result = inner.safeParse(value)
    if (!result.ok) for (const i of result.issues) issue(i.message, i.path)
  })
}

// ── Helpers ────────────────────────────────────────────────────────────

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
