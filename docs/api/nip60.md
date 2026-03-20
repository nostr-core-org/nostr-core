# NIP-60

Cashu Wallets - defines how to store and manage Cashu eCash wallets using Nostr events. Wallet metadata (kind 17375), unspent token proofs (kind 7375), spending history (kind 7376), and pending mint quotes (kind 7374). All sensitive data is NIP-44 encrypted to self.

## Import

```ts
import { nip60 } from 'nostr-core'
// or import individual functions
import {
  createWalletEventTemplate,
  createWalletEvent,
  parseWalletEvent,
  createTokenEventTemplate,
  createTokenEvent,
  parseTokenEvent,
  createHistoryEventTemplate,
  createHistoryEvent,
  parseHistoryEvent,
  createQuoteEventTemplate,
  createQuoteEvent,
  parseQuoteEvent,
  createTokenDeleteTemplate,
  createTokenDeleteEvent,
  getWalletFilters,
  getHistoryFilter,
  getProofsBalance,
  WALLET_KIND,
  TOKEN_KIND,
  HISTORY_KIND,
  QUOTE_KIND,
} from 'nostr-core'
```

## Event Kinds

| Constant | Value | Description |
|----------|-------|-------------|
| `WALLET_KIND` | `17375` | Wallet metadata (replaceable) |
| `TOKEN_KIND` | `7375` | Unspent proofs/tokens |
| `HISTORY_KIND` | `7376` | Spending history |
| `QUOTE_KIND` | `7374` | Pending mint quotes |

## CashuProof Type

