# NIP-46

Nostr Connect - remote signing over relays. Delegates signing to a remote signer (e.g. nsecBunker, Amber, LNbits) via encrypted kind `24133` events.

## NostrConnect

### Constructor

Accepts a `nostrconnect://` or `bunker://` URI string, or a `Nip46ConnectionOptions` object:

```ts
import { NostrConnect } from 'nostr-core'

// From bunker:// URI (with multiple relays, secret, and app metadata)
const signer = new NostrConnect(
  'bunker://<remote-pubkey>?relay=wss://relay1.example.com&relay=wss://relay2.example.com&secret=mytoken&name=MyApp&url=https://myapp.com'
)

// From nostrconnect:// URI
const signer = new NostrConnect('nostrconnect://<remote-pubkey>?relay=wss://relay.example.com')

// From options
const signer = new NostrConnect({
  remotePubkey: '<hex-pubkey>',
  relayUrls: ['wss://relay1.example.com', 'wss://relay2.example.com'],
  secretKey: mySecretKey,  // optional - random key generated if omitted
  secret: 'mytoken',      // optional - required by Amber/LNbits signers
  encryption: 'auto',     // optional - 'auto' (default) | 'nip44' | 'nip04'
})
```

### Transport Encryption

NIP-46 specifies **NIP-44**, and current signers (Amber, nsec.app) require it.
NIP-04 is kept only for backwards compatibility with older bunkers.

`'auto'` (the default) starts on NIP-44 and falls back to NIP-04 only when the
remote signer either answers in NIP-04 or does not answer the NIP-44 handshake at
all. Responses are decrypted by ciphertext shape - NIP-04 payloads carry an
`?iv=` marker - so a signer that replies in the other scheme is detected and
adopted without a retry.

```ts
const signer = new NostrConnect(uri)
signer.handshakeTimeout = 15000   // per-attempt timeout for the connect RPC

await signer.connect()
signer.encryption   // 'nip44' or 'nip04' - whichever the signer speaks
```

Pin a scheme explicitly with `encryption: 'nip44'` or `'nip04'` to skip the
fallback entirely. A real error from the signer during the handshake surfaces
immediately rather than triggering a fallback - only a silent signer justifies
trying the other scheme.

### Connection

`connect()` tries each relay in order until one succeeds (fallback behavior):

```ts
await signer.connect()     // Connect to relay + NIP-46 handshake
await signer.disconnect()  // Send disconnect RPC + close relay
signer.close()             // Immediate cleanup (no disconnect RPC)
```

### Signer Methods

```ts
const pubkey = await signer.getPublicKey()

const signed = await signer.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello via remote signer!',
})
```

### NIP-04 Encryption

```ts
const encrypted = await signer.nip04.encrypt(recipientPubkey, 'secret message')
const decrypted = await signer.nip04.decrypt(senderPubkey, encrypted)
```

### NIP-44 Encryption

```ts
const encrypted = await signer.nip44.encrypt(recipientPubkey, 'secret message')
const decrypted = await signer.nip44.decrypt(senderPubkey, encrypted)
```

### Other Methods

```ts
const methods = await signer.describe()  // ['connect', 'sign_event', 'nip44_encrypt', ...]
const relays = await signer.getRelays()  // RelayMap
```

### Configuration

```ts
signer.timeout = 30000           // RPC timeout in ms (default: 60s)
signer.handshakeTimeout = 15000  // per-attempt connect RPC timeout (default: 15s)
```

## parseConnectionURI

Parses a `nostrconnect://` or `bunker://` URI into its components. Supports multiple `relay` params, optional `secret`, and optional app metadata (`name`, `url`, `image`):

```ts
import { parseConnectionURI } from 'nostr-core'

const opts = parseConnectionURI(
  'bunker://<pubkey>?relay=wss://r1.example.com&relay=wss://r2.example.com&secret=tok&name=MyApp'
)
// opts.remotePubkey  - hex pubkey
// opts.relayUrls     - ['wss://r1.example.com', 'wss://r2.example.com']
// opts.secret        - 'tok'
// opts.appMetadata   - { name: 'MyApp' }
```

## Nip46ConnectionOptions

```ts
type Nip46ConnectionOptions = {
  remotePubkey: string
  relayUrls: string[]
  secretKey?: Uint8Array
  secret?: string
  encryption?: 'auto' | 'nip44' | 'nip04'   // default: 'auto'
}
```

## Nip46Encryption

```ts
type Nip46Encryption = 'nip44' | 'nip04'
type Nip46EncryptionMode = Nip46Encryption | 'auto'
```

## Nip46AppMetadata

Extracted from URI query params when present:

```ts
type Nip46AppMetadata = {
  name?: string
  url?: string
  image?: string
}
```

## Nip46Method

```ts
type Nip46Method =
  | 'connect'
  | 'disconnect'
  | 'describe'
  | 'get_public_key'
  | 'sign_event'
  | 'nip04_encrypt'
  | 'nip04_decrypt'
  | 'nip44_encrypt'
  | 'nip44_decrypt'
  | 'get_relays'
```

## Errors

| Class | Code | Description |
|-------|------|-------------|
| `Nip46Error` | `NIP46_ERROR` | Base error for NIP-46 operations |
| `Nip46TimeoutError` | `NIP46_TIMEOUT` | RPC request timed out |
| `Nip46ConnectionError` | `NIP46_CONNECTION_ERROR` | Failed to connect to relay or handshake failed |
| `Nip46RemoteError` | `NIP46_REMOTE_ERROR` | Remote signer returned an error |
