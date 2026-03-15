# LNURL Protocol

LNURL utilities implementing the Lightning URL protocol for Lightning Network payments and withdrawals. Covers LUD-01 (bech32 encode/decode), LUD-03 (withdraw requests), LUD-06 (pay requests), LUD-09 (success actions), LUD-10 (AES encrypted success actions), LUD-12 (comments), LUD-17 (scheme prefixes), LUD-18 (payer identity), LUD-20 (long description metadata), and LUD-21 (payment verification).

## Import

```ts
import { lnurl } from 'nostr-core'
// or import individual functions
import {
  encodeLnurl,
  decodeLnurl,
  isLnurl,
  resolveUrl,
  fetchPayRequest,
  requestInvoice,
  fetchWithdrawRequest,
  submitWithdrawRequest,
  parseSuccessAction,
  decryptAesSuccessAction,
  parseLnurlMetadata,
  verifyPayment,
} from 'nostr-core'
```

## LnurlError Class

```ts
class LnurlError extends Error {
  code: string
  constructor(message: string, code?: string)
}
```

All LNURL functions throw `LnurlError` on failure. The `code` field defaults to `'LNURL_ERROR'`.

## Types

### SuccessAction

```ts
type SuccessAction =
  | { tag: 'message'; message: string }
  | { tag: 'url'; description: string; url: string }
  | { tag: 'aes'; description: string; ciphertext: string; iv: string }
```

| Variant | Description |
|---------|-------------|
| `message` | LUD-09: Display a plaintext message to the user |
| `url` | LUD-09: Display a description and link |
| `aes` | LUD-10: AES-encrypted payload, decrypted with the payment preimage |

### PayerDataSpec

```ts
type PayerDataSpec = {
  name?: { mandatory: boolean }
  pubkey?: { mandatory: boolean }
  identifier?: { mandatory: boolean }
  email?: { mandatory: boolean }
  auth?: { mandatory: boolean; k1: string }
}
```

LUD-18: Describes which payer identity fields the service requires or accepts.

### PayerData

```ts
type PayerData = {
  name?: string
  pubkey?: string
  identifier?: string
  email?: string
  auth?: { key: string; k1: string; sig: string }
}
```

LUD-18: Payer identity data sent by the wallet to the service.

### LnurlMetadata

