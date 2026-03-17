---
name: nostr-primitives
description: Use nostr-core's low-level Nostr protocol primitives to build custom applications. Covers 39 NIPs including key generation, event signing, relay connections, encryption (NIP-04/NIP-44), gift wrapping (NIP-59), relay metadata (NIP-65), private DMs (NIP-17), bech32 encoding (NIP-19), URI scheme (NIP-21), threads (NIP-10), reactions (NIP-25), deletion (NIP-09), comments (NIP-22), long-form content (NIP-23), lists (NIP-51), zaps (NIP-57), badges (NIP-58), groups (NIP-29), DNS verification (NIP-05), relay info (NIP-11), HTTP auth (NIP-98), and more.
user-invocable: true
argument-hint: "[keys, events, relays, encryption, giftwrap, relaylist, dm, encoding, signer, nip07, nip46, deletion, threads, reactions, comments, articles, lists, zaps, badges, calendars, zapgoals, groups, dns, auth, emoji, uri, lnurl, lnurl-pay, or lnurl-withdraw]"
---

# Nostr Protocol Primitives with nostr-core

You are helping the user build custom Nostr applications using the low-level primitives exported by **nostr-core**. These are the same building blocks used internally by the NWC client.

**When to use this skill:** The user wants to build something beyond standard wallet operations - custom Nostr events, direct relay communication, encrypted messaging, identity management, delegated signing via browser extensions (NIP-07) or remote signers (NIP-46), social interactions (reactions, threads, comments), content publishing, lists, zaps, badges, groups, DNS verification, or HTTP authentication.

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

### NIP-02: Follow List (Contact List)

```ts
import { nip02 } from 'nostr-core'

// Create follow list
const followList = nip02.createFollowListEvent(
  [{ pubkey: 'abc...', relay: 'wss://relay.example.com', petname: 'alice' }],
  secretKey,
)

// Parse follow list
const contacts = nip02.parseFollowList(event) // ContactEntry[]
const follows = nip02.isFollowing(event, pubkey) // boolean
const pubkeys = nip02.getFollowedPubkeys(event) // string[]
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

### NIP-18: Reposts

```ts
import { nip18 } from 'nostr-core'

// Repost a text note (kind 6)
const repost = nip18.createRepostEvent(
  { id: noteId, pubkey: authorPk },
  secretKey,
  originalEvent,
)

// Generic repost (kind 16)
const generic = nip18.createRepostEvent(
  { id: eventId, pubkey: authorPk, kind: 30023 },
  secretKey,
)

const parsed = nip18.parseRepost(repost) // { targetEventId, targetKind, embeddedEvent? }
```

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

## Relay List Metadata (NIP-65)

Discover and publish user relay preferences. Kind 10002 replaceable events advertise which relays a user reads from and writes to.

```typescript
import { nip65, RelayPool } from 'nostr-core'

const pool = new RelayPool()

// Look up another user's relay list
const events = await pool.querySync(
  ['wss://purplepag.es'],
  { kinds: [10002], authors: [userPubkey] },
)

if (events.length > 0) {
  const relays = nip65.parseRelayList(events[0])
  // [{ url: 'wss://relay.damus.io', read: true, write: true }, ...]

  const writeRelays = nip65.getWriteRelays(relays) // fetch their events here
  const readRelays = nip65.getReadRelays(relays)   // send mentions/DMs here
}
```

### Publish your own relay list

```typescript
import { nip65, generateSecretKey } from 'nostr-core'

const sk = generateSecretKey()

// Create and sign a kind 10002 event
const event = nip65.createRelayListEvent(
  [
    { url: 'wss://relay.damus.io', read: true, write: true },
    { url: 'wss://nos.lol', read: true, write: false },
    { url: 'wss://relay.nostr.band', read: false, write: true },
  ],
  sk,
)

// Publish to well-known indexer relays for discoverability
await pool.publish(['wss://purplepag.es', 'wss://relay.damus.io'], event)
```

### Using with a Signer (unsigned template)

```typescript
const template = nip65.createRelayListEventTemplate([
  { url: 'wss://relay.damus.io', read: true, write: true },
])
const signed = await signer.signEvent(template)
```

**Routing rules:**
- To **fetch a user's events** → query their **write** relays
- To **send a user a mention/DM** → publish to their **read** relays
- No marker on an `r` tag = bidirectional (both read and write)
- Keep lists small (2-4 relays per category)

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

## DNS-Based Verification (NIP-05)

```typescript
import { nip05 } from 'nostr-core'

