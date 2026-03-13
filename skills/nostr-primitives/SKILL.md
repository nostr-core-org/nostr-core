---
name: nostr-primitives
description: Use nostr-core's low-level Nostr protocol primitives to build custom applications. Covers key generation, event signing and verification, relay connections, NIP-04 and NIP-44 encryption, NIP-59 gift wrapping, NIP-17 private direct messages, bech32 encoding, event filtering, unified Signer interface, browser extension signing (NIP-07), and remote signing via Nostr Connect (NIP-46). Use for custom Nostr app development beyond standard wallet operations.
user-invocable: true
argument-hint: "[keys, events, relays, encryption, giftwrap, dm, encoding, signer, nip07, or nip46]"
---

# Nostr Protocol Primitives with nostr-core

You are helping the user build custom Nostr applications using the low-level primitives exported by **nostr-core**. These are the same building blocks used internally by the NWC client.

**When to use this skill:** The user wants to build something beyond standard wallet operations - custom Nostr events, direct relay communication, encrypted messaging, identity management, or delegated signing via browser extensions (NIP-07) or remote signers (NIP-46).

---

## Key Management

```typescript
import { generateSecretKey, getPublicKey } from 'nostr-core'

// Generate a new keypair
const sk = generateSecretKey()           // Uint8Array (32 bytes)
const pk = getPublicKey(sk)              // hex string (64 chars)
console.log('Public key:', pk)
```

**SECURITY:** Never log or expose secret keys. Store them securely (environment variables, encrypted storage).

---

## Event Signing & Verification

### Create and sign an event

```typescript
import { finalizeEvent, generateSecretKey } from 'nostr-core'

const sk = generateSecretKey()

const event = finalizeEvent({
  kind: 1,                                    // Kind 1 = text note
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello from nostr-core!',
}, sk)

console.log('Event ID:', event.id)       // SHA-256 hash
console.log('Pubkey:', event.pubkey)      // Derived from sk
console.log('Signature:', event.sig)      // Schnorr signature
```

### Verify an event

```typescript
import { verifyEvent } from 'nostr-core'

const isValid = verifyEvent(event)  // Checks id hash + signature
```

### Utility functions

```typescript
import { getEventHash, serializeEvent, validateEvent } from 'nostr-core'

const hash = getEventHash(event)          // Compute event ID
const json = serializeEvent(event)        // Canonical JSON for hashing
const isWellFormed = validateEvent(event) // Check structure (no crypto)
```

### Event types

```typescript
// EventTemplate - what you provide before signing
interface EventTemplate {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

// NostrEvent - complete signed event
interface NostrEvent extends EventTemplate {
  id: string       // SHA-256 of serialized event
  pubkey: string   // Author's public key (hex)
  sig: string      // Schnorr signature
}
```

---

## Relay Connections

### Single relay

```typescript
import { Relay } from 'nostr-core'

const relay = new Relay('wss://relay.damus.io')
await relay.connect()

// Subscribe to events
relay.subscribe(
  [{ kinds: [1], limit: 10 }],  // Filters
  {
    onevent(event) {
      console.log('Got event:', event.content)
    },
    oneose() {
      console.log('End of stored events')
    },
  }
)

// Publish an event
await relay.publish(signedEvent)

// Clean up
relay.close()
```

### Multi-relay pool

```typescript
import { RelayPool } from 'nostr-core'

const pool = new RelayPool(['wss://relay.damus.io', 'wss://nos.lol'])

pool.subscribe(
  [{ kinds: [1], authors: ['pubkey_hex'], limit: 20 }],
  {
    onevent(event) {
      console.log(event.content)
    },
  }
)

// Query and collect results
const events = await pool.querySync(
  [{ kinds: [0], authors: ['pubkey_hex'] }],
  { timeout: 5000 }
)

pool.close()
```

### Filters

```typescript
import { matchFilter, matchFilters } from 'nostr-core'

const filter = {
  kinds: [1],
  authors: ['abc123...'],
  since: Math.floor(Date.now() / 1000) - 3600,
  limit: 50,
}

// Check if an event matches a filter
const matches = matchFilter(filter, event)    // boolean
const matchesAny = matchFilters([filter1, filter2], event)
```

