# NWC

The main class for interacting with NWC-compatible wallets.

## Import

```ts
import { NWC } from 'nostr-core'
```

## Constructor

```ts
new NWC(connectionString: string)
```

Parses an NWC connection string and creates a client instance.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `connectionString` | `string` | NWC URI (`nostr+walletconnect://...` or `nostrwalletconnect://...`) |

**Throws:** `NWCError` with code `'INVALID_CONNECTION_STRING'` if the URI can't be parsed.

The connection string format is:

```
nostr+walletconnect://<walletPubkey>?relay=<relayUrl>&secret=<hexOrNsec>
```

Multiple relays are supported:

```
nostr+walletconnect://<pubkey>?relay=wss://relay1.com&relay=wss://relay2.com&secret=<hex>
```

When multiple relays are provided, the NWC client connects to all of them in parallel and publishes requests to all relays for redundancy. Connection succeeds if at least one relay connects.

## Static Methods

### parseConnectionString

```ts
NWC.parseConnectionString(connectionString: string): NWCConnectionOptions
```

Parses a connection string without creating a client. Extracts all `relay` params.

**Returns:** [`NWCConnectionOptions`](/api/types#nwcconnectionoptions)

```ts
const { walletPubkey, relayUrl, relayUrls, secret } = NWC.parseConnectionString(
  'nostr+walletconnect://pubkey?relay=wss://r1.com&relay=wss://r2.com&secret=abc'
)
// relayUrl   → 'wss://r1.com'        (first relay, for backward compat)
// relayUrls  → ['wss://r1.com', 'wss://r2.com']  (all relays)
```

## Properties

### replyTimeout

```ts
nwc.replyTimeout: number // default: 60000
```

Milliseconds to wait for a wallet reply. Set before calling wallet methods.

### publishTimeout

```ts
nwc.publishTimeout: number // default: 5000
```

Milliseconds to wait for relay acknowledgement when publishing events.

### connected

```ts
nwc.connected: boolean // getter
```

Whether the underlying relay connection is active.

## Connection

### connect

```ts
await nwc.connect(): Promise<void>
```

Connects to the relay and auto-detects encryption (NIP-04 or NIP-44).

- Connects to the relay with a 5-second timeout
- Queries the wallet's service info event (kind `13194`) to detect encryption
- Starts notification subscription if event handlers are registered

**Throws:** `NWCConnectionError` on failure.

### close

```ts
nwc.close(): void
```

Closes the notification subscription, relay connection, and clears all event handlers.

## Wallet Methods

### getInfo

```ts
await nwc.getInfo(): Promise<GetInfoResponse>
```

Returns wallet metadata. Uses a 10-second reply timeout.

**Returns:** [`GetInfoResponse`](/api/types#getinforesponse)

### getBalance

```ts
await nwc.getBalance(): Promise<GetBalanceResponse>
```

Returns the wallet balance in millisatoshis. Uses a 10-second reply timeout.

**Returns:** [`GetBalanceResponse`](/api/types#getbalanceresponse)

### getBudget

```ts
await nwc.getBudget(): Promise<GetBudgetResponse>
```

Returns the NWC spending budget info. Uses a 10-second reply timeout.

**Returns:** [`GetBudgetResponse`](/api/types#getbudgetresponse)

### payInvoice

```ts
await nwc.payInvoice(invoice: string, amount?: number): Promise<PayResponse>
```

Pays a BOLT-11 Lightning invoice.

| Parameter | Type | Description |
|-----------|------|-------------|
| `invoice` | `string` | BOLT-11 invoice |
| `amount` | `number?` | Amount in msats (for zero-amount invoices) |

**Returns:** [`PayResponse`](/api/types#payresponse)

### payKeysend

```ts
await nwc.payKeysend(params: PayKeysendRequest): Promise<PayResponse>
```

Sends a keysend payment to a node pubkey.

**Parameters:** [`PayKeysendRequest`](/api/types#paykeysendrequest)

**Returns:** [`PayResponse`](/api/types#payresponse)

### makeInvoice

```ts
await nwc.makeInvoice(params: MakeInvoiceRequest): Promise<Transaction>
```

Creates a Lightning invoice.

**Parameters:** [`MakeInvoiceRequest`](/api/types#makeinvoicerequest)

**Returns:** [`Transaction`](/api/types#transaction)

### lookupInvoice

```ts
await nwc.lookupInvoice(params: LookupInvoiceRequest): Promise<Transaction>
```

Looks up an invoice by payment hash or invoice string.

**Parameters:** [`LookupInvoiceRequest`](/api/types#lookupinvoicerequest)

**Returns:** [`Transaction`](/api/types#transaction)

### listTransactions

```ts
await nwc.listTransactions(params?: ListTransactionsRequest): Promise<ListTransactionsResponse>
```

Lists transactions with optional filtering. Uses a 10-second reply timeout.

**Parameters:** [`ListTransactionsRequest`](/api/types#listtransactionsrequest)

**Returns:** [`ListTransactionsResponse`](/api/types#listtransactionsresponse)

### signMessage

```ts
await nwc.signMessage(message: string): Promise<SignMessageResponse>
```

Signs a message with the wallet's key.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Message to sign |

**Returns:** [`SignMessageResponse`](/api/types#signmessageresponse)

## Notifications

### subscribeNotifications

```ts
await nwc.subscribeNotifications(
  onNotification: (notification: Nip47Notification) => void,
  notificationTypes?: Nip47NotificationType[]
): Promise<() => void>
```

Subscribes to NIP-47 wallet notifications (kind `23196` for NIP-04, kind `23197` for NIP-44). Returns an unsubscribe function.

- Automatically selects the correct notification event kind based on encryption type
- Filters notifications by type if `notificationTypes` is provided
- Auto-reconnects with a 1-second delay if the relay connection closes

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `onNotification` | `Function` | Callback invoked with each notification |
| `notificationTypes` | `Nip47NotificationType[]?` | Optional filter for notification types |

**Returns:** `Promise<() => void>` - call the returned function to unsubscribe.

**Throws:** `NWCConnectionError` if not connected.

```ts
const unsub = await nwc.subscribeNotifications((notification) => {
  console.log(notification.notification_type, notification.notification)
}, ['payment_received', 'hold_invoice_accepted'])

// Later, stop listening:
unsub()
```

### on (Event Emitter)

```ts
nwc.on(event: Nip47NotificationType, handler: (notification: Nip47Notification) => void): void
```

Registers a handler for payment notifications using an event emitter pattern. If already connected, starts the notification subscription automatically.

| Event | Description |
|-------|-------------|
| `'payment_received'` | Incoming payment received |
| `'payment_sent'` | Outgoing payment completed |
| `'hold_invoice_accepted'` | Hold invoice accepted by payer |

```ts
nwc.on('payment_received', (notification) => {
  const tx = notification.notification // Transaction object
  console.log(`Received ${tx.amount} msats`)
})

nwc.on('hold_invoice_accepted', (notification) => {
  const tx = notification.notification
  console.log(`Hold invoice ${tx.payment_hash} accepted`)
})
```

### off

```ts
nwc.off(event: Nip47NotificationType, handler: Function): void
```

Removes a previously registered event handler.