// Query a NIP-05 address
const result = await nip05.queryNip05('bob@example.com')
// { pubkey: 'hex...', relays: ['wss://...'] }

// Verify address matches expected pubkey
const valid = await nip05.verifyNip05('bob@example.com', expectedPubkey) // boolean

// Parse address parts
const { name, domain } = nip05.parseNip05Address('bob@example.com')
```

---

## Key Derivation (NIP-06)

Derive Nostr keys from BIP-39 mnemonic phrases:

```typescript
import { nip06 } from 'nostr-core'

const mnemonic = nip06.generateMnemonic()    // 12 words (default)
const mnemonic24 = nip06.generateMnemonic(24) // 24 words

const valid = nip06.validateMnemonic(mnemonic) // boolean

// Derive key pair (path: m/44'/1237'/0'/0/0)
const { secretKey, publicKey } = nip06.mnemonicToKey(mnemonic)

// Derive multiple accounts
const account0 = nip06.mnemonicToKey(mnemonic, 0)
const account1 = nip06.mnemonicToKey(mnemonic, 1)

// With passphrase
const key = nip06.mnemonicToKey(mnemonic, 0, 'my-passphrase')
```

---

## Event Deletion (NIP-09)

```typescript
import { nip09 } from 'nostr-core'

// Delete specific events
const deletion = nip09.createDeletionEvent(
  {
    targets: [
      { type: 'event', id: 'abc123...' },
      { type: 'address', address: '30023:pubkey:my-article' },
    ],
    reason: 'Posted by mistake',
  },
  secretKey,
)

// Parse a deletion event
const parsed = nip09.parseDeletion(deletion)
// { eventIds: [...], addresses: [...], kinds: [...], reason: '...' }

// Check if a deletion targets a specific event
nip09.isDeletionOf(deletion, targetEvent) // boolean
```

---

## Thread References (NIP-10)

```typescript
import { nip10 } from 'nostr-core'

// Parse thread structure from a reply event
const thread = nip10.parseThread(event)
// { root: { id, relay? }, reply: { id, relay? }, mentions: [...], profiles: [...] }

// Build thread tags for a new reply
const tags = nip10.buildThreadTags({
  root: { id: rootEventId, relay: 'wss://relay.damus.io' },
  reply: { id: parentEventId },
  profiles: [authorPubkey],
})
```

---

## Relay Information (NIP-11)

```typescript
import { nip11 } from 'nostr-core'

const info = await nip11.fetchRelayInfo('wss://relay.damus.io')
console.log(info.name, info.description, info.supported_nips)

// Check if relay supports a specific NIP
nip11.supportsNip(info, 42) // boolean (AUTH support)
nip11.supportsNip(info, 44) // boolean (NIP-44 encryption)
```

---

### NIP-13: Proof of Work

```ts
import { nip13 } from 'nostr-core'

// Mine PoW
const mined = nip13.minePow(template, 16) // 16 bits difficulty
const event = finalizeEvent(mined, secretKey)

// Verify PoW
const difficulty = nip13.getPowDifficulty(event) // leading zero bits
const isValid = nip13.verifyPow(event, 16) // checks actual + committed
```

---

## nostr: URI Scheme (NIP-21)

```typescript
import { nip21 } from 'nostr-core'

const uri = nip21.encodeNostrURI('npub1abc...')   // 'nostr:npub1abc...'
const decoded = nip21.decodeNostrURI(uri)          // { type: 'npub', data: '...' }
const valid = nip21.isNostrURI('nostr:npub1abc..') // boolean
```

---

## Comments (NIP-22)

```typescript
import { nip22 } from 'nostr-core'

// Comment on an event
const comment = nip22.createCommentEvent(
  'Great article!',
  {
    rootType: 'event',
    rootId: articleEventId,
    rootKind: 30023,
    rootPubkey: authorPk,
  },
  secretKey,
)

// Reply to a comment
const reply = nip22.createCommentEvent(
  'I agree!',
  {
    rootType: 'event',
    rootId: articleEventId,
    rootKind: 30023,
    rootPubkey: authorPk,
    parentType: 'event',
    parentId: comment.id,
    parentKind: 1111,
    parentPubkey: commenterPk,
  },
  secretKey,
)

// Parse a comment
const parsed = nip22.parseComment(comment)
// { rootType: 'event', rootId, rootKind, content, ... }
```

---

## Long-form Content (NIP-23)

```typescript
import { nip23 } from 'nostr-core'

