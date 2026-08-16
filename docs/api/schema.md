# Schema

Runtime validation for untrusted Nostr data. TypeScript types say nothing about what a relay, a client, or an external API actually sent you - these validators check the shape at the edges so malformed input is rejected early instead of surfacing as an odd bug three layers in.

## Import

The validators live behind a namespace, or their own subpath, so generic names like `filter` and `optional` stay out of your flat import scope.

```ts
import { schema } from 'nostr-core'
// or, as a subpath
import * as schema from 'nostr-core/schema'
// the error class is also exported at the top level
import { SchemaError } from 'nostr-core'
```

## The Validator Interface

Every validator exposes the same three methods:

```ts
type Validator<T> = {
  readonly name: string
  is(value: unknown): value is T          // type guard, for `if` checks
  safeParse(value: unknown): ValidationResult<T>   // result object, for reporting why
  parse(value: unknown): T                // returns the value or throws SchemaError
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] }

type ValidationIssue = {
  path: string    // dotted path to the offending field, '' for the root
  message: string
}
```

```ts
if (schema.nostrEvent.is(incoming)) {
  // incoming is narrowed to NostrEvent here
}

const result = schema.nostrEvent.safeParse(incoming)
if (!result.ok) {
  console.warn(result.issues)
  // [{ path: 'id', message: 'expected 64 lowercase hex characters' }, ...]
}

const event = schema.nostrEvent.parse(incoming)   // throws SchemaError
```

### SchemaError

```ts
class SchemaError extends Error {
  issues: ValidationIssue[]
}
```

## Event Validators

### nostrEvent

```ts
schema.nostrEvent: Validator<NostrEvent>
```

Structural validation: every field present and correctly typed. Does **not** check the id hash or the signature.

### verifiedNostrEvent

```ts
schema.verifiedNostrEvent: Validator<NostrEvent>
```

Structural validation **plus** id and schnorr signature verification. Use this on anything you did not sign yourself.

```ts
if (!schema.verifiedNostrEvent.is(fromRelay)) return   // drop it
```

::: tip
Verification always runs from scratch. The library caches a verification result on an internal symbol, and object spread copies own symbols - so a tampered `{ ...signed, content: 'changed' }` would inherit the original's "already verified" flag. This validator ignores that cache deliberately. See [`verifyEventSignature`](/api/event#verifyeventsignature).
:::

### eventTemplate

```ts
schema.eventTemplate: Validator<{ kind: number; tags: string[][]; content: string; created_at: number }>
```

An unsigned template, e.g. one handed to you by a caller before signing.

## Filter Validator

```ts
schema.filter: Validator<Filter>
```

Validates `ids`, `authors`, `kinds`, `since`, `until`, `limit`, `search`, and `#<tag>` filters. Unknown keys are rejected, which catches typos like `kind` for `kinds`.

```ts
schema.filter.is({ kinds: [1], authors: [pubkey], '#e': [id], limit: 20 })  // true
schema.filter.is({ kinds: ['1'] })    // false - kinds must be numbers
schema.filter.is({ bogus: 1 })        // false - unknown key
schema.filter.is({ '#': ['a'] })      // false - a bare # is not a tag filter
```

## Wire Message Validators

### relayMessage

```ts
schema.relayMessage: Validator<RelayMessage>
```

Validates `EVENT`, `OK`, `EOSE`, `CLOSED`, `NOTICE`, `AUTH` and `COUNT` frames.

### clientMessage

```ts
schema.clientMessage: Validator<ClientMessage>
```

Validates `EVENT`, `REQ`, `CLOSE`, `AUTH` and `COUNT` frames. A `REQ` with no filters is rejected.

```ts
socket.onmessage = (ev) => {
  const frame = schema.json(schema.relayMessage).safeParse(ev.data)
  if (!frame.ok) return   // ignore garbage rather than throwing in the handler
  handle(frame.value)
}
```

## Primitive Validators

| Validator | Accepts |
|-----------|---------|
| `schema.hex32` | 64 lowercase hex characters |
| `schema.pubkey` | A public key |
| `schema.eventId` | An event id |
| `schema.signature` | 128 lowercase hex characters |
| `schema.relayUrl` | A `ws://` or `wss://` URL |
| `schema.nip05Address` | `name@domain`, or bare `domain` (meaning `_@domain`) |
| `schema.tags` | An array of non-empty string arrays |

```ts
schema.relayUrl.is('wss://relay.example')     // true
schema.relayUrl.is('https://relay.example')   // false
schema.nip05Address.is('alice@example.com')   // true
schema.nip05Address.is('example.com')         // true
```

## Combinators

### json

```ts
function json<T>(inner: Validator<T>): Validator<T>
```

JSON-parses a string, then validates the result. Never throws on malformed JSON - it reports an issue.

```ts
schema.json(schema.nostrEvent).is('{"kind":1,...}')
```

### arrayOf

```ts
function arrayOf<T>(inner: Validator<T>): Validator<T[]>
```

```ts
schema.arrayOf(schema.pubkey).is([pk1, pk2])
```

### optional

```ts
function optional<T>(inner: Validator<T>): Validator<T | undefined>
```

### defineValidator

Build your own, in the same shape as the built-ins:

```ts
function defineValidator<T>(
  name: string,
  check: (value: unknown, issue: (message: string, path?: string) => void) => void,
): Validator<T>
```

```ts
const zapRequest = schema.defineValidator<NostrEvent>('zap request', (value, issue) => {
  const result = schema.verifiedNostrEvent.safeParse(value)
  if (!result.ok) {
    for (const i of result.issues) issue(i.message, i.path)
    return
  }
  const event = value as NostrEvent
  if (event.kind !== 9734) issue(`expected kind 9734, got ${event.kind}`, 'kind')
  if (!event.tags.some(t => t[0] === 'relays')) issue('missing relays tag', 'tags')
})
```

An empty `issues` list means the value is valid.

## Example: hardening a relay handler

```ts
import { schema } from 'nostr-core'

const frame = schema.json(schema.clientMessage)

function onClientFrame(raw: string) {
  const parsed = frame.safeParse(raw)
  if (!parsed.ok) {
    return send(['NOTICE', `invalid: ${parsed.issues[0].message}`])
  }

  const message = parsed.value
  if (message[0] === 'EVENT') {
    if (!schema.verifiedNostrEvent.is(message[1])) {
      return send(['OK', message[1].id, false, 'invalid: bad signature'])
    }
    return accept(message[1])
  }
}
```

## See Also

- [Policy](/api/policy) - composable checks for events that are already well-formed
- [Event](/api/event) - `verifyEventSignature`, the uncached verifier these use
