# Relays

Relays are WebSocket servers that store and forward Nostr events. nostr-core provides two classes for working with them: `Relay` for single connections and `RelayPool` for multiple relays.

::: tip
If you're only using the `NWC` class, relay management is handled automatically. This guide is for building custom Nostr applications.
:::

## Relay

Connect to a single relay:

```ts
import { Relay } from 'nostr-core'

const relay = new Relay('wss://relay.example.com')
await relay.connect()

console.log('Connected:', relay.connected)
```

### Publishing Events

```ts
import { finalizeEvent, generateSecretKey } from 'nostr-core'

const sk = generateSecretKey()
const event = finalizeEvent({
  kind: 1,
  tags: [],
  content: 'Hello from nostr-core!',
  created_at: Math.floor(Date.now() / 1000),
}, sk)

const reason = await relay.publish(event)
console.log('Published:', reason)
```

### Subscribing to Events

```ts
const sub = relay.subscribe(
  [{ kinds: [1], limit: 10 }],
  {
    onevent(event) {
      console.log('Received:', event.content)
    },
    oneose() {
      console.log('End of stored events')
    },
    onclose(reason) {
      console.log('Subscription closed:', reason)
    },
  }
)

// Close subscription when done
sub.close()
```

### Connection Options

```ts
// With connection timeout
await relay.connect({ timeout: 5000 })

// Custom WebSocket implementation (useful for testing or Node.js)
const relay = new Relay('wss://relay.example.com', {
  websocketImplementation: MyWebSocket,
})
```

### Closing

```ts
relay.close() // Closes all subscriptions and the WebSocket
```

## RelayPool

Manage connections to multiple relays:

```ts
import { RelayPool } from 'nostr-core'

const pool = new RelayPool()
```

### Subscribing Across Relays

```ts
const relays = ['wss://relay1.example.com', 'wss://relay2.example.com']

const sub = pool.subscribe(
  relays,
  { kinds: [1], limit: 10 },
  {
    onevent(event) {
      console.log('Event from any relay:', event.content)
    },
    oneose() {
      // Called when ALL relays have sent EOSE
      console.log('All relays finished')
    },
  }
)

// Close all subscriptions
sub.close()
```

### Publishing to Multiple Relays

```ts
const results = await pool.publish(relays, event)
// results is an array of successful relay responses
```

To see which relays accepted and why the others refused, use `publishDetailed`.
It returns one result per relay and never rejects for relay trouble:

```ts
const results = await pool.publishDetailed(relays, event, {
  onResult(r) {
    if (r.ok) console.log('sent via', r.url) // fires as each relay answers
  },
})

for (const r of results) {
  if (!r.ok) console.log(r.url, r.prefix, r.message) // e.g. 'rate-limited', 'slow down'
}
```

`prefix` is the machine-readable part of the relay's reason (`duplicate`, `pow`,
`blocked`, `rate-limited`, `invalid`, `restricted`, `mute`, `error`,
`auth-required`). `parseRelayReason(reason)` does the same split for any `OK` or
`CLOSED` reason, such as the one passed to `onclose`.

### Querying

Fetch events synchronously from multiple relays:

```ts
const events = await pool.querySync(relays, {
  kinds: [1],
  authors: ['pubkey...'],
  limit: 50,
})
```

### Pool Options

```ts
const pool = new RelayPool({
  // Custom WebSocket implementation
  websocketImplementation: MyWebSocket,
  // Max time to wait for relay connections (default: 3000ms)
  maxWaitForConnection: 5000,
})
```

### Connection Management

```ts
// Get or create a relay connection
const relay = await pool.ensureRelay('wss://relay.example.com')

// Check connection status
const status = pool.listConnectionStatus()
// Map { 'wss://relay.example.com' => true, ... }

// Close specific relays
pool.close(['wss://relay1.example.com'])

// Close all relays
pool.close()
```
