# nostr-core vs @getalby/sdk

This guide explains the differences between `nostr-core` and `@getalby/sdk` (the Alby JS SDK) to help you choose the right library for your project.

## At a Glance

<div class="stat-grid">
  <StatCard number="82%" label="fewer packages" description="79 vs 436" />
  <StatCard number="26%" label="smaller install" description="118 MB vs 159 MB" />
  <StatCard number="81%" label="fewer dependencies" description="132 vs 698 total" />
  <StatCard number="4" label="direct deps" description="All audited Noble crypto" />
</div>

## Visual Comparison

<div class="comparison-bars">
  <ComparisonBar
    label="Packages installed"
    :leftValue="79"
    leftLabel="nostr-core"
    :rightValue="436"
    rightLabel="@getalby/sdk"
  />
  <ComparisonBar
    label="Install size (MB)"
    :leftValue="118"
    leftLabel="nostr-core"
    :rightValue="159"
    rightLabel="@getalby/sdk"
  />
  <ComparisonBar
    label="Dependency tree"
    :leftValue="132"
    leftLabel="nostr-core"
    :rightValue="698"
    rightLabel="@getalby/sdk"
  />
</div>

## Dependency Footprint

### nostr-core

All production dependencies are from the Noble cryptography project - independently audited, minimal, and purpose-built:

- `@noble/curves` - secp256k1 / schnorr signatures
- `@noble/hashes` - SHA-256, HMAC, HKDF
- `@noble/ciphers` - AES-CBC, ChaCha20
- `@scure/base` - Base64, bech32 encoding

**4 direct dependencies. 132 total in the dependency tree. 79 packages installed. 118 MB on disk.**

### @getalby/sdk

- `nostr-tools` - a full Nostr client library with 50+ internal modules, many of which are unused for NWC
- `@getalby/lightning-tools` - Lightning utilities including LNURL, Lightning Address resolution

**698 total in the dependency tree. 436 packages installed. 159 MB on disk.**

That's **5.3x more packages** in the dependency tree - a proportionally larger supply chain attack surface. Every extra package is another maintainer who could push a malicious update, another dependency that could introduce breaking changes, and more code shipped to production that you never call.

## Vendor Neutrality

`nostr-core` implements the **NIP-47 protocol only**. It works with any NWC-compatible wallet - Alby, Mutiny, Zeus, Coinos, or any future wallet that supports the standard.

`@getalby/sdk` is built around the Alby ecosystem. It ships with:

- `OAuthWebLNProvider` - Alby OAuth integration
- Alby-specific webhook handling
- Boostagram helpers
- Alby account management APIs

If you're not an Alby customer, this is dead code in your bundle. If you are, it creates coupling that makes switching wallets harder.

## API Simplicity

### nostr-core - One class, clear purpose

```ts
import { NWC } from 'nostr-core'

const nwc = new NWC('nostr+walletconnect://...')
await nwc.connect()

const { balance } = await nwc.getBalance()
await nwc.payInvoice('lnbc...')

nwc.close()
```

### @getalby/sdk - Multiple overlapping abstractions

Version 7 introduced `LN` as a new high-level entry point:

```ts
import { LN, USD } from "@getalby/sdk/lnclient"

await new LN(credentials).pay("lnbc...")
await new LN(credentials).pay("hello@getalby.com", USD(1))
```

The SDK still exposes several underlying classes:

- `LN` - new high-level client (v7+)
- `NWCClient` - low-level NWC client
- `NostrWebLNProvider` - WebLN wrapper around NWC
- `NWAClient` - Nostr Wallet Auth for client-initiated connections
- `OAuthWebLNProvider` - WebLN wrapper around Alby OAuth

The `LN` class is simpler, but the underlying layers remain. Choosing between them still requires understanding their tradeoffs.

## Error Handling

### nostr-core - Typed error hierarchy

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

This lets you handle each failure mode precisely:

```ts
import { NWCWalletError, NWCPublishTimeoutError, NWCReplyTimeoutError } from 'nostr-core'

try {
  await nwc.payInvoice('lnbc...')
} catch (err) {
  if (err instanceof NWCWalletError) {
    // Wallet said no - show the reason to the user
    showError(`Wallet rejected: ${err.message} (${err.code})`)
  } else if (err instanceof NWCPublishTimeoutError) {
    // Relay is down - try a different relay
    retryWithBackup()
  } else if (err instanceof NWCReplyTimeoutError) {
    // Wallet is offline - tell the user to check their wallet
    showError('Wallet appears offline')
  }
}
```

### @getalby/sdk - Generic errors

Errors are less structured, making it harder to distinguish between relay issues, wallet rejections, and timeout scenarios in your error handling logic.

## Encryption Detection

`nostr-core` handles encryption automatically:

1. On `connect()`, it queries the wallet's info event (kind 13194)
2. Checks for `encryption` or `v` tags to determine NIP-04 vs NIP-44 support
3. Falls back to NIP-04 if no info event is found
4. All subsequent requests use the correct encryption - zero configuration needed

## Cross-Runtime Support

`nostr-core` works anywhere with Web Crypto and WebSocket APIs:

- **Node.js 18+**
- **Deno**
- **Bun**
- **Cloudflare Workers**

This is possible because the library depends only on standard Web APIs and the Noble crypto libraries (which are pure JavaScript with no native bindings).

`@getalby/sdk` works on Node.js 18+ and browsers, but requires a `websocket-polyfill` package on older Node.js versions, adding another installation step for older environments.

## Full NIP-47 Coverage

