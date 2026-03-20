# BOLT-11 Invoice Decoder

Decode BOLT-11 Lightning invoices to extract amount, payment hash, description, expiry, route hints, payee node key, and all other tagged fields. Supports mainnet, testnet, signet, and regtest invoices.

## Import

```ts
import { bolt11 } from 'nostr-core'
// or import individual functions
import { decodeBolt11, Bolt11Error } from 'nostr-core'
```

## Bolt11Invoice Type

```ts
type Bolt11Invoice = {
  paymentRequest: string
  prefix: string
  network: Bolt11Network
  amountMsat?: number
  amountSat?: number
  timestamp: number
  expiry: number
  expiresAt: number
  isExpired: boolean
  paymentHash: string
  paymentSecret?: string
  description?: string
  descriptionHash?: string
  payeeNodeKey?: string
  minFinalCltvExpiry: number
  featureBits?: Uint8Array
  metadata?: string
  routeHints: Bolt11RouteHint[][]
  fallbackAddresses: Bolt11FallbackAddress[]
  signature: string
  recoveryFlag: number
  unknownTags: { tag: number; words: number[] }[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `paymentRequest` | `string` | Canonical lowercase invoice string |
| `prefix` | `string` | HRP prefix (e.g. `"lnbc2500u"`) |
| `network` | `Bolt11Network` | `"mainnet"`, `"testnet"`, `"signet"`, or `"regtest"` |
| `amountMsat` | `number` (optional) | Amount in millisatoshis (undefined for zero-amount invoices) |
| `amountSat` | `number` (optional) | Amount in satoshis |
| `timestamp` | `number` | Unix timestamp when invoice was created |
| `expiry` | `number` | Expiry time in seconds (default 3600) |
| `expiresAt` | `number` | Absolute expiry (timestamp + expiry) |
| `isExpired` | `boolean` | Whether expired at decode time |
| `paymentHash` | `string` | Payment hash (256-bit, hex) |
| `paymentSecret` | `string` (optional) | Payment secret (256-bit, hex) |
| `description` | `string` (optional) | Short description (UTF-8) |
| `descriptionHash` | `string` (optional) | SHA-256 hash of a longer description (hex) |
| `payeeNodeKey` | `string` (optional) | Payee node public key (33-byte compressed, hex). Recovered from signature if not in `n` tag. |
| `minFinalCltvExpiry` | `number` | Min final CLTV expiry delta in blocks (default 18) |
| `featureBits` | `Uint8Array` (optional) | Feature bit flags |
| `metadata` | `string` (optional) | Payment metadata (hex) |
| `routeHints` | `Bolt11RouteHint[][]` | Route hints for private channels |
| `fallbackAddresses` | `Bolt11FallbackAddress[]` | Fallback on-chain addresses |
| `signature` | `string` | Signature R\|\|S (64 bytes, hex) |
| `recoveryFlag` | `number` | Signature recovery flag (0-3) |

## Bolt11RouteHint Type

```ts
type Bolt11RouteHint = {
  pubkey: string
  shortChannelId: string
  feeBaseMsat: number
  feeProportionalMillionths: number
  cltvExpiryDelta: number
}
```

## Bolt11FallbackAddress Type

```ts
type Bolt11FallbackAddress = {
  version: number
  hex: string
}
```

## Bolt11Error Class

```ts
class Bolt11Error extends Error {
  code: string
}
```

| Code | Description |
|------|-------------|
| `INVALID_BECH32` | Invalid bech32 encoding or checksum |
| `INVALID_PREFIX` | Prefix doesn't start with `"ln"` |
| `INVALID_AMOUNT` | Malformed amount in HRP |
| `UNKNOWN_NETWORK` | Unrecognized currency prefix |
| `INVALID_LENGTH` | Invoice data too short |
| `INVALID_TAG` | Tag data overflows invoice |
| `MISSING_PAYMENT_HASH` | Required payment hash tag missing |

## bolt11.decode / decodeBolt11

```ts
function decode(invoice: string): Bolt11Invoice
```

Decodes a BOLT-11 Lightning invoice string.

| Parameter | Type | Description |
|-----------|------|-------------|
| `invoice` | `string` | BOLT-11 invoice (e.g. `"lnbc10u1p..."`) |

**Returns:** `Bolt11Invoice` - Decoded invoice with all fields.

**Throws:** `Bolt11Error` if the invoice is malformed.

Accepts uppercase (QR code format) and `lightning:` URI prefix.

```ts
const decoded = bolt11.decode('lnbc2500u1pvjluez...')

console.log(decoded.network)         // 'mainnet'
console.log(decoded.amountSat)       // 250000
console.log(decoded.paymentHash)     // '0001020304...'
console.log(decoded.description)     // '1 cup coffee'
console.log(decoded.payeeNodeKey)    // '03e7156a...'
console.log(decoded.isExpired)       // true/false

// Also works with lightning: prefix
const d2 = bolt11.decode('lightning:lnbc10u1p...')

// Also works with uppercase (QR code)
const d3 = bolt11.decode('LNBC10U1P...')
```

## Full Example

```ts
import { bolt11, NWC } from 'nostr-core'

// Decode an invoice before paying
const invoice = 'lnbc2500u1pvjluez...'
const decoded = bolt11.decode(invoice)

// Check amount and expiry
if (decoded.isExpired) {
  console.log('Invoice expired!')
} else {
  console.log(`Pay ${decoded.amountSat} sats to ${decoded.payeeNodeKey}`)
  console.log(`Description: ${decoded.description}`)
  console.log(`Expires in ${decoded.expiresAt - Math.floor(Date.now() / 1000)}s`)

  // Pay via NWC
  const nwc = new NWC('nostr+walletconnect://...')
  await nwc.connect()
  const result = await nwc.payInvoice(invoice)
  console.log('Paid! Preimage:', result.preimage)
  nwc.close()
}
```

## Amount Multipliers

| Suffix | Multiplier | Example | Amount |
|--------|-----------|---------|--------|
| (none) | 1 BTC | `lnbc1` | 100,000,000 sat |
| `m` | milli-BTC | `lnbc20m` | 2,000,000 sat |
| `u` | micro-BTC | `lnbc2500u` | 250,000 sat |
| `n` | nano-BTC | `lnbc1500n` | 150 sat |
| `p` | pico-BTC | `lnbc10p` | 0.001 sat (1 msat) |