```ts
type LnurlMetadata = {
  plainText: string
  longDesc?: string
  image?: { type: string; data: string }
  entries: [string, string][]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `plainText` | `string` | Short description from `text/plain` entry |
| `longDesc` | `string` (optional) | LUD-20: Long description from `text/long-desc` entry |
| `image` | `object` (optional) | First image entry with its MIME type and base64 data |
| `entries` | `[string, string][]` | Raw array of all `[mime-type, content]` tuples |

### PayRequestResponse

```ts
type PayRequestResponse = {
  tag: 'payRequest'
  callback: string
  minSendable: number
  maxSendable: number
  metadata: string
  commentAllowed?: number
  payerData?: PayerDataSpec
  allowsNostr?: boolean
  nostrPubkey?: string
}
```

LUD-06: First response from a pay request LNURL endpoint.

### PayRequestCallbackResponse

```ts
type PayRequestCallbackResponse = {
  pr: string
  routes: unknown[]
  successAction?: SuccessAction
  verify?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pr` | `string` | BOLT-11 payment request (invoice) |
| `routes` | `unknown[]` | Optional route hints |
| `successAction` | `SuccessAction` (optional) | LUD-09: Action to perform after successful payment |
| `verify` | `string` (optional) | LUD-21: URL to poll for payment verification |

### WithdrawRequestResponse

```ts
type WithdrawRequestResponse = {
  tag: 'withdrawRequest'
  callback: string
  k1: string
  defaultDescription: string
  minWithdrawable: number
  maxWithdrawable: number
}
```

LUD-03: First response from a withdraw request LNURL endpoint.

### VerifyResponse

```ts
type VerifyResponse = {
  settled: boolean
  preimage: string | null
  pr: string
}
```

LUD-21: Response from a payment verification endpoint.

### RequestInvoiceOptions

```ts
type RequestInvoiceOptions = {
  comment?: string
  payerData?: PayerData
  nostr?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `comment` | `string` (optional) | LUD-12: Comment to attach to the payment |
| `payerData` | `PayerData` (optional) | LUD-18: Payer identity data |
| `nostr` | `string` (optional) | Stringified nostr zap request event |

## lnurl.encodeLnurl

```ts
function encodeLnurl(url: string): string
```

Encodes a URL as a bech32 LNURL string (LUD-01).

```ts
const encoded = lnurl.encodeLnurl('https://service.com/api?q=3fc3645b')
// 'lnurl1dp68gurn8ghj7...'
```

## lnurl.decodeLnurl

```ts
function decodeLnurl(encoded: string): string
```

Decodes a bech32 LNURL string back to the original URL (LUD-01). Throws `LnurlError` if the prefix is not `lnurl`.

```ts
const url = lnurl.decodeLnurl('lnurl1dp68gurn8ghj7...')
// 'https://service.com/api?q=3fc3645b'
```

## lnurl.isLnurl

```ts
function isLnurl(str: string): boolean
```

Checks if a string is a valid bech32-encoded LNURL (LUD-01).

```ts
lnurl.isLnurl('lnurl1dp68gurn8ghj7...') // true
lnurl.isLnurl('not-an-lnurl')            // false
```

## lnurl.resolveUrl

```ts
function resolveUrl(input: string): { url: string; tag?: string }
```

Resolves an LNURL to a plain URL (LUD-17). Accepts bech32-encoded LNURLs, scheme-prefixed URLs (`lnurlp://`, `lnurlw://`, `lnurlc://`, `keyauth://`), or plain `https://` URLs as passthrough.

```ts
// Bech32 LNURL
const { url } = lnurl.resolveUrl('lnurl1dp68gurn8ghj7...')
// { url: 'https://service.com/api?q=3fc3645b' }

// LUD-17 scheme prefix
const result = lnurl.resolveUrl('lnurlp://service.com/.well-known/lnurlp/alice')
// { url: 'https://service.com/.well-known/lnurlp/alice', tag: 'payRequest' }

// Plain URL passthrough
const plain = lnurl.resolveUrl('https://service.com/lnurl')
// { url: 'https://service.com/lnurl' }
```

## lnurl.parseLnurlMetadata

```ts
function parseLnurlMetadata(metadata: string): LnurlMetadata
```

Parses the LNURL metadata JSON string into structured data (LUD-06/20). Metadata is a JSON-encoded array of `[mime-type, content]` tuples.

```ts
const meta = lnurl.parseLnurlMetadata(payRequest.metadata)
console.log(meta.plainText)  // 'Pay to alice@service.com'
console.log(meta.longDesc)   // Long description (LUD-20), if present
console.log(meta.image)      // { type: 'image/png', data: 'base64...' }
console.log(meta.entries)    // [['text/plain', 'Pay to alice@service.com'], ...]
```

## lnurl.fetchPayRequest

```ts
function fetchPayRequest(input: string): Promise<PayRequestResponse>
```

Fetches a pay request from an LNURL endpoint (LUD-06). Accepts bech32 LNURL, scheme-prefixed URL, or plain URL.

```ts
const payRequest = await lnurl.fetchPayRequest('lnurl1dp68gurn8ghj7...')
console.log(payRequest.minSendable)    // 1000 (msats)
console.log(payRequest.maxSendable)    // 1000000000 (msats)
console.log(payRequest.commentAllowed) // 144 (LUD-12)
console.log(payRequest.payerData)      // PayerDataSpec (LUD-18)
console.log(payRequest.allowsNostr)    // true (for zaps)
```

## lnurl.requestInvoice

```ts
function requestInvoice(
  payRequest: PayRequestResponse,
  amountMsats: number,
  opts?: RequestInvoiceOptions,
): Promise<PayRequestCallbackResponse>
```

Requests an invoice from a pay request callback (LUD-06). Supports comments (LUD-12), payer data (LUD-18), and nostr zap requests. Throws if the amount is outside the allowed range.

```ts
const payRequest = await lnurl.fetchPayRequest('lnurl1dp68gurn8ghj7...')

// Simple invoice request
const { pr, successAction } = await lnurl.requestInvoice(payRequest, 10000)

// With comment (LUD-12) and payer data (LUD-18)
const response = await lnurl.requestInvoice(payRequest, 50000, {
  comment: 'Great work!',
  payerData: {
    name: 'Alice',
    email: 'alice@example.com',
  },
})

console.log(response.pr)            // BOLT-11 invoice string
console.log(response.successAction) // SuccessAction, if any
console.log(response.verify)        // LUD-21 verify URL, if any
```

## lnurl.fetchWithdrawRequest

```ts
function fetchWithdrawRequest(input: string): Promise<WithdrawRequestResponse>
```

Fetches a withdraw request from an LNURL endpoint (LUD-03).

```ts
const withdraw = await lnurl.fetchWithdrawRequest('lnurl1dp68gurn8ghj7...')
console.log(withdraw.minWithdrawable) // 1000 (msats)
console.log(withdraw.maxWithdrawable) // 500000 (msats)
console.log(withdraw.k1)              // server-provided unique identifier
```

## lnurl.submitWithdrawRequest

```ts
function submitWithdrawRequest(
  withdrawRequest: WithdrawRequestResponse,
  invoice: string,
): Promise<void>
```

Submits a withdraw request with a BOLT-11 invoice (LUD-03). The service will pay the provided invoice.

```ts
const withdraw = await lnurl.fetchWithdrawRequest('lnurl1dp68gurn8ghj7...')
const invoice = 'lnbc10u1p...' // your BOLT-11 invoice
await lnurl.submitWithdrawRequest(withdraw, invoice)
```

## lnurl.parseSuccessAction

```ts
function parseSuccessAction(raw: unknown): SuccessAction
```

Parses and validates a success action object (LUD-09). Returns a typed `SuccessAction` or throws on invalid input.

```ts
const action = lnurl.parseSuccessAction(callbackResponse.successAction)
switch (action.tag) {
  case 'message':
    console.log(action.message)
    break
  case 'url':
    console.log(action.description, action.url)
    break
  case 'aes':
    // Decrypt with preimage (see decryptAesSuccessAction)
    break
}
```

## lnurl.decryptAesSuccessAction

```ts
function decryptAesSuccessAction(
  action: Extract<SuccessAction, { tag: 'aes' }>,
  preimageHex: string,
): Promise<string>
```

Decrypts an AES-encrypted success action using the payment preimage (LUD-10). Uses AES-256-CBC with PKCS5 padding via the Web Crypto API. The preimage must be 32 bytes (64 hex characters).

```ts
const response = await lnurl.requestInvoice(payRequest, 10000)

// After payment is complete and you have the preimage:
if (response.successAction?.tag === 'aes') {
  const plaintext = await lnurl.decryptAesSuccessAction(
    response.successAction,
    'abcdef0123456789...',  // 64-char hex preimage
  )
  console.log(plaintext) // decrypted message from the service
}
```

## lnurl.verifyPayment

```ts
function verifyPayment(verifyUrl: string): Promise<VerifyResponse>
```

Polls a verify URL to check if a payment has been settled (LUD-21).

```ts
const response = await lnurl.requestInvoice(payRequest, 10000)

// After paying the invoice, check settlement status
if (response.verify) {
  const status = await lnurl.verifyPayment(response.verify)
  console.log(status.settled)  // true if payment is confirmed
  console.log(status.preimage) // payment preimage hex string
  console.log(status.pr)       // the original invoice
}
```

## How It Works

- **LUD-01** defines bech32 encoding for LNURL strings, making URLs shareable as QR codes
- **LUD-03** allows services to push sats to a user's wallet by providing an invoice to a withdraw endpoint
- **LUD-06** is the core pay request flow: fetch service parameters, then request an invoice for a specific amount
- **LUD-09/10** define success actions the wallet should perform after payment (show message, open URL, or decrypt AES content)
- **LUD-12** allows attaching a text comment to a payment, bounded by `commentAllowed` length
- **LUD-17** introduces human-readable scheme prefixes (`lnurlp://`, `lnurlw://`) as alternatives to bech32
- **LUD-18** enables the payer to optionally share identity information (name, email, pubkey) with the service
- **LUD-20** extends metadata with a `text/long-desc` entry for richer service descriptions
- **LUD-21** provides a polling endpoint to verify whether a payment has settled
