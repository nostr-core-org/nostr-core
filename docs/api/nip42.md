# NIP-42

Authentication of Clients to Relays - defines kind 22242 authentication events that prove a client controls a specific pubkey. The relay sends a challenge string, and the client signs an auth event containing that challenge and the relay URL.

## Import

```ts
import { nip42 } from 'nostr-core'
// or import individual functions
import {
  createAuthEventTemplate,
  createAuthEvent,
  verifyAuthEvent,
} from 'nostr-core'
```

## nip42.createAuthEventTemplate

```ts
function createAuthEventTemplate(opts: { relay: string; challenge: string }): EventTemplate
```

Creates an unsigned kind 22242 client authentication event template. Use with `finalizeEvent()` or pass to a `Signer`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.relay` | `string` | Relay URL that issued the challenge |
| `opts.challenge` | `string` | Challenge string received from the relay |

**Returns:** `EventTemplate` - Unsigned kind 22242 event with `relay` and `challenge` tags.

```ts
const template = nip42.createAuthEventTemplate({
  relay: 'wss://relay.example.com',
  challenge: 'random-challenge-string',
})

const signed = await signer.signEvent(template)
```

## nip42.createAuthEvent

```ts
function createAuthEvent(opts: { relay: string; challenge: string }, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 22242 client authentication event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.relay` | `string` | Relay URL that issued the challenge |
| `opts.challenge` | `string` | Challenge string from the relay |
| `secretKey` | `Uint8Array` | Signer's secret key (32 bytes) |

**Returns:** `NostrEvent` - Signed kind 22242 event to send back to the relay.

```ts
const authEvent = nip42.createAuthEvent(
  { relay: 'wss://relay.example.com', challenge: 'random-challenge-string' },
  secretKey,
)
```

## nip42.verifyAuthEvent

```ts
function verifyAuthEvent(event: NostrEvent, challenge: string, relayUrl: string): boolean
```

Verifies a kind 22242 authentication event. Checks that the event is valid, has the correct kind, and that the `relay` and `challenge` tags match the expected values.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | The authentication event to verify |
| `challenge` | `string` | The challenge string that was issued |
| `relayUrl` | `string` | The relay URL that issued the challenge |

**Returns:** `boolean` - `true` if the auth event is valid and matches the challenge/relay.

```ts
const isValid = nip42.verifyAuthEvent(authEvent, 'random-challenge-string', 'wss://relay.example.com')
if (isValid) {
  console.log(`Authenticated as ${authEvent.pubkey}`)
}
```

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip42, Relay } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)

// Connect to a relay that requires authentication
const relay = new Relay('wss://relay.example.com')

// Handle the AUTH challenge from the relay
relay.onauth = async (challenge: string) => {
  // Create and sign an auth event
  const authEvent = nip42.createAuthEvent(
    { relay: 'wss://relay.example.com', challenge },
    sk,
  )

  // Send the auth event back to the relay
  await relay.auth(authEvent)
  console.log('Authenticated successfully!')
}

await relay.connect()

// Or use the template approach with a Signer
relay.onauth = async (challenge: string) => {
  const template = nip42.createAuthEventTemplate({
    relay: 'wss://relay.example.com',
    challenge,
  })
  const signed = await signer.signEvent(template)
  await relay.auth(signed)
}

// Server-side: verify an auth event
function handleAuth(event: NostrEvent, expectedChallenge: string) {
  const valid = nip42.verifyAuthEvent(event, expectedChallenge, 'wss://relay.example.com')
  if (valid) {
    console.log(`User ${event.pubkey} authenticated`)
    // Grant access to restricted resources
  } else {
    console.log('Authentication failed')
  }
}

relay.close()
```

## Automatic Authentication

Instead of wiring `onauth` by hand, give the relay (or pool) a signer. It answers
each challenge once, and re-sends a REQ or EVENT that was refused with
`auth-required:` once after authenticating, including after a reconnect:

```ts
const relay = new Relay('wss://relay.example.com', {
  authSigner: (template) => finalizeEvent(template, sk), // or signer.signEvent(template)
})
const pool = new RelayPool({ authSigner: (template) => signer.signEvent(template) })
```

See [Relay: NIP-42 Authentication](/api/relay#nip-42-authentication) for the
exact rules.

## How It Works

- The relay sends an `AUTH` message containing a challenge string to the client
- The client creates a kind 22242 event with `relay` and `challenge` tags
- The signed event proves the client controls the private key for a specific pubkey
- The client sends the signed event back via the `AUTH` command
- **Verification checks:** valid signature, kind 22242, matching relay URL, matching challenge string
- Relays use authentication to restrict access (e.g., private relays, rate limiting)
- The `relay.onauth` callback is triggered when the relay issues an AUTH challenge
- The `relay.auth()` method sends the signed auth event back to the relay
- Authentication is per-connection and must be repeated on reconnection (an `authSigner` does this for you)
- The latest challenge is kept in `relay.challenge` until the connection drops