// Create an article (kind 30023)
const article = nip23.createLongFormEvent({
  identifier: 'my-article',
  title: 'My Article',
  summary: 'A brief summary',
  image: 'https://example.com/cover.jpg',
  content: '# Full markdown content...',
  hashtags: ['nostr', 'bitcoin'],
  publishedAt: Math.floor(Date.now() / 1000),
}, secretKey)

// Create a draft (kind 30024)
const draft = nip23.createLongFormEvent({
  identifier: 'my-draft',
  content: 'Work in progress...',
  isDraft: true,
}, secretKey)

// Parse article
const parsed = nip23.parseLongForm(article)
// { identifier, title, content, hashtags, isDraft: false, ... }
```

---

## Extra Metadata (NIP-24)

```typescript
import { nip24 } from 'nostr-core'

// Parse extended fields from kind 0 metadata
const meta = nip24.parseExtendedMetadata(metadataEvent)
// { display_name?, website?, banner?, bot?, birthday?, ... }

// Build metadata content JSON
const content = nip24.buildMetadataContent({ display_name: 'Bob', website: 'https://...' })

// Parse/build universal tags (r, t, title)
const tags = nip24.parseUniversalTags(event)  // { references?, hashtags?, title? }
const tagArray = nip24.buildUniversalTags({ hashtags: ['nostr'], references: ['https://...'] })
```

---

## Reactions (NIP-25)

```typescript
import { nip25 } from 'nostr-core'

// Like an event
const like = nip25.createReactionEvent(
  { targetEvent: { id: eventId, pubkey: authorPk }, content: '+' },
  secretKey,
)

// Custom emoji reaction
const emoji = nip25.createReactionEvent(
  { targetEvent: { id: eventId, pubkey: authorPk }, content: '🤙' },
  secretKey,
)

// Parse reaction
const parsed = nip25.parseReaction(like)
// { targetEventId, targetPubkey, content: '+', isPositive: true, isNegative: false, emoji: undefined }
```

---

## Text References (NIP-27)

```typescript
import { nip27 } from 'nostr-core'

const content = 'Check out nostr:npub1abc... and nostr:nevent1def...'

// Extract references
const refs = nip27.extractReferences(content)
// [{ uri: 'nostr:npub1abc...', decoded: { type: 'npub', data: '...' }, start, end }]

// Replace references with HTML links
const html = nip27.replaceReferences(content, ref => {
  if (ref.decoded.type === 'npub') return `<a href="${ref.uri}">@${ref.decoded.data.slice(0,8)}</a>`
  return ref.uri
})
```

---

### NIP-28: Public Chat

```ts
import { nip28 } from 'nostr-core'

// Create channel (kind 40)
const channel = nip28.createChannelEvent(
  { name: 'General', about: 'Discussion' },
  secretKey,
)

// Send message (kind 42)
const msg = nip28.createChannelMessageEvent(channel.id, 'Hello!', secretKey)

// Reply to message
const reply = nip28.createChannelMessageEvent(channel.id, 'Reply!', secretKey, undefined, msg.id)

// Parse
const meta = nip28.parseChannelMetadata(event) // { name, about?, picture? }
const message = nip28.parseChannelMessage(event) // { channelId, content, replyTo? }
```

---

## Relay-based Groups (NIP-29)

```typescript
import { nip29 } from 'nostr-core'

// Send a group chat message
const msg = nip29.createGroupChatEvent('group-id', 'Hello!', secretKey)

// Reply to a message
const reply = nip29.createGroupChatEvent('group-id', 'Hi back!', secretKey, parentMsgId)

// Parse group metadata (kind 39000)
const meta = nip29.parseGroupMetadata(event) // { id, name, about, picture, isOpen, isPublic }

// Parse group members (kind 39002)
const members = nip29.parseGroupMembers(event) // string[] of pubkeys

// Parse group admins (kind 39001)
const admins = nip29.parseGroupAdmins(event) // [{ pubkey, permissions }]
```

---

## Custom Emoji (NIP-30)

```typescript
import { nip30 } from 'nostr-core'

// Parse emoji tags from an event
const emojis = nip30.parseCustomEmojis(event)
// [{ shortcode: 'sats', url: 'https://...' }]

// Build emoji tags
const tags = nip30.buildEmojiTags([{ shortcode: 'sats', url: 'https://...' }])
// [['emoji', 'sats', 'https://...']]