**Filter fields:**
| Field | Type | Description |
|-------|------|-------------|
| `ids` | `string[]` | Event IDs (prefix match) |
| `authors` | `string[]` | Pubkeys (prefix match) |
| `kinds` | `number[]` | Event kinds |
| `since` | `number` | After this unix timestamp |
| `until` | `number` | Before this unix timestamp |
| `limit` | `number` | Max events to return |
| `#e`, `#p`, etc. | `string[]` | Tag queries |

---

## Encryption

### NIP-44 (Recommended)

Modern encryption using ChaCha20-Poly1305 with HKDF key derivation:

```typescript
import { nip44 } from 'nostr-core'

// Derive a shared conversation key (do this once per conversation pair)
const conversationKey = nip44.getConversationKey(mySecretKey, theirPubkey)

// Encrypt
const ciphertext = nip44.encrypt(conversationKey, 'Secret message')

// Decrypt
const plaintext = nip44.decrypt(conversationKey, ciphertext)
```

### NIP-04 (Legacy)

AES-256-CBC encryption. Use only for backward compatibility:

```typescript
import { nip04 } from 'nostr-core'

// Encrypt
const ciphertext = await nip04.encrypt(mySecretKey, theirPubkey, 'Secret message')

// Decrypt
const plaintext = await nip04.decrypt(mySecretKey, theirPubkey, ciphertext)
```

**When to use which:**
- **NIP-44** - Use for all new applications. Stronger security, no padding oracle attacks.
- **NIP-04** - Only when communicating with services that don't support NIP-44.

---

## Gift Wrapping (NIP-59)

Multi-layer event encryption that hides sender identity and metadata. Three layers: **rumor** (unsigned content) → **seal** (kind 13, encrypted with sender key) → **gift wrap** (kind 1059, encrypted with ephemeral key).

```typescript
import { nip59, generateSecretKey, getPublicKey } from 'nostr-core'

const senderSk = generateSecretKey()
const senderPk = getPublicKey(senderSk)
const recipientPk = '...' // recipient's public key

// Create a rumor (unsigned event)
const rumor = nip59.createRumor(
  {
    kind: 1,
    tags: [],
    content: 'Secret message',
    created_at: Math.floor(Date.now() / 1000),
  },
  senderPk,
)

// Seal it (NIP-44 encrypt with sender key, kind 13)
const seal = nip59.createSeal(rumor, senderSk, recipientPk)

// Gift wrap it (NIP-44 encrypt with ephemeral key, kind 1059)
const wrap = nip59.createWrap(seal, recipientPk)
// wrap.pubkey is ephemeral - sender identity is hidden

// Recipient unwraps
const unwrapped = nip59.unwrap(wrap, recipientSk)
console.log(unwrapped.pubkey)  // real sender pubkey
console.log(unwrapped.content) // decrypted content
```

**Functions:**
| Function | Description |
|----------|-------------|
| `createRumor(event, pubkey)` | Create unsigned event with computed id |
| `createSeal(rumor, senderSk, recipientPk)` | Encrypt rumor into kind 13 seal |
| `createWrap(seal, recipientPk)` | Wrap seal in kind 1059 with ephemeral key |
| `unwrap(wrap, recipientSk)` | Decrypt wrap → verify seal → decrypt seal → validate pubkeys |

---

## Private Direct Messages (NIP-17)

End-to-end encrypted DMs with sender anonymity. Built on NIP-59 gift wrap - creates kind 14 rumors wrapped in seal + gift wrap.

```typescript
import { nip17, generateSecretKey, getPublicKey } from 'nostr-core'

const aliceSk = generateSecretKey()
const bobSk = generateSecretKey()
const bobPk = getPublicKey(bobSk)

// Alice sends a private DM to Bob
const wrap = nip17.wrapDirectMessage('Hello Bob!', aliceSk, bobPk)
// wrap is a kind 1059 event - publish to Bob's preferred relays

// Bob unwraps the DM
const dm = nip17.unwrapDirectMessage(wrap, bobSk)
console.log(dm.sender)  // Alice's real pubkey
console.log(dm.content) // "Hello Bob!"
```

**Thread replies** - include tags referencing previous messages:

```typescript
const reply = nip17.wrapDirectMessage(
  'Got it!',
  aliceSk,
  bobPk,
  [['e', previousMessageId]],
)
```