```ts
type CashuProof = {
  id: string
  amount: number
  secret: string
  C: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Keyset ID from the mint |
| `amount` | `number` | Denomination of this proof |
| `secret` | `string` | Unique secret for this proof |
| `C` | `string` | Blinded signature from the mint |

## CashuToken Type

```ts
type CashuToken = {
  mint: string
  proofs: CashuProof[]
  unit?: string
  del?: string[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `string` | Mint URL these proofs belong to |
| `proofs` | `CashuProof[]` | Array of unspent Cashu proofs |
| `unit` | `string` (optional) | Denomination unit: `"sat"`, `"usd"`, `"eur"`. Default: `"sat"` |
| `del` | `string[]` (optional) | Event IDs of token events destroyed to create this one |

## CashuWallet Type

```ts
type CashuWallet = {
  privkey: string
  mints: string[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `privkey` | `string` | Wallet-exclusive private key (hex), distinct from user's Nostr key. Used for NIP-61 nutzaps. |
| `mints` | `string[]` | One or more mint URLs |

## CashuHistory Type

```ts
type CashuHistory = {
  direction: 'in' | 'out'
  amount: string
  unit: string
  events: CashuHistoryRef[]
}

type CashuHistoryRef = {
  id: string
  relay?: string
  marker: 'created' | 'destroyed' | 'redeemed'
}
```

| Field | Type | Description |
|-------|------|-------------|
| `direction` | `'in' \| 'out'` | Whether tokens were received or sent |
| `amount` | `string` | Transaction amount |
| `unit` | `string` | Denomination unit (default: `"sat"`) |
| `events` | `CashuHistoryRef[]` | Referenced token event IDs with markers |

## CashuQuote Type

```ts
type CashuQuote = {
  quoteId: string
  mint: string
  expiration: number
}
```

| Field | Type | Description |
|-------|------|-------------|
| `quoteId` | `string` | Mint quote identifier |
| `mint` | `string` | Mint URL |
| `expiration` | `number` | Unix timestamp when the quote expires |

## nip60.createWalletEvent

```ts
function createWalletEvent(wallet: CashuWallet, secretKey: Uint8Array): NostrEvent
function createWalletEventTemplate(wallet: CashuWallet, secretKey: Uint8Array): EventTemplate
```

Creates a kind 17375 replaceable wallet event. Content is NIP-44 encrypted to self.

```ts
const walletEvent = nip60.createWalletEvent({
  privkey: 'wallet-exclusive-private-key-hex',
  mints: ['https://mint.example.com', 'https://mint2.example.com'],
}, secretKey)
```

## nip60.parseWalletEvent

```ts
function parseWalletEvent(event: NostrEvent, secretKey: Uint8Array): CashuWallet
```

Decrypts and parses a kind 17375 wallet event.

```ts
const wallet = nip60.parseWalletEvent(walletEvent, secretKey)
console.log(wallet.mints) // ['https://mint.example.com', ...]
```

## nip60.createTokenEvent

```ts
function createTokenEvent(token: CashuToken, secretKey: Uint8Array): NostrEvent
function createTokenEventTemplate(token: CashuToken, secretKey: Uint8Array): EventTemplate
```

Creates a kind 7375 token event storing unspent Cashu proofs. Content is NIP-44 encrypted to self.

```ts
const tokenEvent = nip60.createTokenEvent({
  mint: 'https://mint.example.com',
  unit: 'sat',
  proofs: [
    { id: '005c2502034d4f12', amount: 1, secret: 'secret1', C: '02abc...' },
    { id: '005c2502034d4f12', amount: 4, secret: 'secret2', C: '03def...' },
  ],
  del: ['previous-token-event-id'],  // ID of destroyed token event
}, secretKey)
```

## nip60.parseTokenEvent

```ts
function parseTokenEvent(event: NostrEvent, secretKey: Uint8Array): CashuToken
```

Decrypts and parses a kind 7375 token event.

```ts
const token = nip60.parseTokenEvent(tokenEvent, secretKey)
console.log(token.mint)    // 'https://mint.example.com'
console.log(token.proofs)  // [{ id, amount, secret, C }, ...]
console.log(nip60.getProofsBalance(token.proofs)) // 5
```

## nip60.createHistoryEvent

```ts
function createHistoryEvent(history: CashuHistory, secretKey: Uint8Array): NostrEvent
function createHistoryEventTemplate(history: CashuHistory, secretKey: Uint8Array): EventTemplate
```

Creates a kind 7376 spending history event. Event references with `"redeemed"` marker are placed in unencrypted tags; all others are NIP-44 encrypted.

```ts
const historyEvent = nip60.createHistoryEvent({
  direction: 'out',
  amount: '4',
  unit: 'sat',
  events: [
    { id: 'old-token-event-id', marker: 'destroyed' },
    { id: 'new-token-event-id', marker: 'created' },
  ],
}, secretKey)
```

## nip60.parseHistoryEvent

```ts
function parseHistoryEvent(event: NostrEvent, secretKey: Uint8Array): CashuHistory
```

Decrypts and parses a kind 7376 spending history event.

```ts
const history = nip60.parseHistoryEvent(historyEvent, secretKey)
console.log(history.direction) // 'out'
console.log(history.amount)    // '4'
console.log(history.events)    // [{ id, marker: 'destroyed' }, { id, marker: 'created' }]
```

## nip60.createQuoteEvent

```ts
function createQuoteEvent(quote: CashuQuote, secretKey: Uint8Array): NostrEvent
function createQuoteEventTemplate(quote: CashuQuote, secretKey: Uint8Array): EventTemplate
```

Creates a kind 7374 quote event for tracking a pending mint quote during Lightning payment. Uses NIP-40 expiration tag.

```ts
const quoteEvent = nip60.createQuoteEvent({
  quoteId: 'quote-abc-123',
  mint: 'https://mint.example.com',
  expiration: Math.floor(Date.now() / 1000) + 86400,
}, secretKey)
```

## nip60.parseQuoteEvent

```ts
function parseQuoteEvent(event: NostrEvent, secretKey: Uint8Array): CashuQuote
```

Decrypts and parses a kind 7374 quote event.

## nip60.createTokenDeleteEvent

```ts
function createTokenDeleteEvent(tokenEventIds: string[], secretKey: Uint8Array): NostrEvent
function createTokenDeleteTemplate(tokenEventIds: string[]): EventTemplate
```

Creates a kind 5 deletion event for spent token events. Per NIP-60, the deletion includes `["k", "7375"]` for filtering.

```ts
const deleteEvent = nip60.createTokenDeleteEvent(['spent-token-event-id'], secretKey)
// Publish to relay to mark the token as spent
```

## nip60.getWalletFilters

```ts
function getWalletFilters(pubkey: string): Filter[]
```

Returns filters to fetch a user's wallet event and all unspent token events.

```ts
const filters = nip60.getWalletFilters(pubkey)
// [{ kinds: [17375], authors: [pubkey] }, { kinds: [7375], authors: [pubkey] }]
```

## nip60.getHistoryFilter

```ts
function getHistoryFilter(pubkey: string): Filter
```

Returns a filter to fetch a user's spending history events.

## nip60.getProofsBalance

```ts
function getProofsBalance(proofs: CashuProof[]): number
```

Sums the total amount of a set of Cashu proofs.

```ts
const total = nip60.getProofsBalance(token.proofs)
console.log(`Balance: ${total} sats`)
```

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip60, Relay } from 'nostr-core'
import { randomBytes, bytesToHex } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)

// Step 1: Create a wallet with a dedicated private key
const walletPrivkey = bytesToHex(randomBytes(32))
const walletEvent = nip60.createWalletEvent({
  privkey: walletPrivkey,
  mints: ['https://mint.minibits.cash'],
}, sk)

// Step 2: Store token proofs received from a mint
const tokenEvent = nip60.createTokenEvent({
  mint: 'https://mint.minibits.cash',
  unit: 'sat',
  proofs: [
    { id: '009a1f293253e41e', amount: 1, secret: 'secret1', C: '02...' },
    { id: '009a1f293253e41e', amount: 2, secret: 'secret2', C: '03...' },
    { id: '009a1f293253e41e', amount: 8, secret: 'secret3', C: '02...' },
  ],
}, sk)
console.log('Total balance:', nip60.getProofsBalance([
  { id: '009a1f293253e41e', amount: 1, secret: 'secret1', C: '02...' },
  { id: '009a1f293253e41e', amount: 2, secret: 'secret2', C: '03...' },
  { id: '009a1f293253e41e', amount: 8, secret: 'secret3', C: '02...' },
])) // 11

// Step 3: Spend some proofs (e.g. send 3 sats)
// After swapping with the mint, create new token with change
const newTokenEvent = nip60.createTokenEvent({
  mint: 'https://mint.minibits.cash',
  unit: 'sat',
  proofs: [
    { id: '009a1f293253e41e', amount: 8, secret: 'secret3', C: '02...' },
  ],
  del: [tokenEvent.id],  // Reference the destroyed token event
}, sk)

// Delete the old token event
const deleteEvent = nip60.createTokenDeleteEvent([tokenEvent.id], sk)

// Record the transaction
const historyEvent = nip60.createHistoryEvent({
  direction: 'out',
  amount: '3',
  unit: 'sat',
  events: [
    { id: tokenEvent.id, marker: 'destroyed' },
    { id: newTokenEvent.id, marker: 'created' },
  ],
}, sk)

// Step 4: Fetch wallet from relays
const relay = new Relay('wss://relay.example.com')
await relay.connect()

const filters = nip60.getWalletFilters(pk)
// Query relay with filters to get wallet + tokens
// Parse each event with nip60.parseWalletEvent / nip60.parseTokenEvent

relay.close()
```

## How It Works

- **Kind 17375** is a replaceable wallet event storing the wallet's private key and mint list. Only one per user.
- **Kind 7375** stores unspent Cashu proofs for a single mint. Multiple token events may exist.
- **Kind 7376** records spending history with direction, amount, and event references.
- **Kind 7374** tracks pending mint quotes during Lightning payments (uses NIP-40 expiration).
- All content is **NIP-44 encrypted to self** (using your own keypair).
- When proofs are spent, the old token event is **NIP-09 deleted** and a new one created with remaining proofs.
- The `del` field in token events references destroyed event IDs for state tracking.
- Deletion events MUST include `["k", "7375"]` for relay filtering.
- The wallet `privkey` is a dedicated key for receiving NIP-61 nutzaps, not the user's Nostr key.
- History event references with `"redeemed"` marker are stored unencrypted; all others are encrypted.