// Extract shortcodes from text
const codes = nip30.extractEmojiShortcodes('Hello :sats: world :zap:')
// ['sats', 'zap']
```

---

## Unknown Events / Alt Tag (NIP-31)

```typescript
import { nip31 } from 'nostr-core'

// Add alt tag for unknown event kinds
const tags = nip31.addAltTag(existingTags, 'This is a poll event')

// Get alt tag from event
const alt = nip31.getAltTag(event) // string | undefined
```

---

### NIP-36: Sensitive Content / Content Warning

```ts
import { nip36 } from 'nostr-core'

const tags = nip36.addContentWarning([], 'spoiler')
const reason = nip36.getContentWarning(event) // 'spoiler' | undefined
const hasCw = nip36.hasContentWarning(event) // boolean
```

---

### NIP-40: Expiration Timestamp

```ts
import { nip40 } from 'nostr-core'

const oneHour = Math.floor(Date.now() / 1000) + 3600
const tags = nip40.addExpiration([], oneHour)
const exp = nip40.getExpiration(event) // number | undefined
const expired = nip40.isExpired(event) // boolean
```

---

## Client Authentication (NIP-42)

```typescript
import { nip42, Relay } from 'nostr-core'

const relay = new Relay('wss://relay.example.com')
await relay.connect()

// Handle auth challenges
relay.onauth = async (challenge) => {
  const authEvent = nip42.createAuthEvent(
    { relay: relay.url, challenge },
    secretKey,
  )
  await relay.auth(authEvent)
}

// Server-side verification
const valid = nip42.verifyAuthEvent(event, challenge, relayUrl) // boolean
```

---

### NIP-48: Proxy Tags

```ts
import { nip48 } from 'nostr-core'

const tags = nip48.addProxyTag([], 'https://mastodon.social/@user/123', 'activitypub')
const proxies = nip48.getProxyTags(event) // [{ id, protocol }]
const bridged = nip48.isProxied(event) // boolean
const ap = nip48.getProxyByProtocol(event, 'activitypub') // ProxyTag | undefined
```

---

### NIP-50: Search

```ts
import { nip50 } from 'nostr-core'

const filter = nip50.buildSearchFilter('bitcoin', { kinds: [1], limit: 20 })
// { kinds: [1], limit: 20, search: 'bitcoin' }

const parsed = nip50.parseSearchQuery('bitcoin include:spam language:en')
// { text: 'bitcoin', modifiers: { include: 'spam', language: 'en' } }

const query = nip50.buildSearchQuery('bitcoin', { language: 'en' })
```

---

## Lists (NIP-51)

```typescript
import { nip51 } from 'nostr-core'

// Create a mute list with private items
const list = nip51.createListEvent({
  kind: 10000,
  publicItems: [{ tag: 'p', value: pubkeyToMute }],
  privateItems: [{ tag: 'p', value: secretMute }], // NIP-44 encrypted
}, secretKey)

// Parse list (decrypt private items with secret key)
const parsed = nip51.parseList(list, secretKey)
// { kind: 10000, publicItems: [...], privateItems: [...] }

// Helpers
const pubkeys = nip51.getPubkeys(parsed)
const eventIds = nip51.getEventIds(parsed)
const hashtags = nip51.getHashtags(parsed)
```

---

### NIP-56: Reporting

```ts
import { nip56 } from 'nostr-core'

// Report a user
const report = nip56.createReportEvent(
  [{ type: 'pubkey', pubkey: 'bad-pk', reportType: 'spam' }],
  secretKey,
)

// Report an event
const eventReport = nip56.createReportEvent(
  [{ type: 'event', eventId: 'id', authorPubkey: 'pk', reportType: 'nudity' }],
  secretKey,
  'Explicit content',
)

const parsed = nip56.parseReport(reportEvent) // { targets, content }
```

---

## LNURL Protocol (LUD-01/03/06/09/10/12/17/18/20/21)

Encode, decode, and interact with LNURL services.

### Encoding / Decoding

```typescript
import { lnurl } from 'nostr-core'

// Encode a URL to LNURL bech32
const encoded = lnurl.encodeLnurl('https://service.com/api?q=pay') // 'LNURL1...'

// Decode LNURL back to URL
const url = lnurl.decodeLnurl('LNURL1...') // 'https://service.com/api?q=pay'

// Check if a string is a valid LNURL
lnurl.isLnurl('LNURL1...') // true

// Resolve any LNURL-compatible input (LNURL, lightning address, raw URL)
const resolvedUrl = lnurl.resolveUrl('LNURL1...')
```

### Pay Requests (LUD-06/12/17/18)

```typescript
import { lnurl } from 'nostr-core'

