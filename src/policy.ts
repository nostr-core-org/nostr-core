import type { NostrEvent } from './event.js'
import { verifyEventSignature } from './event.js'
import { matchFilters, type Filter } from './filter.js'
import { getPowDifficulty, getTargetDifficulty } from './nip13.js'

/**
 * Composable event checks.
 *
 * Each policy answers one question about one event. Apps combine them with
 * {@link pipe} instead of growing a bespoke `shouldAccept()` function:
 *
 * ```ts
 * const policy = pipe([
 *   noDuplicates(),
 *   blockKeywords(['spam']),
 *   requirePow(20),
 * ])
 *
 * const result = await policy.check(event)
 * ```
 *
 * Policies are useful anywhere untrusted events arrive: relays, bots,
 * client-side feed filtering, moderation pipelines.
 */

// ── Core types ─────────────────────────────────────────────────────────

export type PolicyResult = {
  accepted: boolean
  /** Which policy decided this. Set automatically by the built-ins. */
  policy?: string
  /** Machine-readable reason, in the NIP-01 `OK` style, e.g. `blocked: spam`. */
  reason?: string
}

export type Policy = {
  readonly name: string
  check(event: NostrEvent): PolicyResult | Promise<PolicyResult>
}

const ACCEPT: PolicyResult = { accepted: true }

function reject(policy: string, reason: string): PolicyResult {
  return { accepted: false, policy, reason }
}

// ── Combinators ────────────────────────────────────────────────────────

/**
 * Run policies in order and stop at the first rejection.
 *
 * Order matters: put the cheap checks first so an event is discarded before it
 * reaches an expensive one.
 */
export function pipe(policies: Policy[], name = 'pipe'): Policy {
  return {
    name,
    async check(event) {
      for (const policy of policies) {
        const result = await policy.check(event)
        if (!result.accepted) return result
      }
      return ACCEPT
    },
  }
}

/**
 * Accept when at least one of the policies accepts.
 */
export function anyOf(policies: Policy[], name = 'anyOf'): Policy {
  return {
    name,
    async check(event) {
      const reasons: string[] = []
      for (const policy of policies) {
        const result = await policy.check(event)
        if (result.accepted) return ACCEPT
        if (result.reason) reasons.push(result.reason)
      }
      return reject(name, `blocked: no policy accepted (${reasons.join('; ')})`)
    },
  }
}

/**
 * Invert a policy.
 */
export function not(policy: Policy, name = `not(${policy.name})`): Policy {
  return {
    name,
    async check(event) {
      const result = await policy.check(event)
      return result.accepted ? reject(name, `blocked: ${policy.name} accepted`) : ACCEPT
    },
  }
}

/**
 * Wrap an arbitrary predicate as a policy.
 */
export function customPolicy(
  name: string,
  predicate: (event: NostrEvent) => boolean | Promise<boolean>,
  reason = `blocked: rejected by ${name}`,
): Policy {
  return {
    name,
    async check(event) {
      return (await predicate(event)) ? ACCEPT : reject(name, reason)
    },
  }
}

// ── Built-in policies ──────────────────────────────────────────────────

/**
 * Reject events that have already been seen.
 *
 * Keeps an in-memory set of the most recent `max` event ids, evicting oldest
 * first. Per-instance: create one policy and reuse it, don't rebuild it per
 * event.
 */
export function noDuplicates(opts?: { max?: number }): Policy {
  const max = opts?.max ?? 10000
  const seen = new Set<string>()

  return {
    name: 'noDuplicates',
    check(event) {
      if (seen.has(event.id)) return reject('noDuplicates', 'duplicate: event already seen')
      seen.add(event.id)
      if (seen.size > max) {
        // Sets preserve insertion order, so the first key is the oldest.
        const oldest = seen.values().next().value
        if (oldest !== undefined) seen.delete(oldest)
      }
      return ACCEPT
    },
  }
}

/**
 * Require NIP-13 proof of work.
 *
 * By default the committed target in the `nonce` tag must also meet the
 * difficulty, so an event cannot get credit for accidental leading zeroes.
 */