**Functions:**
| Function | Description |
|----------|-------------|
| `wrapDirectMessage(content, senderSk, recipientPk, tags?)` | Create gift-wrapped kind 14 DM |
| `unwrapDirectMessage(wrap, recipientSk)` | Unwrap and return `{ sender, content, tags, created_at, id }` |

---

## Bech32 Encoding (NIP-19)

Human-friendly encoding for Nostr identifiers:

### Decode

```typescript
import { nip19 } from 'nostr-core'

const { type, data } = nip19.decode('npub1abc...')
// type: 'npub', data: hex pubkey string

const { type, data } = nip19.decode('nprofile1...')
// type: 'nprofile', data: { pubkey: string, relays: string[] }
```

### Encode

```typescript
// Simple identifiers
const npub = nip19.npubEncode(pubkeyHex)          // Public key
const nsec = nip19.nsecEncode(secretKeyBytes)      // Secret key
const note = nip19.noteEncode(eventIdHex)          // Event ID

// Rich identifiers with relay hints
const nprofile = nip19.nprofileEncode({
  pubkey: pubkeyHex,
  relays: ['wss://relay.damus.io'],
})

const nevent = nip19.neventEncode({
  id: eventIdHex,
  relays: ['wss://relay.damus.io'],
  author: pubkeyHex,
})

const naddr = nip19.naddrEncode({
  identifier: 'my-article',
  pubkey: pubkeyHex,
  kind: 30023,
  relays: ['wss://relay.damus.io'],
})
```

**Prefixes:**
| Prefix | Type | Data |
|--------|------|------|
| `npub` | Public key | Hex string |
| `nsec` | Secret key | Uint8Array |
| `note` | Event ID | Hex string |
| `nprofile` | Profile | `{ pubkey, relays }` |
| `nevent` | Event | `{ id, relays, author }` |
| `naddr` | Address | `{ identifier, pubkey, kind, relays }` |

---

## Signer Interface

nostr-core provides a unified `Signer` interface for event signing. All three backends are interchangeable:

```typescript
import type { Signer } from 'nostr-core'

// All signers share the same API
async function publishNote(signer: Signer, text: string) {
  const pubkey = await signer.getPublicKey()
  const event = await signer.signEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: text,
  })
  // publish event to relay...
}
```

### Secret Key Signer

```typescript
import { generateSecretKey, createSecretKeySigner } from 'nostr-core'

const sk = generateSecretKey()
const signer = createSecretKeySigner(sk)

const pubkey = await signer.getPublicKey()
const signed = await signer.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello!',
})

// NIP-04 encryption
const encrypted04 = await signer.nip04!.encrypt(recipientPubkey, 'secret message')

// NIP-44 encryption (recommended)
const encrypted44 = await signer.nip44!.encrypt(recipientPubkey, 'secret message')
```

---

## Browser Extension Signing (NIP-07)

Wraps `window.nostr` from browser extensions (nos2x, Alby, etc.) into the `Signer` interface:

```typescript
import { Nip07Signer, getExtension } from 'nostr-core'

// Check if extension is available
try {
  const ext = getExtension()  // returns window.nostr or throws
} catch {
  console.error('No NIP-07 extension found')
}

// Create a signer from the extension
const signer = new Nip07Signer()  // throws Nip07NotAvailableError if no extension

const pubkey = await signer.getPublicKey()
const signed = await signer.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Signed by browser extension!',
})

// NIP-04 encryption (if supported by extension)
const encrypted04 = await signer.nip04.encrypt(recipientPubkey, 'secret')
const decrypted04 = await signer.nip04.decrypt(senderPubkey, encrypted04)

// NIP-44 encryption (if supported by extension - recommended)
const encrypted44 = await signer.nip44.encrypt(recipientPubkey, 'secret')
const decrypted44 = await signer.nip44.decrypt(senderPubkey, encrypted44)

// Relay list (if supported by extension)
const relays = await signer.getRelays()
// { "wss://relay.damus.io": { read: true, write: true }, ... }
```

**Error classes:**
| Class | Code | Description |
|-------|------|-------------|
| `Nip07Error` | `NIP07_ERROR` | Base error for NIP-07 operations |
| `Nip07NotAvailableError` | `NIP07_NOT_AVAILABLE` | `window.nostr` is undefined |