// Fetch pay request from LNURL
const payReq = await lnurl.fetchPayRequest('LNURL1...')
// { callback, minSendable, maxSendable, metadata, tag: 'payRequest', ... }

// Parse metadata
const metadata = lnurl.parseLnurlMetadata(payReq.metadata)
// [['text/plain', 'Pay to service'], ['image/png;base64', '...']]

// Request an invoice
const { invoice, successAction } = await lnurl.requestInvoice({
  payRequest: payReq,
  amountMsats: 10000,
  comment: 'Thanks!', // optional (LUD-12)
})

// Handle success action (LUD-09/10)
if (successAction) {
  const action = lnurl.parseSuccessAction(successAction)
  if (action.tag === 'aes') {
    const decrypted = lnurl.decryptAesSuccessAction(action, preimage)
  }
}
```

### Withdraw Requests (LUD-03)

```typescript
import { lnurl } from 'nostr-core'

// Fetch withdraw request
const withdrawReq = await lnurl.fetchWithdrawRequest('LNURL1...')
// { callback, k1, minWithdrawable, maxWithdrawable, defaultDescription, tag: 'withdrawRequest' }

// Submit with your invoice
await lnurl.submitWithdrawRequest({
  withdrawRequest: withdrawReq,
  invoice: 'lnbc10u1pj...',
})
```

### Payment Verification (LUD-21)

```typescript
import { lnurl } from 'nostr-core'

const valid = lnurl.verifyPayment(payResponse) // boolean
```

---

## Lightning Zaps (NIP-57)

```typescript
import { nip57 } from 'nostr-core'

// Create a zap request
const zapReq = nip57.createZapRequestEvent({
  recipientPubkey: authorPk,
  amount: 21000,          // millisats
  relays: ['wss://relay.damus.io'],
  content: 'Great post!',
  eventId: targetEventId, // optional
}, secretKey)

// Parse a zap receipt (kind 9735)
const receipt = nip57.parseZapReceipt(zapReceiptEvent)
// { recipientPubkey, senderPubkey, amount, bolt11, description, preimage? }

// Validate a zap receipt
const valid = nip57.validateZapReceipt(receipt, originalRequest?)

// Fetch zap invoice from LNURL
const invoice = await nip57.fetchZapInvoice({ lnurl, zapRequest, amount })
```

---

## Badges (NIP-58)

```typescript
import { nip58 } from 'nostr-core'

// Create a badge definition (kind 30009)
const badge = nip58.createBadgeDefinitionEvent({
  identifier: 'early-adopter',
  name: 'Early Adopter',
  description: 'Joined before 2024',
  image: 'https://example.com/badge.png',
}, secretKey)

// Award a badge (kind 8)
const award = nip58.createBadgeAwardEvent({
  badgeAddress: `30009:${pubkey}:early-adopter`,
  recipients: [recipientPk1, recipientPk2],
}, secretKey)

// Display badges on profile (kind 30008)
const profile = nip58.createProfileBadgesEvent([
  { badgeAddress: `30009:${issuerPk}:early-adopter`, awardEventId: awardId },
], secretKey)

// Parse
const def = nip58.parseBadgeDefinition(badge)     // { identifier, name, description, ... }
const awd = nip58.parseBadgeAward(award)           // { badgeAddress, recipients }
const badges = nip58.parseProfileBadges(profile)   // [{ badgeAddress, awardEventId }]

// Badge Request Flow (custom extension)
// Request a badge with proof-of-payment (kind 8433)
const request = nip58.createBadgeRequestTemplate({
  badgeAddress: `30009:${issuerPk}:verified`,
  proof: { type: 'payment', preimage: 'abc123...', invoice: 'lnbc...' },
  content: 'Requesting verified badge',
})

// Issuer accepts or rejects (kind 8434 / 8435)
const acceptance = nip58.createBadgeAcceptanceEvent({
  requestEventId: requestEvent.id,
  badgeAddress: `30009:${issuerPk}:verified`,
  recipientPubkey: requesterPk,
}, issuerSk)

const rejection = nip58.createBadgeRejectionEvent({
  requestEventId: requestEvent.id,
  badgeAddress: `30009:${issuerPk}:verified`,
  reason: 'Invalid proof',
}, issuerSk)

// Extract proof from request
const proof = nip58.extractBadgeProof(requestEvent)
// { type: 'payment', preimage: '...', invoice: '...' }