export function requirePow(difficulty: number, opts?: { requireCommitment?: boolean }): Policy {
  const requireCommitment = opts?.requireCommitment ?? true

  return {
    name: 'requirePow',
    check(event) {
      const actual = getPowDifficulty(event)
      if (actual < difficulty) {
        return reject('requirePow', `pow: difficulty ${actual} is below the required ${difficulty}`)
      }
      if (requireCommitment && getTargetDifficulty(event) < difficulty) {
        return reject('requirePow', `pow: nonce tag does not commit to difficulty ${difficulty}`)
      }
      return ACCEPT
    },
  }
}

/**
 * Reject events whose content matches any of the given keywords or patterns.
 *
 * Plain strings are matched case-insensitively as substrings unless
 * `caseSensitive` is set; regular expressions are used as given.
 */
export function blockKeywords(
  keywords: (string | RegExp)[],
  opts?: { caseSensitive?: boolean; includeTags?: boolean },
): Policy {
  const caseSensitive = opts?.caseSensitive ?? false
  const includeTags = opts?.includeTags ?? false
  const plain = keywords.filter((k): k is string => typeof k === 'string')
  const needles = caseSensitive ? plain : plain.map(k => k.toLowerCase())
  const patterns = keywords.filter((k): k is RegExp => k instanceof RegExp)

  return {
    name: 'blockKeywords',
    check(event) {
      const haystackRaw = includeTags
        ? `${event.content} ${event.tags.flat().join(' ')}`
        : event.content
      const haystack = caseSensitive ? haystackRaw : haystackRaw.toLowerCase()

      for (const needle of needles) {
        if (needle && haystack.includes(needle)) {
          return reject('blockKeywords', `blocked: content matched "${needle}"`)
        }
      }
      for (const pattern of patterns) {
        // Reset lastIndex so a /g pattern behaves the same on every event.
        pattern.lastIndex = 0
        if (pattern.test(haystackRaw)) {
          return reject('blockKeywords', `blocked: content matched ${pattern}`)
        }
      }
      return ACCEPT
    },
  }
}

/**
 * Accept only events matching at least one of the filters.
 */
export function filterPolicy(filters: Filter[]): Policy {
  return {
    name: 'filterPolicy',
    check(event) {
      return matchFilters(filters, event)
        ? ACCEPT
        : reject('filterPolicy', 'blocked: event does not match any allowed filter')
    },
  }
}

/**
 * Reject events matching any of the filters.
 */
export function rejectFilterPolicy(filters: Filter[]): Policy {
  return {
    name: 'rejectFilterPolicy',
    check(event) {
      return matchFilters(filters, event)
        ? reject('rejectFilterPolicy', 'blocked: event matches a blocked filter')
        : ACCEPT
    },
  }
}

/**
 * Accept only the listed kinds.
 */
export function kindAllowList(kinds: number[]): Policy {
  const allowed = new Set(kinds)
  return {
    name: 'kindAllowList',
    check(event) {
      return allowed.has(event.kind)
        ? ACCEPT
        : reject('kindAllowList', `blocked: kind ${event.kind} is not allowed`)
    },
  }
}

/**
 * Reject the listed kinds.
 */
export function kindDenyList(kinds: number[]): Policy {
  const denied = new Set(kinds)
  return {
    name: 'kindDenyList',
    check(event) {
      return denied.has(event.kind)
        ? reject('kindDenyList', `blocked: kind ${event.kind} is denied`)
        : ACCEPT
    },
  }
}

/**
 * Accept only events from the listed authors.
 */
export function pubkeyAllowList(pubkeys: string[]): Policy {
  const allowed = new Set(pubkeys)
  return {
    name: 'pubkeyAllowList',
    check(event) {
      return allowed.has(event.pubkey)
        ? ACCEPT
        : reject('pubkeyAllowList', 'blocked: author is not on the allow list')
    },
  }
}

/**
 * Reject events from the listed authors.
 */
