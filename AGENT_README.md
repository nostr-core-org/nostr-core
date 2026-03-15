# nostr-core - Agent Integration Guide

Dead-simple, vendor-neutral Nostr client for JavaScript and TypeScript. Control any Lightning wallet via NIP-47, sign events with browser extensions (NIP-07), delegate signing to remote signers (NIP-46), discover user relays (NIP-65), and send private encrypted messages (NIP-17/NIP-59).

**Package:** `nostr-core` (npm)
**Runtime:** Node.js 18+, Deno, Bun, Cloudflare Workers
**Module:** ESM only

---

## Why nostr-core for Agents?

- **No browser or UI required** - everything is programmatic via a single connection string
- **No OAuth, no API keys** - authentication is a `nostr+walletconnect://` URI containing all credentials
- **Vendor-neutral** - works with any NWC-compatible wallet (Alby, Mutiny, LNbits, Coinos, etc.)
- **Stateless interactions** - connect, execute operations, close. No session management
- **Machine-readable errors** - typed error hierarchy with `code` properties for programmatic handling
- **Free and open source** - MIT license, no usage fees (Lightning network fees apply to payments)

---

## Authentication

nostr-core uses a **connection string** for authentication. The string is provided by the user's NWC-compatible wallet.

### Connection String Format

```
nostr+walletconnect://<walletPubkey>?relay=<relayUrl>&secret=<hexOrNsec>
```

| Component | Description |
|-----------|-------------|
| `walletPubkey` | 64-char hex public key of the wallet service |
| `relay` | WebSocket relay URL (e.g. `wss://relay.example.com`) |
| `secret` | Client secret key (64-char hex or `nsec1...` bech32) |

### Connect and Verify

```javascript
import { NWC } from 'nostr-core'

const nwc = new NWC('nostr+walletconnect://ab1c2d3e...?relay=wss://relay.example.com&secret=abc123...')
await nwc.connect()

const info = await nwc.getInfo()
console.log('Connected to:', info.alias)
console.log('Supported methods:', info.methods)

nwc.close()
```

No registration endpoints exist. The user generates the connection string from their wallet app and provides it to the agent.

---

## API Reference

### connect()

Connects to the Nostr relay and auto-detects encryption (NIP-04 or NIP-44).

```javascript
const nwc = new NWC(connectionString)
await nwc.connect()
```

Must be called before any wallet operation. Throws `NWCConnectionError` on failure.

---

### getBalance()

Returns wallet balance in millisatoshis.

```javascript
const { balance } = await nwc.getBalance()
```

