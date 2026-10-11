# Relay

WebSocket connection to a single Nostr relay.

## Import

```ts
import { Relay } from 'nostr-core'
```

## Constructor

```ts
new Relay(url: string, opts?: {
  websocketImplementation?: typeof WebSocket
  reconnect?: ReconnectOptions | false
})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Relay WebSocket URL |
| `opts.websocketImplementation` | `typeof WebSocket?` | Custom WebSocket class |
| `opts.reconnect` | `ReconnectOptions \| false` | Auto-reconnect settings; `false` disables it |

The URL is normalized automatically (see [`normalizeURL`](/api/utils#normalizeurl)).

## Auto-Reconnect

A WebSocket that closes unexpectedly - laptop sleep, a NAT or proxy idle
timeout, a relay restart - would otherwise take every standing subscription with
it, and a long-running client would silently lose all its live feeds until a full
reload. Auto-reconnect is **enabled by default**: the relay retries with
exponential backoff and replays its open REQs once the socket is back.

```ts
type ReconnectOptions = {
  enabled?: boolean            // default: true
  initialDelay?: number        // default: 1000 ms
  maxDelay?: number            // default: 30000 ms
  factor?: number              // default: 2
  maxAttempts?: number         // default: Infinity
  jitter?: number              // default: 0.3 (fraction of the delay)
  connectionTimeout?: number   // default: 5000 ms per retry
}
```

```ts
const relay = new Relay('wss://relay.damus.io', {
  reconnect: { initialDelay: 500, maxDelay: 15_000, maxAttempts: 20 },
})

relay.ondisconnect = (reason) => console.warn('dropped:', reason)
relay.onreconnect = () => console.log('back, subscriptions replayed')
relay.onreconnectfailed = (err) => console.error('gave up:', err)
```

Behaviour:

- `openSubs` is **kept** across a drop - those filters are exactly what has to be
  replayed - and each subscription is re-fired with its original id and filters.
- In-flight publishes still reject immediately; a dead socket can never answer them.
- An **initial** `connect()` failure does not trigger retries; the promise rejects
  as before. Retries only apply after a connection that had actually opened.
- `close()` is explicit and final: it cancels any pending retry and closes the
  subscriptions.
- Calling `subscribe()` while a retry is pending queues the REQ instead of
  throwing; it fires on reconnect.

::: warning Duplicate events on replay
A replayed REQ is a fresh REQ, so the relay resends matching history and
`oneose` fires again. Dedupe by event id on the receiving side - the same
guidance that applies to subscribing across multiple relays.
:::

::: tip
Browsers cannot send WebSocket ping frames, so client-side keepalive is not an
option; reconnect-on-close is the standard remedy.
:::

## Properties

### url

```ts
relay.url: string // readonly
```

The normalized relay URL.

### connected

```ts
relay.connected: boolean // getter
```

Whether the WebSocket connection is active.

### eoseTimeout

```ts
relay.eoseTimeout: number // default: 4400
```

Milliseconds to wait for EOSE before timing out a subscription.

### publishTimeout

```ts
relay.publishTimeout: number // default: 4400
```

Milliseconds to wait for OK response after publishing.

### openSubs

```ts
relay.openSubs: Map<string, Subscription>
```

Currently active subscriptions, keyed by subscription ID.

## Methods

### connect

```ts
await relay.connect(opts?: { timeout?: number }): Promise<void>
```

Establishes the WebSocket connection. If the connection later drops, open
subscriptions are preserved and replayed once it is re-established (see
[Auto-Reconnect](#auto-reconnect)); with reconnect disabled they are closed
instead.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.timeout` | `number?` | Connection timeout in ms |

**Throws:** `Error` on connection failure or timeout.

### publish

```ts
await relay.publish(event: NostrEvent): Promise<string>
```

Publishes an event and waits for the relay's OK response.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | Signed event to publish |

**Returns:** `string` - reason from the relay's OK message.