export function pubkeyDenyList(pubkeys: string[]): Policy {
  const denied = new Set(pubkeys)
  return {
    name: 'pubkeyDenyList',
    check(event) {
      return denied.has(event.pubkey)
        ? reject('pubkeyDenyList', 'blocked: author is on the deny list')
        : ACCEPT
    },
  }
}

/**
 * Bound the size of an event.
 */
export function sizeLimit(opts: {
  maxContentLength?: number
  maxTags?: number
  maxTagLength?: number
}): Policy {
  return {
    name: 'sizeLimit',
    check(event) {
      if (opts.maxContentLength !== undefined && event.content.length > opts.maxContentLength) {
        return reject('sizeLimit', `invalid: content exceeds ${opts.maxContentLength} characters`)
      }
      if (opts.maxTags !== undefined && event.tags.length > opts.maxTags) {
        return reject('sizeLimit', `invalid: more than ${opts.maxTags} tags`)
      }
      if (opts.maxTagLength !== undefined) {
        for (const tag of event.tags) {
          if (tag.length > opts.maxTagLength) {
            return reject('sizeLimit', `invalid: a tag has more than ${opts.maxTagLength} elements`)
          }
        }
      }
      return ACCEPT
    },
  }
}

/**
 * Per-author rate limit over a sliding window.
 */
export function rateLimit(opts: { max: number; windowMs: number; key?: (event: NostrEvent) => string }): Policy {
  const keyOf = opts.key ?? ((event: NostrEvent) => event.pubkey)
  const hits = new Map<string, number[]>()

  return {
    name: 'rateLimit',
    check(event) {
      const now = Date.now()
      const cutoff = now - opts.windowMs
      const key = keyOf(event)

      const recent = (hits.get(key) ?? []).filter(t => t > cutoff)
      if (recent.length >= opts.max) {
        hits.set(key, recent)
        return reject('rateLimit', `rate-limited: more than ${opts.max} events per ${opts.windowMs}ms`)
      }

      recent.push(now)
      hits.set(key, recent)

      // Opportunistic cleanup so idle keys don't accumulate forever.
      if (hits.size > 1000) {
        for (const [k, times] of hits) {
          if (times.every(t => t <= cutoff)) hits.delete(k)
        }
      }

      return ACCEPT
    },
  }
}

/**
 * Reject events whose id or signature does not verify.
 *
 * Always verifies from scratch, ignoring any cached `verifiedSymbol` on the
 * input - a policy exists to judge untrusted events, so it must not take the
 * event's word for it.
 */
export function requireValidSignature(): Policy {
  return {
    name: 'requireValidSignature',
    check(event) {
      return verifyEventSignature(event)
        ? ACCEPT
        : reject('requireValidSignature', 'invalid: event id or signature is invalid')
    },
  }
}

/**
 * Reject events whose `created_at` is too far from now.
 *
 * Both bounds are in seconds; omit one to leave that side unbounded.
 */
export function createdAtPolicy(opts: { maxPastSeconds?: number; maxFutureSeconds?: number }): Policy {
  return {
    name: 'createdAtPolicy',
    check(event) {
      const now = Math.floor(Date.now() / 1000)
      if (opts.maxFutureSeconds !== undefined && event.created_at > now + opts.maxFutureSeconds) {
        return reject('createdAtPolicy', 'invalid: created_at is too far in the future')
      }
      if (opts.maxPastSeconds !== undefined && event.created_at < now - opts.maxPastSeconds) {
        return reject('createdAtPolicy', 'invalid: created_at is too far in the past')
      }
      return ACCEPT
    },
  }
}

/**
 * Reject events past their NIP-40 `expiration`.
 */
export function notExpired(): Policy {
  return {
    name: 'notExpired',
    check(event) {
      const expiration = event.tags.find(t => t[0] === 'expiration')?.[1]
      if (!expiration) return ACCEPT
      const at = parseInt(expiration, 10)
      if (!Number.isFinite(at)) return ACCEPT
      return at <= Math.floor(Date.now() / 1000)
        ? reject('notExpired', 'invalid: event has expired')
        : ACCEPT
    },
  }
}