// Check if a user has been awarded a badge
const awarded = nip58.hasBeenAwarded(userPk, badgeAwardEvents) // boolean
```

---

## Calendar Events (NIP-52)

```typescript
import { nip52 } from 'nostr-core'

// Date-based calendar event (kind 31922) — holidays, all-day events
const dateEvent = nip52.createDateBasedCalendarEvent({
  identifier: 'team-retreat-2026',
  title: 'Team Retreat',
  start: '2026-06-15',
  end: '2026-06-18',
  content: 'Annual team retreat at the lake house',
  locations: ['Lake Tahoe, CA'],
  participants: [{ pubkey: teammatePk, role: 'attendee' }],
  hashtags: ['retreat', 'team'],
}, secretKey)

// Time-based calendar event (kind 31923) — meetings, calls
const timeEvent = nip52.createTimeBasedCalendarEvent({
  identifier: 'standup-2026-03-17',
  title: 'Daily Standup',
  start: 1742212800,  // Unix timestamp
  end: 1742214600,
  startTzid: 'America/New_York',
  locations: ['https://meet.example.com/standup'],
  participants: [{ pubkey: teammatePk, relay: 'wss://relay.example.com', role: 'speaker' }],
}, secretKey)

// Calendar collection (kind 31924)
const calendar = nip52.createCalendarEvent({
  identifier: 'work-calendar',
  title: 'Work Calendar',
  eventAddresses: [
    nip52.buildCalendarEventAddress(31922, myPk, 'team-retreat-2026'),
    nip52.buildCalendarEventAddress(31923, myPk, 'standup-2026-03-17'),
  ],
}, secretKey)

// RSVP to a calendar event (kind 31925)
const rsvp = nip52.createCalendarEventRSVP({
  identifier: 'rsvp-retreat',
  calendarEventAddress: `31922:${organizerPk}:team-retreat-2026`,
  status: 'accepted',
  freebusy: 'busy',
  calendarEventAuthor: organizerPk,
  content: 'Looking forward to it!',
}, secretKey)

// Parse events
const parsed = nip52.parseDateBasedCalendarEvent(event) // { identifier, title, start, end, ... }
const timeParsed = nip52.parseTimeBasedCalendarEvent(event)
const cal = nip52.parseCalendar(calendarEvent)
const rsvpParsed = nip52.parseCalendarEventRSVP(rsvpEvent) // { status, freebusy, ... }
```

---

## Zap Goals (NIP-75)

```typescript
import { nip75 } from 'nostr-core'

// Create a fundraising goal (kind 9041)
const goal = nip75.createZapGoalEvent({
  content: 'Help fund our open source relay!',
  amount: 1000000000, // 1 BTC in millisats
  relays: ['wss://relay.damus.io'],
  closedAt: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
  image: 'https://example.com/goal.png',
  summary: 'Building a free public relay',
  beneficiaries: [
    { pubkey: dev1Pk, relay: 'wss://relay.damus.io', weight: '3' },
    { pubkey: dev2Pk, relay: 'wss://relay.damus.io', weight: '1' },
  ],
}, secretKey)

// Parse a zap goal
const parsed = nip75.parseZapGoal(goalEvent)
// { content, amount, relays, closedAt, beneficiaries, ... }

// Check if goal is still open
nip75.isZapGoalOpen(goalEvent) // boolean

// Calculate progress from zap receipts
const progress = nip75.calculateZapGoalProgress(zapReceipts)
console.log(`${progress / 1000} sats raised of ${parsed.amount / 1000} target`)

// Link a goal to an addressable event
const goalTag = nip75.buildGoalTag(goalEvent.id, 'wss://relay.damus.io')
// ['goal', '<event-id>', 'wss://relay.damus.io']
```

---

## HTTP Auth (NIP-98)

```typescript
import { nip98 } from 'nostr-core'

// Create HTTP auth event for an API request
const authEvent = nip98.createHttpAuthEvent(
  { url: 'https://api.example.com/upload', method: 'POST', body: fileBytes },
  secretKey,
)

// Get Authorization header
const header = nip98.getAuthorizationHeader(authEvent) // "Nostr <base64>"

// Use with fetch
const res = await fetch('https://api.example.com/upload', {
  method: 'POST',
  headers: { Authorization: header },
  body: fileBytes,
})

// Server-side verification
const valid = nip98.verifyHttpAuthEvent(authEvent, { url, method, body }) // boolean
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
