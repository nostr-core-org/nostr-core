# Types

All TypeScript types exported by nostr-core.

## Import

```ts
import type {
  GetInfoResponse,
  GetBalanceResponse,
  GetBudgetResponse,
  PayResponse,
  Transaction,
  // ... etc
} from 'nostr-core'
```

## NWC Types

### NWCConnectionOptions

```ts
type NWCConnectionOptions = {
  walletPubkey: string
  relayUrl: string      // Primary relay (first in connection string)
  relayUrls: string[]   // All relays from the connection string
  secret: string
}
```

### EncryptionType

```ts
type EncryptionType = 'nip04' | 'nip44'
```

### Nip47Method

```ts
type Nip47Method =
  | 'get_info'
  | 'get_balance'
  | 'get_budget'
  | 'make_invoice'
  | 'pay_invoice'
  | 'pay_keysend'
  | 'lookup_invoice'
  | 'list_transactions'
  | 'sign_message'
```

### Nip47NotificationType

```ts
type Nip47NotificationType = 'payment_received' | 'payment_sent' | 'hold_invoice_accepted'
```

### Nip47Notification

```ts
type Nip47Notification = {
  notification_type: Nip47NotificationType
  notification: Transaction
}
```

## Response Types

### GetInfoResponse

```ts
type GetInfoResponse = {
  alias: string
  color: string
  pubkey: string
  network: string
  block_height: number
  block_hash: string
  methods: string[]
  notifications?: string[]
}
```

### GetBalanceResponse

```ts
type GetBalanceResponse = {
  balance: number // millisatoshis
}
```

### GetBudgetResponse

```ts
type GetBudgetResponse = {
  used_budget?: number
  total_budget?: number
  renews_at?: number
  renewal_period?: string
}
```

### PayResponse

```ts
type PayResponse = {
  preimage: string
  fees_paid?: number
}
```

### Transaction

```ts
type Transaction = {
  type: 'incoming' | 'outgoing'
  state: 'settled' | 'pending' | 'failed' | 'accepted'
  invoice: string
  description: string
  description_hash: string
  preimage: string
  payment_hash: string
  amount: number         // millisatoshis
  fees_paid: number
  settled_at: number     // unix timestamp
  created_at: number     // unix timestamp
  expires_at: number     // unix timestamp
  metadata?: Record<string, unknown>
}
```

| Field | Type | Description |
|-------|------|-------------|
| `state` | `string` | Transaction state: `'settled'`, `'pending'`, `'failed'`, or `'accepted'` (hold invoices) |

### ListTransactionsResponse

```ts
type ListTransactionsResponse = {
  transactions: Transaction[]
}
```

### SignMessageResponse

```ts
type SignMessageResponse = {
  message: string
  signature: string
}
```

## Request Types

### MakeInvoiceRequest

```ts
type MakeInvoiceRequest = {
  amount: number           // millisatoshis
  description?: string
  description_hash?: string
  expiry?: number          // seconds
}
```

### PayInvoiceRequest

```ts
type PayInvoiceRequest = {
  invoice: string
  amount?: number // millisatoshis, for zero-amount invoices
}
```

### PayKeysendRequest

```ts
type PayKeysendRequest = {
  amount: number   // millisatoshis
  pubkey: string
  preimage?: string
  tlv_records?: Array<{ type: number; value: string }>
}
```

### LookupInvoiceRequest

```ts
type LookupInvoiceRequest = {
  payment_hash?: string
  invoice?: string
}
```

### ListTransactionsRequest

```ts
type ListTransactionsRequest = {
  from?: number
  until?: number
  limit?: number
  offset?: number
  unpaid?: boolean
  type?: 'incoming' | 'outgoing'
}
```

### SignMessageRequest

```ts
type SignMessageRequest = {
  message: string
}
```

## Event Types

See the [Event API reference](/api/event) for `NostrEvent`, `EventTemplate`, `UnsignedEvent`, and `VerifiedEvent`.

## Filter Type

See the [Filter API reference](/api/filter) for the `Filter` type.

## NIP-19 Types

See the [NIP-19 API reference](/api/nip19) for `ProfilePointer`, `EventPointer`, `AddressPointer`, and `DecodedResult`.