**Global Window augmentation:** Importing from nostr-core automatically types `window.nostr` as `Nip07Extension | undefined`.

---

## Remote Signing (NIP-46 / Nostr Connect)

Delegates signing to a remote signer (e.g. nsecBunker) over relays using NIP-04 encrypted kind `24133` events. Supports `nostrconnect://` and `bunker://` URI prefixes, multiple relays, and optional secret for authentication:

```typescript
import { NostrConnect, parseConnectionURI } from 'nostr-core'

// From a nostrconnect:// URI
const signer = new NostrConnect('nostrconnect://<remote-pubkey>?relay=wss://relay.example.com')

// From a bunker:// URI (also supported)
const signer = new NostrConnect('bunker://<remote-pubkey>?relay=wss://relay1.example.com&relay=wss://relay2.example.com&secret=mytoken')

// Or from options
const signer = new NostrConnect({
  remotePubkey: '<hex-pubkey>',
  relayUrls: ['wss://relay1.example.com', 'wss://relay2.example.com'],
  secretKey: mySecretKey,  // optional - random key generated if omitted
  secret: 'mytoken',      // optional - sent with connect handshake
})

// Connect (tries each relay until one succeeds + NIP-46 handshake)
await signer.connect()

// Use like any other Signer
const pubkey = await signer.getPublicKey()
const signed = await signer.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Signed by remote signer!',
})

// NIP-04 encryption via remote signer
const encrypted04 = await signer.nip04.encrypt(recipientPubkey, 'secret')

// NIP-44 encryption via remote signer (recommended)
const encrypted44 = await signer.nip44.encrypt(recipientPubkey, 'secret')

// Get relay list from remote signer
const relays = await signer.getRelays()

// Discover supported methods
const methods = await signer.describe()  // ['connect', 'sign_event', 'nip44_encrypt', ...]

// Graceful disconnect (sends disconnect RPC + closes relay)
await signer.disconnect()

// Or immediate cleanup (no disconnect RPC)
signer.close()
```

### Configuration

```typescript
signer.timeout = 30000  // RPC timeout in ms (default: 60000)
```

### Parse a URI without connecting

```typescript
import { parseConnectionURI } from 'nostr-core'

const { remotePubkey, relayUrls, secret, appMetadata } = parseConnectionURI('nostrconnect://<pubkey>?relay=wss://...')
// relayUrls: string[] - supports multiple relay params
// secret: string | undefined
// appMetadata: { name?, url?, image? } | undefined
```

**Error classes:**
| Class | Code | Description |
|-------|------|-------------|
| `Nip46Error` | `NIP46_ERROR` | Base error for NIP-46 operations |
| `Nip46TimeoutError` | `NIP46_TIMEOUT` | Remote signer didn't respond in time |
| `Nip46ConnectionError` | `NIP46_CONNECTION_ERROR` | Failed to connect or handshake |
| `Nip46RemoteError` | `NIP46_REMOTE_ERROR` | Remote signer returned an error |

---

## Utilities

```typescript
import { normalizeURL, bytesToHex, hexToBytes, randomBytes } from 'nostr-core'

// Normalize relay URLs (trailing slash, protocol)
const url = normalizeURL('wss://relay.example.com/')

// Hex ↔ Bytes conversion
const bytes = hexToBytes('abcdef...')  // Uint8Array
const hex = bytesToHex(bytes)          // string

// Cryptographically secure random bytes
const random = randomBytes(32)         // Uint8Array(32)
```

---

## NWC Protocol Internals (Reference)

For building custom NWC implementations:

| Event Kind | Description |
|------------|-------------|
| `13194` | Wallet info (published by wallet service) |
| `23194` | NWC request (client → wallet) |
| `23195` | NWC response (wallet → client) |
| `23196` | Notification (NIP-04 encrypted) |
| `23197` | Notification (NIP-44 encrypted) |

Request flow:
1. Client creates a kind `23194` event with encrypted JSON content (method + params)
2. Event is signed with the client secret key and published to the relay
3. Wallet service receives the event, decrypts, executes, and publishes a kind `23195` response
4. Client decrypts the response and returns the result