:::tip All methods supported
With 81% fewer dependencies, `nostr-core` still implements every NIP-47 method.
:::

| Method | nostr-core | @getalby/sdk |
|--------|:---:|:---:|
| `pay_invoice` | Yes | Yes |
| `get_balance` | Yes | Yes |
| `make_invoice` | Yes | Yes |
| `get_info` | Yes | Yes |
| `get_budget` | Yes | Yes |
| `list_transactions` | Yes | Yes |
| `lookup_invoice` | Yes | Yes |
| `pay_keysend` | Yes | Yes |
| `sign_message` | Yes | Yes |
| Notifications (`payment_received`, `payment_sent`) | Yes | Yes |

## Low-Level Building Blocks

`nostr-core` exports **39 NIP implementations** so you don't need a separate `nostr-tools` install:

- **Keys**: `generateSecretKey`, `getPublicKey`, `nip06` (BIP-39 mnemonic derivation)
- **Events**: `finalizeEvent`, `verifyEvent`, `getEventHash`
- **Relay**: `Relay`, `RelayPool`, `nip11` (relay info), `nip42` (auth), `nip65` (relay lists)
- **Encryption**: `nip04`, `nip44`
- **Encoding**: `nip19` (bech32), `nip21` (nostr: URIs)
- **Identity**: `nip02` (follow lists), `nip05` (DNS identifiers), `nip07` (browser signer), `nip24` (metadata)
- **Social**: `nip09` (deletion), `nip10` (threads), `nip22` (comments), `nip25` (reactions), `nip18` (reposts)
- **Content**: `nip23` (long-form), `nip27` (references), `nip30` (emoji), `nip31` (alt tags), `nip36` (content warnings)
- **Messaging**: `nip17`/`nip59` (private DMs), `nip28` (public chat channels)
- **Discovery**: `nip50` (search), `nip51` (lists), `nip56` (reporting), `nip58` (badges)
- **Calendar**: `nip52` (date-based events, time-based events, calendars, RSVP)
- **Utility**: `nip13` (proof of work), `nip40` (expiration), `nip48` (proxy tags), `nip57` (zaps)
- **Fundraising**: `nip75` (zap goals with beneficiaries and progress tracking)
- **LNURL**: `lnurl` (LUD-01/03/06/09/10/12/17/18/20/21 — pay requests, withdraw requests, success actions, payer identity)
- **Filtering**: `matchFilter`, `matchFilters`

## Lightning Address & LNURL Protocol

`nostr-core` natively resolves Lightning Addresses via LNURL-pay and includes full LNURL protocol support (10 LUDs) - no extra dependencies needed:

```ts
// One-liner: resolve address + pay the invoice
const { preimage, invoice } = await nwc.payLightningAddress('hello@getalby.com', 100)

// Or resolve separately without paying
import { fetchInvoice } from 'nostr-core'
const { invoice, metadata } = await fetchInvoice('hello@getalby.com', 100)

// Full LNURL protocol support
import { lnurl } from 'nostr-core'

// Encode/decode LNURL bech32 strings (LUD-01)
const encoded = lnurl.encodeLnurl('https://service.com/api')
const url = lnurl.decodeLnurl(encoded)

// Pay requests with comments and payer identity (LUD-06/12/18)
const payReq = await lnurl.fetchPayRequest(encoded)
const { pr, successAction } = await lnurl.requestInvoice(payReq, 10000, {
  comment: 'Great work!',
  payerData: { name: 'Alice' },
})

// Withdraw requests (LUD-03)
const withdraw = await lnurl.fetchWithdrawRequest('lnurlw://...')
await lnurl.submitWithdrawRequest(withdraw, myInvoice)

// Verify payments (LUD-21)
const status = await lnurl.verifyPayment(verifyUrl)
```

This eliminates the need for `@getalby/lightning-tools` or any external LNURL library. nostr-core covers LUD-01, 03, 06, 09, 10, 12, 17, 18, 20, and 21 out of the box.

## Fiat Currency Conversion

`nostr-core` includes built-in fiat-to-sats conversion using public exchange rate APIs (CoinGecko), with automatic 60-second rate caching:

```ts
import { fiatToSats, satsToFiat, getExchangeRate } from 'nostr-core'

// Convert fiat to sats
const { sats, rate } = await fiatToSats(5, 'usd')
console.log(`$5 = ${sats} sats (at $${rate}/BTC)`)

// Convert sats to fiat
const { amount } = await satsToFiat(10000, 'eur')
console.log(`10,000 sats = €${amount.toFixed(2)}`)

// One-liner: pay a Lightning Address in fiat
const result = await nwc.payLightningAddressFiat('hello@getalby.com', 5, 'usd')
```

The `@getalby/sdk` v7 `LN` client also exposes a `USD()` fiat helper, but it relies on `@getalby/lightning-tools` under the hood. `nostr-core` delivers the same capability with zero extra dependencies.

## When to Use @getalby/sdk

`@getalby/sdk` is the right choice when you need:

- **Alby OAuth integration** - authenticating with Alby accounts
- **WebLN compatibility** - implementing the WebLN provider interface
- **Alby-specific features** - webhooks, boostagrams, account management

## When to Use nostr-core

`nostr-core` is the right choice for **everything else**:

- You want a vendor-neutral NWC client
- You care about install size (26% smaller) and dependency count (82% fewer packages)
- You need cross-runtime support (Deno, Bun, Workers)
- You want typed errors for precise failure handling
- You're building a product that should work with any NWC wallet
- You want to minimize your supply chain attack surface (81% fewer dependencies in the tree)