**Response:**
```json
{
  "balance": 250000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `balance` | `number` | Balance in millisatoshis (1 sat = 1000 msats) |

---

### payInvoice(invoice, amount?)

Pays a BOLT-11 Lightning invoice.

```javascript
const { preimage, fees_paid } = await nwc.payInvoice('lnbc10u1pj...')
```

For zero-amount invoices, pass amount in msats:

```javascript
const { preimage } = await nwc.payInvoice('lnbc1pj...', 5000)
```

**Response:**
```json
{
  "preimage": "e3b0c44298fc1c149afbf4c8996fb924",
  "fees_paid": 100
}
```

| Field | Type | Description |
|-------|------|-------------|
| `preimage` | `string` | Payment preimage (proof of payment) |
| `fees_paid` | `number?` | Routing fees in millisatoshis |

---

### makeInvoice(params)

Creates a Lightning invoice.

```javascript
const tx = await nwc.makeInvoice({
  amount: 10000,
  description: 'Coffee payment',
  expiry: 3600,
})
console.log('Invoice:', tx.invoice)
console.log('Payment hash:', tx.payment_hash)
```

**Request:**
```json
{
  "amount": 10000,
  "description": "Coffee payment",
  "expiry": 3600
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `number` | Yes | Amount in millisatoshis |
| `description` | `string` | No | Human-readable description |
| `description_hash` | `string` | No | SHA-256 hash of description |
| `expiry` | `number` | No | Expiry in seconds |

**Response:**
```json
{
  "type": "incoming",
  "state": "pending",
  "invoice": "lnbc100n1pj...",
  "payment_hash": "abc123def456...",
  "amount": 10000,
  "description": "Coffee payment",
  "created_at": 1700000000,
  "expires_at": 1700003600
}
```

---

### getInfo()

Returns wallet metadata.

```javascript
const info = await nwc.getInfo()
```

**Response:**
```json
{
  "alias": "My Lightning Wallet",
  "color": "#3399ff",
  "pubkey": "02abc123...",
  "network": "mainnet",
  "block_height": 820000,
  "block_hash": "00000000000000000002...",
  "methods": ["pay_invoice", "get_balance", "make_invoice", "list_transactions"],
  "notifications": ["payment_received", "payment_sent"]
}
```

---

### listTransactions(params?)

Lists past transactions with optional filtering.

```javascript
const { transactions } = await nwc.listTransactions({
  limit: 20,
  type: 'incoming',
})
```

**Request:**
```json
{
  "limit": 20,
  "type": "incoming"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | `number` | No | Start unix timestamp |
| `until` | `number` | No | End unix timestamp |
| `limit` | `number` | No | Max results |
| `offset` | `number` | No | Pagination offset |
| `unpaid` | `boolean` | No | Include unpaid invoices |
| `type` | `string` | No | `"incoming"` or `"outgoing"` |

**Response:**
```json
{
  "transactions": [
    {
      "type": "incoming",
      "state": "settled",
      "invoice": "lnbc...",
      "description": "Payment for coffee",
      "payment_hash": "abc123...",
      "preimage": "def456...",
      "amount": 10000,
      "fees_paid": 0,
      "settled_at": 1700000000,
      "created_at": 1699999900,
      "expires_at": 1700003600
    }
  ]
}
```

---

### payKeysend(params)

Sends a keysend payment directly to a node pubkey.

```javascript
const { preimage } = await nwc.payKeysend({
  amount: 1000,
  pubkey: '03abc123...',
  tlv_records: [
    { type: 7629169, value: 'podcast_guid_here' },
  ],
})
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `number` | Yes | Amount in millisatoshis |
| `pubkey` | `string` | Yes | Destination node public key |
| `preimage` | `string` | No | Custom preimage |
| `tlv_records` | `array` | No | TLV records `[{ type, value }]` |

---

### lookupInvoice(params)

Looks up an invoice by payment hash or invoice string.

```javascript
const tx = await nwc.lookupInvoice({ payment_hash: 'abc123...' })
// or
const tx = await nwc.lookupInvoice({ invoice: 'lnbc...' })
```

Returns a `Transaction` object (same shape as `listTransactions` entries).

---

### getBudget()

Returns the NWC spending budget information.

```javascript
const budget = await nwc.getBudget()
```

**Response:**
```json
{
  "used_budget": 50000,
  "total_budget": 1000000,
  "renews_at": 1700100000,
  "renewal_period": "monthly"
}
```

---

### signMessage(message)

Signs a message with the wallet's key.

```javascript
const { message, signature } = await nwc.signMessage('Hello, Nostr!')
```

**Response:**
```json
{
  "message": "Hello, Nostr!",
  "signature": "304402..."
}
```

---

### Notifications (Real-time Events)

Listen for incoming/outgoing payments in real-time.

#### Event Emitter Pattern

```javascript
nwc.on('payment_received', (notification) => {
  console.log(`Received ${notification.notification.amount} msats`)
})

nwc.on('payment_sent', (notification) => {
  console.log(`Sent ${notification.notification.amount} msats`)
})
```

#### Subscription Pattern

```javascript
const unsub = await nwc.subscribeNotifications((notification) => {
  console.log(notification.notification_type, notification.notification.amount)
}, ['payment_received'])

// Later: unsub()
```

| Notification Type | Description |
|-------------------|-------------|
| `payment_received` | Incoming payment settled |
| `payment_sent` | Outgoing payment completed |
| `hold_invoice_accepted` | Hold invoice accepted by payer |

---

### close()

Closes the relay connection, notification subscriptions, and clears all handlers.

```javascript
nwc.close()
```

Always call this when done.

---

### Configuration

```javascript
const nwc = new NWC(connectionString)
nwc.replyTimeout = 30000    // Wallet reply timeout in ms (default: 60000)
nwc.publishTimeout = 10000  // Relay publish timeout in ms (default: 5000)
```

---

## Error Handling

All errors extend `NWCError` with a `code` property.

```json
{
  "name": "NWCWalletError",
  "message": "Insufficient balance to complete payment",
  "code": "INSUFFICIENT_BALANCE"
}
```

| Error Class | Code | Meaning | Solution |
|-------------|------|---------|----------|
| `NWCWalletError` | Wallet-specific (e.g. `INSUFFICIENT_BALANCE`) | Wallet rejected the request | Check balance, verify invoice, reduce amount |
| `NWCPublishTimeoutError` | `PUBLISH_TIMEOUT` | Relay didn't acknowledge event | Check relay URL, retry with different relay |
| `NWCReplyTimeoutError` | `REPLY_TIMEOUT` | Wallet didn't respond in time | Increase `replyTimeout`, check wallet is online |
| `NWCPublishError` | `PUBLISH_ERROR` | Relay rejected the event | Check event format, try different relay |
| `NWCConnectionError` | `CONNECTION_ERROR` | Can't connect to relay | Verify relay URL, check network, call `connect()` first |
| `NWCDecryptionError` | `DECRYPTION_ERROR` | Can't decrypt wallet response | Connection string may be invalid or expired |

```javascript
import { NWCWalletError, NWCTimeoutError, NWCConnectionError } from 'nostr-core'

try {
  await nwc.payInvoice('lnbc...')
} catch (err) {
  if (err instanceof NWCWalletError) {
    // Wallet rejected: err.code has the reason
  } else if (err instanceof NWCTimeoutError) {
    // Timed out: err.code is 'PUBLISH_TIMEOUT' or 'REPLY_TIMEOUT'
  } else if (err instanceof NWCConnectionError) {
    // Not connected: call nwc.connect() first
  }
}
```

---

## Suggested Prompts for Human Interaction

Use these when your agent needs human input:

**Getting the connection string:**
> "I need your NWC connection string to connect to your Lightning wallet. You can find it in your wallet's settings under 'Nostr Wallet Connect' or 'NWC'. It starts with `nostr+walletconnect://`. Please paste it here."

**Confirming a payment:**
> "I'm about to pay an invoice for [amount] msats ([description]). Should I proceed?"

**Insufficient balance:**
> "Your wallet balance is [balance] msats, but the payment requires [amount] msats. Please add funds and try again."

**Wallet not responding:**
> "Your wallet isn't responding. Please check that your wallet app is open and connected to the internet, then let me know to retry."

---

## Tips for Agents

1. **Always call `nwc.close()` when done** - leaving connections open wastes resources and can cause issues
2. **Check `getInfo().methods`** before calling an operation - not all wallets support every method
3. **All amounts are in millisatoshis** - 1 satoshi = 1,000 millisatoshis. Confirm amounts with the user before paying
4. **Use `getBudget()` to check spending limits** - NWC connections often have budget caps set by the wallet owner
5. **Handle `NWCReplyTimeoutError` gracefully** - wallets may be offline. Default reply timeout is 60 seconds
6. **Connection strings are secrets** - never log or expose them. They contain the private key

---

## Signer Abstraction (NIP-07 & NIP-46)

nostr-core provides a unified `Signer` interface for event signing. All signers share the same API and support both NIP-04 and NIP-44 encryption:

```javascript
// getPublicKey() and signEvent() work the same way regardless of backend
const pubkey = await signer.getPublicKey()
const signed = await signer.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello Nostr!',
})

// NIP-04 encryption (all signers)
const encrypted04 = await signer.nip04.encrypt(recipientPubkey, 'secret')

// NIP-44 encryption (all signers - recommended)
const encrypted44 = await signer.nip44.encrypt(recipientPubkey, 'secret')
```

### Secret Key Signer

```javascript
import { generateSecretKey, createSecretKeySigner } from 'nostr-core'

const sk = generateSecretKey()
const signer = createSecretKeySigner(sk)
```

### Browser Extension Signer (NIP-07)

Wraps `window.nostr` from extensions like nos2x or Alby:

```javascript
import { Nip07Signer } from 'nostr-core'

const signer = new Nip07Signer() // throws Nip07NotAvailableError if no extension
```

### Remote Signer (NIP-46 / Nostr Connect)

Delegates signing to a remote signer (e.g. nsecBunker) over relays. Supports `nostrconnect://` and `bunker://` URIs, multiple relays, and optional secret for authentication:

```javascript
import { NostrConnect } from 'nostr-core'

// From nostrconnect:// or bunker:// URI
const signer = new NostrConnect('nostrconnect://<pubkey>?relay=wss://relay.example.com')
// bunker:// also works: new NostrConnect('bunker://<pubkey>?relay=wss://...')

// Or from options (supports multiple relays)
const signer = new NostrConnect({
  remotePubkey: '<hex>',
  relayUrls: ['wss://relay1.example.com', 'wss://relay2.example.com'],
  secret: 'mytoken', // optional
})

await signer.connect() // tries each relay until one succeeds

// NIP-04 and NIP-44 encryption via remote signer
const encrypted04 = await signer.nip04.encrypt(recipientPubkey, 'secret')
const encrypted44 = await signer.nip44.encrypt(recipientPubkey, 'secret')

// Get relay list and discover supported methods
const relays = await signer.getRelays()
const methods = await signer.describe()

await signer.disconnect()
```

### Signer Error Classes

| Error Class | Code | Meaning |
|-------------|------|---------|
| `Nip07Error` | `NIP07_ERROR` | NIP-07 extension operation failed |
| `Nip07NotAvailableError` | `NIP07_NOT_AVAILABLE` | `window.nostr` is undefined |
| `Nip46Error` | `NIP46_ERROR` | NIP-46 operation failed |
| `Nip46TimeoutError` | `NIP46_TIMEOUT` | Remote signer didn't respond in time |
| `Nip46ConnectionError` | `NIP46_CONNECTION_ERROR` | Failed to connect or handshake |
| `Nip46RemoteError` | `NIP46_REMOTE_ERROR` | Remote signer returned an error |

---

## Reposts (NIP-18)

Create kind 6 (text note) and kind 16 (generic) reposts.

```javascript
import { nip18 } from 'nostr-core'

const repost = nip18.createRepostEvent(
  { id: noteId, pubkey: authorPk, relay: 'wss://relay.example.com' },
  secretKey,
  originalEvent, // embeds in content
)

const parsed = nip18.parseRepost(repost)
// { targetEventId, targetPubkey, targetKind: 1, embeddedEvent }
```

---

## Gift Wrapping & Private DMs (NIP-59 & NIP-17)

nostr-core supports multi-layer event encryption for metadata protection and private direct messages.

### Gift Wrap (NIP-59)

Wraps any event in three layers: **rumor** (unsigned content) → **seal** (kind 13) → **gift wrap** (kind 1059). Hides sender identity from relays and observers.

```javascript
import { nip59, generateSecretKey, getPublicKey } from 'nostr-core'

const senderSk = generateSecretKey()
const senderPk = getPublicKey(senderSk)

// Wrap
const rumor = nip59.createRumor({ kind: 1, tags: [], content: 'Secret', created_at: Math.floor(Date.now() / 1000) }, senderPk)
const seal = nip59.createSeal(rumor, senderSk, recipientPubkey)
const wrap = nip59.createWrap(seal, recipientPubkey)
// wrap.pubkey is ephemeral - real sender is hidden

// Unwrap
const unwrapped = nip59.unwrap(wrap, recipientSecretKey)
// unwrapped.pubkey = real sender, unwrapped.content = decrypted content
```

### Private Direct Messages (NIP-17)

End-to-end encrypted DMs with sender anonymity, built on NIP-59:

```javascript
import { nip17 } from 'nostr-core'

// Send
const wrap = nip17.wrapDirectMessage('Hello!', senderSecretKey, recipientPubkey)

// Receive
const dm = nip17.unwrapDirectMessage(wrap, recipientSecretKey)
// dm.sender, dm.content, dm.tags, dm.created_at, dm.id
```

---

## Relay List Metadata (NIP-65)

Discover and publish user relay preferences. Kind 10002 replaceable events advertise which relays a user reads from and writes to.

```javascript
import { nip65, RelayPool } from 'nostr-core'

const pool = new RelayPool()

// Look up a user's relay list
const events = await pool.querySync(
  ['wss://purplepag.es'],
  { kinds: [10002], authors: [userPubkey] },
)

if (events.length > 0) {
  const relays = nip65.parseRelayList(events[0])
  const writeRelays = nip65.getWriteRelays(relays) // fetch their events here
  const readRelays = nip65.getReadRelays(relays)   // send mentions/DMs here
}

// Publish your own relay list
const event = nip65.createRelayListEvent(
  [
    { url: 'wss://relay.damus.io', read: true, write: true },
    { url: 'wss://nos.lol', read: true, write: false },
    { url: 'wss://relay.nostr.band', read: false, write: true },
  ],
  secretKey,
)
await pool.publish(['wss://purplepag.es', 'wss://relay.damus.io'], event)
```

**Routing rules:**
- To **fetch a user's events** → query their **write** relays
- To **send a user a mention/DM** → publish to their **read** relays
- Keep lists small (2-4 relays per category)
- Publish kind 10002 to well-known indexer relays (e.g., `wss://purplepag.es`) for discoverability

---

## Follow List (NIP-02)

Create and parse kind 3 follow list events.

```javascript
import { nip02 } from 'nostr-core'

const followList = nip02.createFollowListEvent(
  [{ pubkey: 'abc...', relay: 'wss://relay.example.com', petname: 'alice' }],
  secretKey,
)

const contacts = nip02.parseFollowList(followList) // [{ pubkey, relay?, petname? }]
const follows = nip02.isFollowing(followList, 'abc...') // true
const pubkeys = nip02.getFollowedPubkeys(followList) // ['abc...']
```

---

## DNS-Based Verification (NIP-05)

Verify Nostr identities via DNS. Queries `https://<domain>/.well-known/nostr.json`.

```javascript
import { nip05 } from 'nostr-core'

// Query a NIP-05 address
const result = await nip05.queryNip05('bob@example.com')
console.log(result.pubkey) // hex pubkey
console.log(result.relays) // optional relay hints

// Verify address matches expected pubkey
const isValid = await nip05.verifyNip05('bob@example.com', expectedPubkey) // true/false
```

---

## Key Derivation from Mnemonic (NIP-06)

Derive Nostr keys from BIP-39 mnemonic phrases using path `m/44'/1237'/<account>'/0/0`.

```javascript
import { nip06 } from 'nostr-core'

const mnemonic = nip06.generateMnemonic() // 12-word phrase
const isValid = nip06.validateMnemonic(mnemonic) // true

const { secretKey, publicKey } = nip06.mnemonicToKey(mnemonic)
// Derive additional accounts
const account1 = nip06.mnemonicToKey(mnemonic, 1)
```

---

## Event Deletion (NIP-09)

Create kind 5 deletion events to request removal of previously published events.

```javascript
import { nip09 } from 'nostr-core'

const deletion = nip09.createDeletionEvent(
  { targets: [{ type: 'event', id: 'abc123...' }], reason: 'Posted by mistake' },
  secretKey,
)

const parsed = nip09.parseDeletion(deletion)
// { eventIds: ['abc123...'], addresses: [], kinds: [], reason: 'Posted by mistake' }
```

---

## Thread References (NIP-10)

Parse and build thread tags for text note replies.

```javascript
import { nip10 } from 'nostr-core'

// Parse thread from an event
const thread = nip10.parseThread(event)
// { root: { id, relay? }, reply: { id, relay? }, mentions: [...], profiles: [...] }

// Build thread tags for a reply
const tags = nip10.buildThreadTags({ root: { id: rootEventId }, reply: { id: parentEventId } })
```

---

## Relay Information (NIP-11)

Fetch relay metadata via HTTP.

```javascript
import { nip11 } from 'nostr-core'

const info = await nip11.fetchRelayInfo('wss://relay.damus.io')
console.log(info.name, info.supported_nips)

const hasAuth = nip11.supportsNip(info, 42) // true/false
```

---

## Proof of Work (NIP-13)

Mine and verify proof-of-work on events.

```javascript
import { nip13 } from 'nostr-core'

const mined = nip13.minePow(template, 16) // Mine 16 bits of difficulty
const event = finalizeEvent(mined, secretKey)

const difficulty = nip13.getPowDifficulty(event) // e.g. 17
const isValid = nip13.verifyPow(event, 16) // true
```

---

## nostr: URI Scheme (NIP-21)

Work with `nostr:` URIs.

```javascript
import { nip21 } from 'nostr-core'

const uri = nip21.encodeNostrURI('npub1abc...')   // 'nostr:npub1abc...'
const decoded = nip21.decodeNostrURI(uri)          // { type: 'npub', data: '...' }
const valid = nip21.isNostrURI('nostr:npub1abc..') // true
```

---

## Comments (NIP-22)

Create kind 1111 comments on any content type.

```javascript
import { nip22 } from 'nostr-core'

const comment = nip22.createCommentEvent(
  'Great article!',
  { rootType: 'event', rootId: eventId, rootKind: 30023, rootPubkey: authorPk },
  secretKey,
)
```

---

## Long-form Content (NIP-23)

Create and parse kind 30023/30024 articles.

```javascript
import { nip23 } from 'nostr-core'

const article = nip23.createLongFormEvent({
  identifier: 'my-article',
  title: 'My Article',
  content: 'Full markdown content...',
  hashtags: ['nostr', 'bitcoin'],
}, secretKey)

const parsed = nip23.parseLongForm(article) // { identifier, title, content, ... }
```

---

## Extra Metadata (NIP-24)

Parse extended profile fields and universal tags.

```javascript
import { nip24 } from 'nostr-core'

const meta = nip24.parseExtendedMetadata(kind0Event)
// { display_name?, website?, banner?, bot?, birthday?, ... }

const content = nip24.buildMetadataContent({ display_name: 'Alice', website: 'https://alice.com' })

const tags = nip24.parseUniversalTags(event) // { references?, hashtags?, title? }
const built = nip24.buildUniversalTags({ hashtags: ['nostr'], references: ['https://...'] })
```

---

## Reactions (NIP-25)

Create kind 7 reaction events.

```javascript
import { nip25 } from 'nostr-core'

const like = nip25.createReactionEvent(
  { targetEvent: { id: eventId, pubkey: authorPk }, content: '+' },
  secretKey,
)

const parsed = nip25.parseReaction(like)
// { targetEventId, targetPubkey, content: '+', isPositive: true, ... }
```

---

## Text Note References (NIP-27)

Extract and replace nostr: mentions in content.

```javascript
import { nip27 } from 'nostr-core'

const refs = nip27.extractReferences('Check out nostr:npub1abc...')
// [{ uri, decoded, start, end }]

const html = nip27.replaceReferences(content, ref => `<a href="${ref.uri}">@${ref.decoded.data.slice(0,8)}</a>`)
```

---

## Public Chat (NIP-28)

Channel-based public chat (kinds 40-44).

```javascript
import { nip28 } from 'nostr-core'

const channel = nip28.createChannelEvent(
  { name: 'General', about: 'General discussion' },
  secretKey,
)

const msg = nip28.createChannelMessageEvent(channel.id, 'Hello!', secretKey)
const parsed = nip28.parseChannelMessage(msg) // { channelId, content, replyTo? }
```

---

## Relay-based Groups (NIP-29)

Create group chat messages and admin actions.

```javascript
import { nip29 } from 'nostr-core'

const msg = nip29.createGroupChatEvent('group-id', 'Hello group!', secretKey)
const metadata = nip29.parseGroupMetadata(metadataEvent) // { id, name, about, ... }
const members = nip29.parseGroupMembers(membersEvent)     // string[]
```

---

## Custom Emoji (NIP-30)

Work with custom emoji tags.

```javascript
import { nip30 } from 'nostr-core'

const emojis = nip30.parseCustomEmojis(event) // [{ shortcode, url }]
const tags = nip30.buildEmojiTags([{ shortcode: 'sats', url: 'https://...' }])
const codes = nip30.extractEmojiShortcodes('Hello :sats: world') // ['sats']
```

---

## Content Warning (NIP-36)

Flag events with sensitive content warnings.

```javascript
import { nip36 } from 'nostr-core'

const tags = nip36.addContentWarning([], 'spoiler for movie')
const reason = nip36.getContentWarning(event) // 'spoiler for movie'
const hasCw = nip36.hasContentWarning(event) // true
```

---

## Expiration Timestamp (NIP-40)

Add expiration timestamps to events.

```javascript
import { nip40 } from 'nostr-core'

const oneHour = Math.floor(Date.now() / 1000) + 3600
const tags = nip40.addExpiration([], oneHour)
const expired = nip40.isExpired(event) // true/false
```

---

## Client Authentication (NIP-42)

Authenticate to relays. Includes relay.onauth callback and relay.auth() method.

```javascript
import { nip42, Relay } from 'nostr-core'

const relay = new Relay('wss://relay.example.com')
await relay.connect()

relay.onauth = async (challenge) => {
  const authEvent = nip42.createAuthEvent(
    { relay: relay.url, challenge },
    secretKey,
  )
  await relay.auth(authEvent)
}
```

---

## Proxy Tags (NIP-48)

Mark events bridged from other protocols.

```javascript
import { nip48 } from 'nostr-core'

const tags = nip48.addProxyTag([], 'https://mastodon.social/@user/123', 'activitypub')
const proxies = nip48.getProxyTags(event) // [{ id, protocol }]
const isProxy = nip48.isProxied(event) // true
```

---

## Search (NIP-50)

Build search filters for NIP-50 compatible relays.

```javascript
import { nip50 } from 'nostr-core'

const filter = nip50.buildSearchFilter('bitcoin lightning', { kinds: [1], limit: 20 })
// { kinds: [1], limit: 20, search: 'bitcoin lightning' }

const parsed = nip50.parseSearchQuery('bitcoin include:spam language:en')
// { text: 'bitcoin', modifiers: { include: 'spam', language: 'en' } }
```

---

## Lists (NIP-51)

Create and parse lists with optional NIP-44 encrypted private items.

```javascript
import { nip51 } from 'nostr-core'

const list = nip51.createListEvent({
  kind: 10000, // mute list
  publicItems: [{ tag: 'p', value: pubkeyToMute }],
  privateItems: [{ tag: 'p', value: secretMute }],
}, secretKey)

const parsed = nip51.parseList(list, secretKey)
// { kind, publicItems, privateItems }
```

---

## Reporting (NIP-56)

Report objectionable content or users with kind 1984.

```javascript
import { nip56 } from 'nostr-core'

const report = nip56.createReportEvent(
  [{ type: 'event', eventId: 'spam-id', authorPubkey: 'pk', reportType: 'spam' }],
  secretKey,
  'Automated spam content',
)

const parsed = nip56.parseReport(report) // { targets: [...], content }
```

---

## LNURL Protocol (LUD-01/03/06/09/10/12/17/18/20/21)

Encode, decode, and interact with LNURL services for pay requests, withdraw requests, and success actions.

### Encoding / Decoding

```javascript
import { lnurl } from 'nostr-core'

// Encode a URL to LNURL bech32 format
const encoded = lnurl.encodeLnurl('https://service.com/api?q=pay')
// 'LNURL1...'

// Decode an LNURL back to URL
const url = lnurl.decodeLnurl('LNURL1...')
// 'https://service.com/api?q=pay'

// Check if a string is a valid LNURL
const valid = lnurl.isLnurl('LNURL1...') // true

// Resolve any LNURL-compatible input (LNURL, lightning address, raw URL)
const resolvedUrl = lnurl.resolveUrl('LNURL1...')
```

### Pay Requests (LUD-06/12/17/18)

```javascript
import { lnurl } from 'nostr-core'

// Fetch a pay request from an LNURL
const payReq = await lnurl.fetchPayRequest('LNURL1...')
// { callback, minSendable, maxSendable, metadata, tag: 'payRequest', ... }

// Parse metadata from the pay request
const metadata = lnurl.parseLnurlMetadata(payReq.metadata)
// [['text/plain', 'Pay to service'], ['image/png;base64', '...']]

// Request an invoice for a specific amount
const { invoice, successAction } = await lnurl.requestInvoice({
  payRequest: payReq,
  amountMsats: 10000,
  comment: 'Great work!', // optional (LUD-12)
})

// Handle success action (LUD-09/10)
if (successAction) {
  const action = lnurl.parseSuccessAction(successAction)
  if (action.tag === 'aes') {
    const decrypted = lnurl.decryptAesSuccessAction(action, preimage)
    console.log('Secret message:', decrypted)
  }
}
```

### Withdraw Requests (LUD-03)

```javascript
import { lnurl } from 'nostr-core'

// Fetch a withdraw request
const withdrawReq = await lnurl.fetchWithdrawRequest('LNURL1...')
// { callback, k1, minWithdrawable, maxWithdrawable, defaultDescription, tag: 'withdrawRequest' }

// Submit a withdraw request with your invoice
await lnurl.submitWithdrawRequest({
  withdrawRequest: withdrawReq,
  invoice: 'lnbc10u1pj...',
})
```

### Payment Verification (LUD-21)

```javascript
import { lnurl } from 'nostr-core'

const isValid = lnurl.verifyPayment(payResponse)
```

---

## Lightning Zaps (NIP-57)

Create zap requests and parse zap receipts.

```javascript
import { nip57 } from 'nostr-core'

const zapReq = nip57.createZapRequestEvent({
  recipientPubkey: authorPk,
  amount: 21000,
  relays: ['wss://relay.damus.io'],
  content: 'Great post!',
}, secretKey)

const receipt = nip57.parseZapReceipt(zapReceiptEvent)
// { recipientPubkey, senderPubkey, amount, bolt11, ... }
```

---

## Badges (NIP-58)

Create badge definitions, awards, and profile badge displays.

```javascript
import { nip58 } from 'nostr-core'

const badge = nip58.createBadgeDefinitionEvent(
  { identifier: 'early-adopter', name: 'Early Adopter', description: 'Joined before 2024' },
  secretKey,
)

const award = nip58.createBadgeAwardEvent(
  { badgeAddress: `30009:${pubkey}:early-adopter`, recipients: [recipientPk] },
  secretKey,
)
```

---

## HTTP Auth (NIP-98)

Create signed HTTP authentication events for API requests.

```javascript
import { nip98 } from 'nostr-core'

const authEvent = nip98.createHttpAuthEvent(
  { url: 'https://api.example.com/upload', method: 'POST', body: fileBytes },
  secretKey,
)
const header = nip98.getAuthorizationHeader(authEvent) // "Nostr <base64>"
// Use: fetch(url, { headers: { Authorization: header } })
```

---

## Links

- **npm:** https://www.npmjs.com/package/nostr-core
- **Source:** https://github.com/nostr-core-org/nostr-core
- **NIP-47 Spec:** https://github.com/nostr-protocol/nips/blob/master/47.md
- **NIP-07 Spec:** https://github.com/nostr-protocol/nips/blob/master/07.md
- **NIP-46 Spec:** https://github.com/nostr-protocol/nips/blob/master/46.md
- **NIP-59 Spec:** https://github.com/nostr-protocol/nips/blob/master/59.md
- **NIP-65 Spec:** https://github.com/nostr-protocol/nips/blob/master/65.md
- **NIP-17 Spec:** https://github.com/nostr-protocol/nips/blob/master/17.md
- **License:** MIT
