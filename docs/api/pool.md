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
})
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.websocketImplementation` | `typeof WebSocket?` | - | Custom WebSocket class |
| `opts.maxWaitForConnection` | `number?` | `3000` | Default connection timeout in ms |
| `opts.reconnect` | `ReconnectOptions \| false` | enabled | Auto-reconnect settings applied to every relay in the pool. See [Relay](/api/relay#auto-reconnect) |

::: tip
Pooled relays auto-reconnect and replay their subscriptions by default, so a
network blip no longer silently kills a standing `pool.subscribe()`. Use
[`getRelay`](#getrelay) to attach `ondisconnect` / `onreconnect` handlers.
:::

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
| `onclose` | `(reason: string) => void` | Called on subscription close |
| `eoseTimeout` | `number?` | EOSE timeout per relay |
| `maxWait` | `number?` | Connection timeout |
| `id` | `string?` | Custom subscription ID |
| `label` | `string?` | Label for the subscription |
