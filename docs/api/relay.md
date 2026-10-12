# Relay

WebSocket connection to a single Nostr relay.

## Import

```ts
import { Relay } from 'nostr-core'
```

## Constructor

```ts
new Relay(url: string, opts?: RelayOptions)

type RelayOptions = {
  websocketImplementation?: typeof WebSocket
  reconnect?: ReconnectOptions | false
  authSigner?: AuthSigner
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Relay WebSocket URL |
| `opts.websocketImplementation` | `typeof WebSocket?` | Custom WebSocket class |
| `opts.reconnect` | `ReconnectOptions \| false` | Auto-reconnect settings; `false` disables it |
| `opts.authSigner` | `AuthSigner?` | Opt-in NIP-42 signer: answers challenges and retries `auth-required` refusals once. See [NIP-42 Authentication](#nip-42-authentication) |

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

## NIP-42 Authentication

Some relays only serve or accept certain events to an authenticated client -
NIP-17 inbox relays, for example, answer a `kind:1059` REQ with
`CLOSED "auth-required: ..."` until the client has answered their AUTH
challenge. Pass an `authSigner` and the relay handles this itself:

```ts
type AuthSigner = (template: EventTemplate) => Promise<NostrEvent> | NostrEvent
```

```ts
import { Relay, finalizeEvent } from 'nostr-core'

// Secret key
const relay = new Relay('wss://auth.nostr1.com', {
  authSigner: (t) => finalizeEvent(t, sk),
})

// NIP-07 extension or NIP-46 / Signer
new Relay(url, { authSigner: (t) => window.nostr.signEvent(t) })
new Relay(url, { authSigner: (t) => signer.signEvent(t) })

await relay.connect()
relay.subscribe([{ kinds: [1059], '#p': [pk] }], { onevent, onclose })
```

Behaviour with an `authSigner`:

- Every AUTH challenge is answered automatically, **once per challenge**. Concurrent
  needs for the same challenge share one answer.
- A subscription closed with `auth-required:` authenticates (waiting up to
  [`authTimeout`](#authtimeout) for a challenge if none arrived yet) and is then
  re-sent **once** with the same id. A second `auth-required:` closes it for real
  and `onclose` receives the relay's reason - no retry loop. The EOSE timer is
  paused while it waits.
- A publish refused with `OK false "auth-required: ..."` authenticates and re-sends
  the EVENT **once**; the promise settles from the retried OK.
- After a reconnect the challenge is cleared, the replayed REQs follow the same
  path, and the relay authenticates with the **new** challenge, so standing
  subscriptions survive a drop.
- If the signer throws, rejects, or takes longer than `authTimeout`, or the relay
  rejects the AUTH, the subscription closes and the publish rejects with
  `auth-required: <why>`. Nothing is left as an unhandled rejection.
- If you set [`onauth`](#onauth) yourself, it stays in charge of answering
  challenges and the relay does not answer them too; `authSigner` is then only
  used when a request is refused with `auth-required:` and the current challenge
  has not been authenticated yet.

::: warning Privacy
Every relay that sends a challenge learns the signer's pubkey. Only pass an
`authSigner` to relays you are willing to authenticate to - for example a
dedicated `Relay` or `RelayPool` for inbox relays, separate from the one used for
public queries.
:::

Without an `authSigner`, behaviour is unchanged: `CLOSED` and `OK false` reach
`onclose` / the publish rejection as before. The latest challenge is still kept
in [`relay.challenge`](#challenge), so a handler attached after `connect()` can
answer it.

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

### authTimeout

```ts
relay.authTimeout: number // default: 10000
```

Milliseconds to wait for an AUTH challenge, and for `authSigner` to sign it,
before a pending subscription closes or a publish rejects. Raise it for remote
signers that ask the user to approve.

### challenge

```ts
relay.challenge: string | undefined
```

The latest NIP-42 challenge received on the current connection. Updated on every
AUTH message and cleared when the connection drops or is closed.

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
[`parseRelayReason`](#parserelayreason). With an `authSigner`, an
`auth-required:` NACK is retried once after authenticating.

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

### auth

```ts
await relay.auth(event: NostrEvent): Promise<string>
```

Sends a signed kind 22242 event as the answer to a challenge and waits for the
relay's OK. Use it from [`onauth`](#onauth) when you answer challenges yourself;
with an `authSigner` the relay calls it for you.

**Throws:** `Error` on timeout or when the relay rejects the AUTH.

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

## Auth Callback

### onauth

```ts
relay.onauth: ((challenge: string) => void) | undefined
```

Fired for every AUTH challenge. When set, it is responsible for answering (see
[NIP-42](/api/nip42)), and an `authSigner` does not answer challenges on its own.

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
| `authRetried` | `boolean` | Whether the REQ was already re-sent after `auth-required` on this connection |
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

Clears the per-connection state (EOSE flag and timer, auth retry) so the
subscription can be re-fired on a fresh socket. Called for you during a reconnect.

#### pauseEoseTimeout

```ts
sub.pauseEoseTimeout(): void
```

Stops the EOSE timer while the relay authenticates before re-sending the REQ;
`fire()` arms it again. Called for you.

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

`OK` and `CLOSED` messages carry a reason that may start with a machine-readable prefix (`"<prefix>: <message>"`): the NIP-01 prefixes plus `auth-required` from NIP-42.

### parseRelayReason

```ts
function parseRelayReason(reason: string): { prefix?: RelayReasonPrefix; message: string }

type RelayReasonPrefix =
  | 'duplicate' | 'pow' | 'blocked' | 'rate-limited' | 'invalid'
  | 'restricted' | 'mute' | 'error' | 'auth-required'
```

```ts
parseRelayReason('rate-limited: slow down') // { prefix: 'rate-limited', message: 'slow down' }
parseRelayReason('something went wrong')    // { message: 'something went wrong' }
```

An unknown or missing prefix gives `{ message }` only. Use it on a `Subscription`'s `onclose` reason, or on `publishDetailed` results (which already include it).

