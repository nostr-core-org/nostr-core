# Policy

Composable event checks. Each policy answers one question about one event; apps combine them with `pipe` instead of growing a bespoke `shouldAccept()` function. Useful anywhere untrusted events arrive - relays, bots, client-side feed filtering, moderation pipelines.

## Import

Namespaced, or on its own subpath, so generic names like `pipe` and `not` stay out of your flat import scope.

```ts
import { policy } from 'nostr-core'
// or, as a subpath
import * as policy from 'nostr-core/policy'
```

## The Policy Interface

```ts
type Policy = {
  readonly name: string
  check(event: NostrEvent): PolicyResult | Promise<PolicyResult>
}

type PolicyResult = {
  accepted: boolean
  policy?: string    // which policy decided
  reason?: string    // NIP-01 OK-style, e.g. 'blocked: spam'
}
```

```ts
const p = policy.pipe([
  policy.noDuplicates(),
  policy.blockKeywords(['spam']),
  policy.requirePow(20),
])

const result = await p.check(event)
if (!result.accepted) {
  console.log(result.policy, result.reason)
  // 'noDuplicates'  'duplicate: event already seen'
}
```

::: tip
Several policies keep state (`noDuplicates`, `rateLimit`). Build them **once** and reuse the instance - rebuilding per event throws the state away.
:::

## Combinators

### pipe

```ts
function pipe(policies: Policy[], name?: string): Policy
```

Runs policies in order and stops at the first rejection, returning that policy's result. Order matters - put cheap checks first so an event is discarded before it reaches an expensive one.

### anyOf

```ts
function anyOf(policies: Policy[], name?: string): Policy
```

Accepts when at least one policy accepts.

### not

```ts
function not(policy: Policy, name?: string): Policy
```

### customPolicy

```ts
function customPolicy(
  name: string,
  predicate: (event: NostrEvent) => boolean | Promise<boolean>,
  reason?: string,
): Policy
```

```ts
const followsOnly = policy.customPolicy(
  'followsOnly',
  event => followSet.has(event.pubkey),
  'blocked: not in your follow list',
)
```

The predicate may be async, so a policy can hit a database or a remote list.

## Built-in Policies

### noDuplicates

```ts
function noDuplicates(opts?: { max?: number }): Policy
```

Rejects events already seen. Keeps an in-memory set of the most recent `max` ids (default 10000), evicting oldest first.

### requirePow

```ts
function requirePow(difficulty: number, opts?: { requireCommitment?: boolean }): Policy
```

Requires NIP-13 proof of work. By default the `nonce` tag must also commit to the target, so an event cannot get credit for accidental leading zeroes. Pass `{ requireCommitment: false }` to check the hash alone.

### blockKeywords

```ts
function blockKeywords(
  keywords: (string | RegExp)[],
  opts?: { caseSensitive?: boolean; includeTags?: boolean },
): Policy
```

Plain strings match case-insensitively as substrings unless `caseSensitive` is set; regular expressions are used as given. `includeTags` extends the search to tag values.

```ts
policy.blockKeywords(['spam', /\bfree\s+bitcoin\b/i])
```

### filterPolicy / rejectFilterPolicy

```ts
function filterPolicy(filters: Filter[]): Policy
function rejectFilterPolicy(filters: Filter[]): Policy
```

Accept only events matching at least one filter, or reject events matching any. Reuses the same matcher the relay client uses.

### kindAllowList / kindDenyList

```ts
function kindAllowList(kinds: number[]): Policy
function kindDenyList(kinds: number[]): Policy
```

### pubkeyAllowList / pubkeyDenyList

```ts
function pubkeyAllowList(pubkeys: string[]): Policy
function pubkeyDenyList(pubkeys: string[]): Policy
```

### sizeLimit

```ts
function sizeLimit(opts: {
  maxContentLength?: number
  maxTags?: number
  maxTagLength?: number
}): Policy
```

### rateLimit

```ts
function rateLimit(opts: {
  max: number
  windowMs: number
  key?: (event: NostrEvent) => string
}): Policy
```

Per-author by default; pass `key` to bucket by something else (an IP, a connection id).

```ts
policy.rateLimit({ max: 10, windowMs: 60_000 })
```

### requireValidSignature

```ts
function requireValidSignature(): Policy
```

Rejects events whose id or signature does not verify. Always verifies from scratch, ignoring any cached verification flag on the event - a policy exists to judge untrusted events, so it must not take the event's word for it.

### createdAtPolicy

```ts
function createdAtPolicy(opts: {
  maxPastSeconds?: number
  maxFutureSeconds?: number
}): Policy
```

Rejects timestamps too far from now. Omit a bound to leave that side unbounded.

### notExpired

```ts
function notExpired(): Policy
```

Rejects events past their NIP-40 `expiration` tag.

## Example: a relay ingress pipeline

```ts
import { policy } from 'nostr-core'

// Built once, at startup.
const ingress = policy.pipe([
  policy.requireValidSignature(),
  policy.createdAtPolicy({ maxFutureSeconds: 900, maxPastSeconds: 60 * 60 * 24 * 365 }),
  policy.notExpired(),
  policy.sizeLimit({ maxContentLength: 64_000, maxTags: 2000 }),
  policy.noDuplicates(),
  policy.kindDenyList([4]),                    // legacy DMs not accepted here
  policy.rateLimit({ max: 20, windowMs: 60_000 }),
  policy.blockKeywords(['spam', /free\s+bitcoin/i]),
])

async function onEvent(event) {
  const result = await ingress.check(event)
  if (!result.accepted) {
    return send(['OK', event.id, false, result.reason])
  }
  await store(event)
  send(['OK', event.id, true, ''])
}
```

## Example: a client-side feed filter

```ts
const feed = policy.pipe([
  policy.notExpired(),
  policy.anyOf([
    policy.pubkeyAllowList(followList),   // always show people I follow
    policy.requirePow(16),                // otherwise make them pay for attention
  ]),
  policy.blockKeywords(mutedWords),
])

pool.subscribe(relays, { kinds: [1] }, {
  onevent: async (event) => {
    if ((await feed.check(event)).accepted) render(event)
  },
})
```

## See Also

- [Schema](/api/schema) - validating shape before judging content
- [NIP-13](/api/nip13) - proof of work
- [Filter](/api/filter) - the matcher behind `filterPolicy`
