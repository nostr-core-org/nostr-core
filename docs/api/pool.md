# RelayPool

Manages connections to multiple Nostr relays, deduplicating connections and aggregating subscriptions.

## Import

```ts
import { RelayPool } from 'nostr-core'
```

## Constructor

```ts
new RelayPool(opts?: {
  websocketImplementation?: typeof WebSocket
  maxWaitForConnection?: number
  reconnect?: ReconnectOptions | false
  authSigner?: AuthSigner
})
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.websocketImplementation` | `typeof WebSocket?` | - | Custom WebSocket class |
| `opts.maxWaitForConnection` | `number?` | `3000` | Default connection timeout in ms |
| `opts.reconnect` | `ReconnectOptions \| false` | enabled | Auto-reconnect settings applied to every relay in the pool. See [Relay](/api/relay#auto-reconnect) |
| `opts.authSigner` | `AuthSigner?` | - | Opt-in NIP-42 signer given to every relay the pool creates. See [Relay](/api/relay#nip-42-authentication) |

::: tip
Pooled relays auto-reconnect and replay their subscriptions by default, so a
network blip no longer silently kills a standing `pool.subscribe()`. Use
[`getRelay`](#getrelay) to attach `ondisconnect` / `onreconnect` handlers.
:::

### NIP-42 relays

Relays created inside the pool never see an `onauth` handler before they
connect, so a relay that demands AUTH (such as a NIP-17 inbox relay serving
`kind:1059`) would close the subscription with `auth-required:`. Pass an
`authSigner` and every pooled relay answers its challenges and retries an
`auth-required` REQ or EVENT once after authenticating:

```ts
import { RelayPool, finalizeEvent } from 'nostr-core'

const inboxPool = new RelayPool({ authSigner: (t) => finalizeEvent(t, sk) })
const wraps = await inboxPool.querySync(inboxRelays, { kinds: [1059], '#p': [pk] })
```

Every relay the pool talks to then learns the signer's pubkey, so keep a
separate pool without a signer for public queries.

## Methods

### getRelay

```ts
pool.getRelay(url: string): Relay | undefined
```

Returns the pooled [`Relay`](/api/relay) for a URL, if one has been created.
Useful for attaching reconnect callbacks:

```ts
pool.getRelay('wss://relay.damus.io')?.ondisconnect = (reason) => {
  console.warn('relay dropped:', reason)
}
```

### ensureRelay

```ts
await pool.ensureRelay(url: string, opts?: {
  connectionTimeout?: number
}): Promise<Relay>
```

Gets an existing relay connection or creates a new one. Sets `publishTimeout` to 5 seconds on new relays.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Relay URL |
| `opts.connectionTimeout` | `number?` | Override connection timeout |

**Returns:** [`Relay`](/api/relay)

### subscribe

```ts
pool.subscribe(
  relayUrls: string[],
  filter: Filter,
  params: PoolSubscribeParams
): SubCloser
```

Subscribes to the same filter across multiple relays.

| Parameter | Type | Description |
|-----------|------|-------------|
| `relayUrls` | `string[]` | Relay URLs to subscribe on |
| `filter` | `Filter` | Event filter |
| `params` | `PoolSubscribeParams` | Callbacks and options |

The `oneose` callback fires only when **all** relays have sent EOSE.

**Returns:** `SubCloser` - object with a `close(reason?: string)` method.

### publish

```ts
await pool.publish(relayUrls: string[], event: NostrEvent): Promise<string[]>
```

Publishes an event to multiple relays. Failed publishes are silently dropped.

| Parameter | Type | Description |
|-----------|------|-------------|
| `relayUrls` | `string[]` | Relay URLs to publish to |
| `event` | `NostrEvent` | Signed event |

**Returns:** `string[]` - array of successful relay responses.

::: tip
`publish` cannot tell you which relays accepted, or why one refused. Use
[`publishDetailed`](#publishdetailed) when you need per-relay outcomes.
:::

### publishDetailed

```ts
await pool.publishDetailed(
  relayUrls: string[],
  event: NostrEvent,
  opts?: { onResult?: (result: PublishResult) => void }
): Promise<PublishResult[]>
```

Publishes an event to multiple relays and reports every relay's outcome. There is
one result per relay URL (normalised and deduplicated), in input order. Relay
trouble never rejects the promise: a failed connection, a timeout or an
`OK false` all become `ok: false` with a `reason`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `relayUrls` | `string[]` | Relay URLs to publish to |
| `event` | `NostrEvent` | Signed event |
| `opts.onResult` | `(result: PublishResult) => void` | Called once per relay as soon as its outcome is known |

**Returns:** [`PublishResult[]`](#publishresult)

```ts
const results = await pool.publishDetailed(relays, event)

const accepted = results.filter(r => r.ok)
const retry = results.filter(r => !r.ok && (r.prefix === 'rate-limited' || r.prefix === 'error'))
const needsAuth = results.filter(r => r.prefix === 'auth-required')
```

Show "sent" on the first acceptance without waiting for slower relays:

```ts
const firstAccept = new Promise<PublishResult | null>(resolve => {
  pool.publishDetailed(relays, event, {
    onResult: r => { if (r.ok) resolve(r) },
  }).then(() => resolve(null)) // nobody accepted
})
```

::: tip
A `duplicate:` refusal means the relay already holds the event, so most apps
treat it as delivered.
:::

### querySync

```ts
await pool.querySync(
  relayUrls: string[],
  filter: Filter,
  params?: { maxWait?: number }
): Promise<NostrEvent[]>
```

Queries multiple relays and returns all matching events once EOSE is received from all relays.

| Parameter | Type | Description |
|-----------|------|-------------|
| `relayUrls` | `string[]` | Relay URLs |
| `filter` | `Filter` | Event filter |
| `params.maxWait` | `number?` | Connection timeout |

**Returns:** `NostrEvent[]`

### listConnectionStatus

```ts
pool.listConnectionStatus(): Map<string, boolean>
```

**Returns:** `Map<string, boolean>` - relay URL to connected status.

### close

```ts
pool.close(relayUrls?: string[]): void
```

Closes specified relay connections, or all connections if no URLs provided.

## Types

### SubCloser

```ts
type SubCloser = {
  close: (reason?: string) => void
}
```

### PublishResult

```ts
type PublishResult = {
  url: string
  ok: boolean
  reason: string
  prefix?: RelayReasonPrefix
  message: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | Normalised relay URL |
| `ok` | `boolean` | `true` when the relay answered `OK` with `true` |
| `reason` | `string` | The relay's `OK` reason, or the local error when it never answered (`connection failed`, `publish timed out`, ...) |
| `prefix` | [`RelayReasonPrefix?`](/api/relay#parserelayreason) | Machine-readable prefix of `reason`, if it has a known one |
| `message` | `string` | `reason` without its prefix, trimmed |

`prefix` and `message` come from [`parseRelayReason`](/api/relay#parserelayreason).

### PoolSubscribeParams

```ts
type PoolSubscribeParams = SubscriptionParams & {
  maxWait?: number
  id?: string
  label?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `onevent` | `(evt: NostrEvent) => void` | Called for each event |
| `oneose` | `() => void` | Called when all relays finish |
| `onclose` | `(reason: string) => void` | Called on subscription close. Read the reason with [`parseRelayReason`](/api/relay#parserelayreason) |
| `eoseTimeout` | `number?` | EOSE timeout per relay |
| `maxWait` | `number?` | Connection timeout |
| `id` | `string?` | Custom subscription ID |
| `label` | `string?` | Label for the subscription |
