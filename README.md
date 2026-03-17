# nostr-core - Dead-simple & vendor-neutral

**nostr-core** is a comprehensive JavaScript/TypeScript toolkit for building engaging [Nostr](https://nostr.com) applications. With support for 36+ NIPs out of the box, it covers everything from core protocol primitives to advanced social, payments, and identity features — giving you a single, well-typed foundation to build on.

**Why nostr-core?**

* 📡 Protocol Complete - 36+ NIPs implemented and ready to use, from basics to cutting-edge
* ⚡ NWC & Lightning - First-class Nostr Wallet Connect support for seamless payment flows
* 🔐 Identity & Auth - Key management, NIP-07 browser signing, and bunker/remote signer support
* 🎯 Relay Management - Smart relay abstraction with connection pooling and event routing
* 🛠️ TypeScript Native - Fully typed, modern APIs designed for developer confidence
* 🧩 Composable - Headless and framework-agnostic; drop it into any stack
* 📦 Modular - Use only what you need, scale as your app grows

**Built for builders who want to ship**, not fight the protocol. [Demo](https://nostr-core-demo.netlify.app/)

 [Nostr Wallet Connect (NWC)](https://github.com/nostr-protocol/nips/blob/master/47.md) 
```ts
import { NWC } from 'nostr-core'

const nwc = new NWC('nostr+walletconnect://...')
await nwc.connect()

const { balance } = await nwc.getBalance()
console.log(`Balance: ${balance} msats`)

const { preimage } = await nwc.payInvoice('lnbc...')
console.log('Paid! Preimage:', preimage)

nwc.close()
```

## Features

- **Single connection string** - pass a `nostr+walletconnect://` URI and start making calls
- **Full NIP-47 coverage** - `pay_invoice`, `get_balance`, `make_invoice`, `list_transactions`, `pay_keysend`, `sign_message`, and more
- **Auto-encryption** - detects NIP-04 or NIP-44 support and handles it transparently
- **Typed errors** - specific error classes for timeouts, connection failures, wallet rejections, and decryption issues
- **Signer abstraction** - unified `Signer` interface for secret keys, browser extensions (NIP-07), and remote signers (NIP-46)
- **Zero framework deps** - built on audited [noble](https://paulmillr.com/noble/) cryptography libraries only
- **ESM-only** - tree-shakeable, modern JavaScript

## Install

```sh
npm install nostr-core
```

Requires Node.js 18+ or any runtime with Web Crypto and WebSocket support (Deno, Bun, Cloudflare Workers).

## Quick Start

### Connect to a Wallet

```ts
import { NWC } from 'nostr-core'

const nwc = new NWC('nostr+walletconnect://...')
await nwc.connect()

const info = await nwc.getInfo()
console.log('Connected to:', info.alias)
console.log('Methods:', info.methods)
```

### Pay an Invoice

```ts
try {
  const { preimage, fees_paid } = await nwc.payInvoice('lnbc...')
  console.log('Preimage:', preimage)
} catch (err) {
  console.error('Payment failed:', err.message)
}
```

### Pay a Lightning Address

```ts
try {
  const { preimage, invoice } = await nwc.payLightningAddress('hello@getalby.com', 100)
  console.log('Paid 100 sats! Preimage:', preimage)
} catch (err) {
  console.error('Payment failed:', err.message)
}
```

### Pay a Lightning Address in Fiat

```ts
// Pay $5 USD to a Lightning Address - automatically converts to sats
const { preimage, sats, rate } = await nwc.payLightningAddressFiat('hello@getalby.com', 5, 'usd')
console.log(`Paid ${sats} sats ($5 at $${rate}/BTC)`)
```

### Create an Invoice

```ts
const tx = await nwc.makeInvoice({
  amount: 10000, // msats
  description: 'Coffee',
})
console.log('Invoice:', tx.invoice)
```

### Listen for Payments

```ts
nwc.on('payment_received', (notification) => {
  console.log('Received:', notification.notification.amount, 'msats')
})
```

### Close

```ts
nwc.close()
```

## API

### NWC Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to relay, auto-detect encryption |
| `getInfo()` | Wallet metadata (alias, network, supported methods) |
| `getBalance()` | Wallet balance in msats |
| `getBudget()` | NWC spending budget info |
| `payInvoice(invoice, amount?)` | Pay a BOLT-11 invoice |
| `payKeysend(params)` | Keysend payment to a node pubkey |
| `makeInvoice(params)` | Create a Lightning invoice |
| `lookupInvoice(params)` | Look up an invoice by hash or string |
| `listTransactions(params?)` | List past transactions |
| `signMessage(message)` | Sign a message with the wallet's key |
| `payLightningAddress(address, amountSats)` | Resolve a Lightning Address and pay the invoice |
| `payLightningAddressFiat(address, fiatAmount, currency)` | Convert fiat to sats and pay a Lightning Address |
| `on(event, handler)` | Listen for `payment_received` / `payment_sent` |
| `off(event, handler)` | Remove an event handler |
| `close()` | Disconnect and clean up |

### Configuration

```ts
const nwc = new NWC(connectionString)
nwc.replyTimeout = 30000   // Wallet reply timeout (default: 60s)
nwc.publishTimeout = 10000 // Relay publish timeout (default: 5s)
```

### Error Handling

```ts
import { NWCWalletError, NWCTimeoutError, NWCConnectionError } from 'nostr-core'

try {
  await nwc.payInvoice('lnbc...')
} catch (err) {
  if (err instanceof NWCWalletError) {
    console.error(`Wallet rejected [${err.code}]: ${err.message}`)
  } else if (err instanceof NWCTimeoutError) {
    console.error('Timed out:', err.code) // 'PUBLISH_TIMEOUT' or 'REPLY_TIMEOUT'
  } else if (err instanceof NWCConnectionError) {
    console.error('Connection lost')
  }
}
```

Error hierarchy:

```
NWCError (code: string)
├── NWCWalletError          - wallet rejected the request
├── NWCTimeoutError         - generic timeout
│   ├── NWCPublishTimeoutError  - relay didn't acknowledge
│   └── NWCReplyTimeoutError    - wallet didn't respond
├── NWCPublishError         - relay rejected the event
├── NWCConnectionError      - couldn't connect to relay
├── NWCDecryptionError      - couldn't decrypt response
├── LightningAddressError   - Lightning Address resolution failed
└── FiatConversionError     - fiat-to-sats conversion failed
```

## Low-Level Exports

nostr-core also exports the building blocks used internally:

```ts
import {
  // Key management
  generateSecretKey, getPublicKey,

  // Signer abstraction
  createSecretKeySigner, Nip07Signer, NostrConnect,

  // Events
  finalizeEvent, verifyEvent, getEventHash, serializeEvent, validateEvent,

  // Relay connections
  Relay, RelayPool,

  // Encryption
  nip04, nip44,

  // Bech32 encoding
  nip19,

  // NIP-07 & NIP-46
  nip07, nip46,

  // Filters
  matchFilter, matchFilters,

  // Utilities
  normalizeURL, bytesToHex, hexToBytes, randomBytes,
} from 'nostr-core'
```

## Why nostr-core over @getalby/sdk?

If you've used `@getalby/sdk` before, here's why `nostr-core` is a better fit for most NWC use cases:

| | **nostr-core** | **@getalby/sdk** | |
|---|---|---|---|
| **Install size** | 118 MB | 159 MB | **26% smaller** |
| **Packages installed** | 79 | 436 | **82% fewer** |
| **Dependency tree** | 132 total | 698 total | **81% fewer** |
| **Vendor lock-in** | None - pure NIP-47 protocol | Coupled to Alby (OAuth, webhooks, branding) | |
| **Error handling** | Typed hierarchy (8 specific classes) | Generic errors | |
| **Encryption** | Auto-detects NIP-04 / NIP-44 | Manual configuration | |
| **Fiat conversion** | Built-in (zero extra deps) | `USD()` via `LN` client (v7+), backed by `@getalby/lightning-tools` | |
| **Runtime support** | Node 18+, Deno, Bun, Cloudflare Workers | Node.js (requires websocket polyfill pre-v18) | |
| **API surface** | One class (`NWC`) | `LN` + `NWCClient` + `NWAClient` + `NostrWebLNProvider` + `OAuthWebLNProvider` | |

**Use `@getalby/sdk`** if you need Alby OAuth or WebLN compatibility. **Use `nostr-core`** for everything else - including Lightning Address payments and fiat currency conversion, which are now supported natively.

See the full [comparison guide](./docs/guide/comparison.md) for details.

## Agent Skills (Claude Code Plugin)

nostr-core ships as a [Claude Code plugin](https://code.claude.com/docs/en/plugins) with 4 skills for AI agents building Lightning-enabled apps:

| Skill | Description |
|-------|-------------|
| `/nwc-integrate` | Set up nostr-core and connect to any NWC wallet |
| `/lightning-pay` | Pay invoices, Lightning Addresses, fiat, and keysend |
| `/wallet-monitor` | Real-time notifications, transaction history, analytics |
| `/nostr-primitives` | Low-level keys, events, relays, encryption, encoding |

Install: `/plugin install nostr-core-org/nostr-core`

See the [Skills documentation](./docs/skills.md) and [Agent README](./AGENT_README.md) for details.

## Dependencies

| Package | Purpose |
|---------|---------|
| [@noble/curves](https://github.com/paulmillr/noble-curves) | secp256k1 / schnorr signatures |
| [@noble/hashes](https://github.com/paulmillr/noble-hashes) | SHA-256, HMAC, HKDF |
| [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) | AES-CBC, ChaCha20 |
| [@scure/base](https://github.com/paulmillr/scure-base) | Base64, bech32 encoding |

## License

[MIT](./LICENSE)