**Throws:** `Error` on timeout or NACK (negative acknowledgement). On a NACK the
error's `message` is the relay's reason as sent; read it with
[`parseRelayReason`](#parserelayreason).

### subscribe

```ts
relay.subscribe(filters: Filter[], params: SubscriptionParams & { id?: string }): Subscription
```

Creates a subscription and immediately starts receiving events. If a reconnect
is pending the REQ is queued and fired once the socket is back; if the relay is
disconnected with no retry in flight, this throws.

| Parameter | Type | Description |
|-----------|------|-------------|
| `filters` | `Filter[]` | Array of event filters |
| `params` | `SubscriptionParams` | Callbacks and options |
| `params.id` | `string?` | Custom subscription ID |

**Returns:** `Subscription`

### send

```ts
relay.send(message: string): void
```

Sends a raw message over the WebSocket.

**Throws:** `Error` if not connected.

### close

```ts
relay.close(): void
```

Closes all subscriptions and the WebSocket connection, and cancels auto-reconnect.
This is the explicit, final teardown - the relay will not retry after it.

## Reconnect Callbacks

### ondisconnect

```ts
relay.ondisconnect: ((reason: string) => void) | undefined
```

Fired when an established connection drops, before a retry is scheduled.

### onreconnect

```ts
relay.onreconnect: (() => void) | undefined
```

Fired after a dropped connection is re-established and its REQs replayed.

### onreconnectfailed

```ts
relay.onreconnectfailed: ((err: Error) => void) | undefined
```

Fired when auto-reconnect gives up after `maxAttempts`. The open subscriptions
are closed at that point.

### reconnecting

```ts
relay.reconnecting: boolean
```

True while a retry is pending.

---

## Subscription

Represents an active subscription to a relay.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `relay` | `Relay` | Parent relay (readonly) |
| `id` | `string` | Subscription ID (readonly) |
| `closed` | `boolean` | Whether closed |
| `eosed` | `boolean` | Whether EOSE received |
| `filters` | `Filter[]` | Active filters |

### Callbacks

| Callback | Type | Description |
|----------|------|-------------|
| `onevent` | `(evt: NostrEvent) => void` | Called for each matching event |
| `oneose` | `(() => void)?` | Called when stored events are exhausted |
| `onclose` | `((reason: string) => void)?` | Called when subscription closes. A relay's `CLOSED` reason is passed as sent; read it with [`parseRelayReason`](#parserelayreason) |

### Methods

#### close

```ts
sub.close(reason?: string): void
```

Sends a CLOSE message to the relay and calls `onclose`.

#### reset

```ts
subscription.reset(): void
```

Clears the per-connection state (EOSE flag and timer) so the subscription can be
re-fired on a fresh socket. Called for you during a reconnect.

#### fire

```ts
sub.fire(): void
```

Sends the REQ message to the relay. Called automatically by `relay.subscribe()`.

---

## SubscriptionParams

```ts
type SubscriptionParams = {
  onevent?: (evt: NostrEvent) => void
  oneose?: () => void
  onclose?: (reason: string) => void
  eoseTimeout?: number
}
```

---

## Relay Reasons

`OK` and `CLOSED` messages carry a reason of the form `"<prefix>: <message>"`,
where the prefix is machine-readable (NIP-01, plus `auth-required` from NIP-42).

### parseRelayReason

```ts
import { parseRelayReason } from 'nostr-core'

parseRelayReason(reason: string): ParsedRelayReason
```

Splits a reason into its prefix and the human-readable rest.

```ts
parseRelayReason('rate-limited: slow down')
// { prefix: 'rate-limited', message: 'slow down' }

parseRelayReason('something went wrong')
// { message: 'something went wrong' }
```

Relays are third parties, so it is lenient and never throws:

- the prefix matches case-insensitively and ignores surrounding whitespace (`' ERROR :  boom '` gives `{ prefix: 'error', message: 'boom' }`);
- only a whole known word counts: `foo: bar` and `unblocked: x` have no prefix;
- a bare keyword without a colon (`duplicate`) still counts, with an empty `message`;
- text without a known prefix comes back whole, trimmed, in `message`;
- a non-string reason is treated as an empty one.

Use it on [`pool.publishDetailed`](/api/pool#publishdetailed) results (already
parsed for you), on the error of a rejected `relay.publish`, and on
`onclose` reasons:

```ts
relay.subscribe(filters, {
  onclose(reason) {
    if (parseRelayReason(reason).prefix === 'auth-required') {
      // authenticate (NIP-42), then subscribe again
    }
  },
})
```

### RelayReasonPrefix

```ts
type RelayReasonPrefix =
  | 'duplicate' | 'pow' | 'blocked' | 'rate-limited' | 'invalid'
  | 'restricted' | 'mute' | 'error' | 'auth-required'
```

| Prefix | Meaning |
|--------|---------|
| `duplicate` | The relay already has the event |
| `pow` | Not enough proof of work (NIP-13) |
| `blocked` | Relay policy forbids this author, event or address |
| `rate-limited` | Too many requests; slow down |
| `invalid` | Malformed event or broken relay rule |
| `restricted` | Not allowed to do that here (e.g. no write access) |
| `mute` | Ignored, e.g. an ephemeral event nobody listened to |
| `error` | The relay failed internally, or nothing else fits |
| `auth-required` | Authenticate first (NIP-42), then repeat the request |

The same list is exported as `RELAY_REASON_PREFIXES` (a readonly array).

### ParsedRelayReason

```ts
type ParsedRelayReason = {
  prefix?: RelayReasonPrefix
  message: string
}
```
