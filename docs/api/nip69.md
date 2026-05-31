# NIP-69

Peer-to-peer order events (kind 38383) - addressable events that advertise buy/sell Bitcoin orders on P2P marketplaces (e.g. lnp2pbot, Mostro). Each order describes the asset, amount, payment methods, premium, and trade venue, and is keyed by a unique `d` identifier so it can be updated or canceled in place.

## Import

```ts
import { nip69 } from 'nostr-core'
// or import individual functions
import {
  createOrderEventTemplate,
  createOrderEvent,
  parseOrder,
  ORDER_KIND,
} from 'nostr-core'
```

## Types

```ts
type OrderType = 'buy' | 'sell'

type OrderStatus = 'pending' | 'canceled' | 'in-progress' | 'success' | 'expired'

type P2POrder = {
  id: string                          // `d` tag — unique order identifier
  type: OrderType                     // `k`
  fiatCurrency: string                // `f` — ISO 4217 code
  status: OrderStatus                 // `s`
  amount: number                      // `amt` — sats; 0 = market price
  fiatAmount: number | [number, number] // `fa` — fixed or [min, max] range
  paymentMethods: string[]            // `pm`
  premium: number                     // `premium` — percentage
  network: string                     // `network` — mainnet, testnet, ...
  layer: string                       // `layer` — onchain, lightning, liquid, ...
  platform: string                    // `y` — platform that created the order
  expiresAt?: number                  // `expires_at`
  expiration?: number                 // `expiration` (NIP-40)
  source?: string                     // `source` — link/redirect
  rating?: Record<string, unknown>    // `rating` — platform-defined JSON
  name?: string                       // `name` — maker display name
  geohash?: string                    // `g`
  bond?: number                       // `bond` — required security deposit (sats)
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier for the order (`d` tag) |
| `type` | `'buy' \| 'sell'` | Order direction |
| `fiatCurrency` | `string` | Fiat being traded, ISO 4217 (e.g. `VES`, `USD`) |
| `status` | `OrderStatus` | `pending`, `canceled`, `in-progress`, `success`, `expired` |
| `amount` | `number` | Bitcoin amount in satoshis; `0` means use a public price API |
| `fiatAmount` | `number \| [number, number]` | Fixed fiat amount, or `[min, max]` for a range order |
| `paymentMethods` | `string[]` | Accepted payment method(s) |
| `premium` | `number` | Premium percentage the maker is willing to pay |
| `network` | `string` | `mainnet`, `testnet`, `signet`, etc. |
| `layer` | `string` | `onchain`, `lightning`, `liquid`, etc. |
| `platform` | `string` | Platform identifier (`y` tag) |
| `expiresAt` | `number` (optional) | When a pending order should become `expired` |
| `expiration` | `number` (optional) | When the relay should delete the event (NIP-40) |
| `source` | `string` (optional) | Order source or redirect link |
| `rating` | `object` (optional) | Maker's rating; shape is platform-defined |
| `name` | `string` (optional) | Maker's display name |
| `geohash` | `string` (optional) | Location for face-to-face trades |
| `bond` | `number` (optional) | Required security deposit in satoshis |

## Constants

```ts
ORDER_KIND  // 38383
```

## nip69.createOrderEventTemplate

```ts
function createOrderEventTemplate(order: P2POrder): EventTemplate
```

Creates an unsigned kind 38383 order event template. The event `content` is always empty; everything lives in tags. A `z` tag of `order` is always added. Because kind 38383 is addressable, re-publishing with the same `id` (`d` tag) replaces the previous order.

**Returns:** `EventTemplate` - Unsigned kind 38383 event.

```ts
const template = nip69.createOrderEventTemplate({
  id: 'ede61c96-4c13-4519-bf3a-dcf7f1e9d842',
  type: 'sell',
  fiatCurrency: 'VES',
  status: 'pending',
  amount: 0,            // market price
  fiatAmount: 100,
  paymentMethods: ['face to face', 'bank transfer'],
  premium: 1,
  network: 'mainnet',
  layer: 'lightning',
  platform: 'lnp2pbot',
  expiresAt: 1719391096,
  expiration: 1719995896,
})

const signed = await signer.signEvent(template)
```

## nip69.createOrderEvent

```ts
function createOrderEvent(order: P2POrder, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 38383 order event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `order` | `P2POrder` | Order details |
| `secretKey` | `Uint8Array` | Signer's secret key (32 bytes) |

**Returns:** `NostrEvent` - Signed kind 38383 event ready to publish.

## nip69.parseOrder

```ts
function parseOrder(event: NostrEvent): P2POrder
```

Parses a kind 38383 event into a `P2POrder`. A range `fa` tag (`['fa', min, max]`) is returned as `[min, max]`; a single value is returned as a number. A malformed `rating` JSON payload is ignored.

```ts
const order = nip69.parseOrder(event)
console.log(`${order.type} ${order.fiatAmount} ${order.fiatCurrency} via ${order.paymentMethods.join(', ')}`)
```

## Full Example

```ts
import { generateSecretKey, nip69, RelayPool } from 'nostr-core'

const sk = generateSecretKey()
const pool = new RelayPool()

// Advertise a range sell order priced off the public market rate
const order = nip69.createOrderEvent(
  {
    id: 'order-2024-0042',
    type: 'sell',
    fiatCurrency: 'USD',
    status: 'pending',
    amount: 0,
    fiatAmount: [20, 200],
    paymentMethods: ['SEPA', 'Revolut'],
    premium: 2,
    network: 'mainnet',
    layer: 'lightning',
    platform: 'mostro',
    rating: { total_reviews: 12, total_rating: 4.8, max_rate: 5, min_rate: 1 },
    name: 'satoshi',
    bond: 5000,
    expiresAt: 1719391096,
    expiration: 1719995896,
  },
  sk,
)
await pool.publish(['wss://relay.mostro.network'], order)

// Read an order off the relay
const parsed = nip69.parseOrder(order)
if (Array.isArray(parsed.fiatAmount)) {
  console.log(`Range: ${parsed.fiatAmount[0]}–${parsed.fiatAmount[1]} ${parsed.fiatCurrency}`)
}

pool.close()
```

## How It Works

- **Kind 38383** is an addressable (parameterized replaceable) event; the `d` tag is the order identifier, so updating an order means re-publishing with the same `id`
- The `content` field is always empty — all data is in tags
- Required tags: `d`, `k` (buy/sell), `f` (fiat), `s` (status), `amt` (sats, `0` = market), `fa` (fiat amount or range), `pm` (payment methods), `premium`, `network`, `layer`, `y` (platform), `z` (`order`)
- The `pm` tag holds all payment methods as separate elements: `['pm', 'face to face', 'bank transfer']`
- The `fa` tag is `['fa', amount]` for a fixed price or `['fa', min, max]` for a range
- Optional tags: `source`, `rating` (JSON string), `name`, `g` (geohash), `bond`, plus `expires_at` and NIP-40 `expiration`
- Status moves through `pending` → `in-progress` → `success`, or to `canceled`/`expired`
