# Event

Functions for creating, signing, and verifying Nostr events.

## Import

```ts
import {
  finalizeEvent,
  verifyEvent,
  verifyEventSignature,
  getEventHash,
  serializeEvent,
  validateEvent,
  verifiedSymbol,
} from 'nostr-core'
```

## Types

### NostrEvent

```ts
type NostrEvent = {
  kind: number
  tags: string[][]
  content: string
  created_at: number
  pubkey: string
  id: string
  sig: string
  [verifiedSymbol]?: boolean
}
```

### EventTemplate

```ts
type EventTemplate = Pick<NostrEvent, 'kind' | 'tags' | 'content' | 'created_at'>
```

The minimum fields needed to create an event (before signing).

### UnsignedEvent

```ts
type UnsignedEvent = Pick<NostrEvent, 'kind' | 'tags' | 'content' | 'created_at' | 'pubkey'>
```

An event with a pubkey but no `id` or `sig`.

### VerifiedEvent

```ts
interface VerifiedEvent extends NostrEvent {
  [verifiedSymbol]: true
}
```

An event whose signature has been verified.

## finalizeEvent

```ts
function finalizeEvent(template: EventTemplate, secretKey: Uint8Array): VerifiedEvent
```

Signs an event template, adding `pubkey`, `id`, and `sig` fields.

| Parameter | Type | Description |
|-----------|------|-------------|
| `template` | `EventTemplate` | Event with `kind`, `tags`, `content`, `created_at` |
| `secretKey` | `Uint8Array` | 32-byte secret key |

**Returns:** `VerifiedEvent` - the fully signed event.

```ts
import { finalizeEvent, generateSecretKey } from 'nostr-core'

const sk = generateSecretKey()
const event = finalizeEvent({
  kind: 1,
  tags: [],
  content: 'Hello world',
  created_at: Math.floor(Date.now() / 1000),
}, sk)

console.log(event.id)  // 64-char hex
console.log(event.sig) // 128-char hex
```

## verifyEvent

```ts
function verifyEvent(event: NostrEvent): event is VerifiedEvent
```

Verifies an event's hash and schnorr signature. Acts as a TypeScript type guard.

The result is **cached** on the event under `verifiedSymbol`, so repeated checks
of the same object are free.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | Event to verify |

**Returns:** `boolean` - `true` if valid, narrowing the type to `VerifiedEvent`.

## verifyEventSignature

```ts
function verifyEventSignature(event: NostrEvent): boolean
```

Verifies an event's id and signature **from scratch**, consulting no cache and
writing none.

::: warning
`verifiedSymbol` is an own enumerable symbol property, and object spread copies
own symbols. That means `{ ...signedEvent, content: 'changed' }` inherits the
original event's "already verified" flag, and `verifyEvent` would return `true`
for it.

Events parsed from JSON are unaffected - JSON has no symbols - so data arriving
off the wire is never at risk. But any code path that spreads a signed event and
mutates it should use `verifyEventSignature`. The [Schema](/api/schema) and
[Policy](/api/policy) modules use it for exactly this reason.
:::

```ts
const tampered = { ...signed, content: 'changed' }

verifyEvent(tampered)             // true  - reads the copied cache flag
verifyEventSignature(tampered)    // false - actually checks
```

Results are cached on the event object via `[verifiedSymbol]`.

```ts
if (verifyEvent(event)) {
  // event is now typed as VerifiedEvent
  console.log('Valid event from', event.pubkey)
}
```

## getEventHash

```ts
function getEventHash(event: UnsignedEvent): string
```

Computes the SHA-256 hash of a serialized event (the event `id`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `UnsignedEvent` | Event with pubkey but no id/sig |

**Returns:** `string` - 64-character hex hash.

## serializeEvent

```ts
function serializeEvent(event: UnsignedEvent): string
```

Serializes an event to NIP-01 canonical JSON format:

```json
[0, "<pubkey>", <created_at>, <kind>, <tags>, "<content>"]
```

**Throws:** `Error` if the event fails validation.

## validateEvent

```ts
function validateEvent<T>(event: T): event is T & UnsignedEvent
```

Validates an event's structure. Type guard that checks:

- `kind` is a number
- `content` is a string
- `created_at` is a number
- `pubkey` is a 64-character hex string
- `tags` is an array of string arrays

## verifiedSymbol

```ts
const verifiedSymbol: unique symbol
```

Symbol used to mark events as verified. Set to `true` on events that pass `verifyEvent()` or are created with `finalizeEvent()`.
