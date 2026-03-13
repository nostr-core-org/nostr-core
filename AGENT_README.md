# nostr-core - Agent Integration Guide

Dead-simple, vendor-neutral Nostr client for JavaScript and TypeScript. Control any Lightning wallet via NIP-47, sign events with browser extensions (NIP-07), delegate signing to remote signers (NIP-46), and send private encrypted messages (NIP-17/NIP-59).

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

## Links

- **npm:** https://www.npmjs.com/package/nostr-core
- **Source:** https://github.com/nostr-core-org/nostr-core
- **NIP-47 Spec:** https://github.com/nostr-protocol/nips/blob/master/47.md
- **NIP-07 Spec:** https://github.com/nostr-protocol/nips/blob/master/07.md
- **NIP-46 Spec:** https://github.com/nostr-protocol/nips/blob/master/46.md
- **NIP-59 Spec:** https://github.com/nostr-protocol/nips/blob/master/59.md
- **NIP-17 Spec:** https://github.com/nostr-protocol/nips/blob/master/17.md
- **License:** MIT
