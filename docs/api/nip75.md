# NIP-75

Zap Goals - defines fundraising goals (kind 9041) that track zap contributions toward a target amount. Supports multiple beneficiaries, deadline cutoffs, and progress tracking.

## Import

```ts
import { nip75 } from 'nostr-core'
// or import individual functions
import {
  createZapGoalTemplate,
  createZapGoalEvent,
  parseZapGoal,
  isZapGoalOpen,
  calculateZapGoalProgress,
  buildGoalTag,
} from 'nostr-core'
```

## ZapBeneficiary Type

```ts
type ZapBeneficiary = {
  pubkey: string
  relay?: string
  weight?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pubkey` | `string` | Beneficiary's public key |
| `relay` | `string` (optional) | Preferred relay URL |
| `weight` | `string` (optional) | Relative weight for zap splitting |

## ZapGoal Type

```ts
type ZapGoal = {
  content: string
  amount: number
  relays: string[]
  closedAt?: number
  image?: string
  summary?: string
  references?: string[]
  addresses?: string[]
  beneficiaries?: ZapBeneficiary[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | `string` | Human-readable goal description |
| `amount` | `number` | Target amount in millisatoshis |
| `relays` | `string[]` | Relays to track zaps on |
| `closedAt` | `number` (optional) | Unix timestamp cutoff for contributions |
| `image` | `string` (optional) | Goal image URL |
| `summary` | `string` (optional) | Brief goal summary |
| `references` | `string[]` (optional) | External URLs (`r` tags) |
| `addresses` | `string[]` (optional) | Addressable event references (`a` tags) |
| `beneficiaries` | `ZapBeneficiary[]` (optional) | Zap split recipients (NIP-57 `zap` tags) |

## nip75.createZapGoalTemplate

```ts
function createZapGoalTemplate(goal: ZapGoal): EventTemplate
```

Creates an unsigned kind 9041 zap goal event template.

```ts
const template = nip75.createZapGoalTemplate({
  content: 'Fund our community relay!',
  amount: 500000000, // 500k sats in msats
  relays: ['wss://relay.damus.io'],
  closedAt: Math.floor(Date.now() / 1000) + 86400 * 30,
  summary: 'Building a free public relay for the community',
  beneficiaries: [
    { pubkey: dev1Pk, weight: '2' },
    { pubkey: dev2Pk, weight: '1' },
  ],
})
```

## nip75.createZapGoalEvent

```ts
function createZapGoalEvent(goal: ZapGoal, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 9041 zap goal event.

## nip75.parseZapGoal

```ts
function parseZapGoal(event: NostrEvent): ZapGoal
```

Parses a kind 9041 zap goal event.

```ts
const goal = nip75.parseZapGoal(goalEvent)
console.log(`Goal: ${goal.content}`)
console.log(`Target: ${goal.amount / 1000} sats`)
console.log(`Beneficiaries: ${goal.beneficiaries?.length ?? 0}`)
```

## nip75.isZapGoalOpen

```ts
function isZapGoalOpen(event: NostrEvent): boolean
```

Returns `true` if the goal has no `closed_at` tag or the current time is before the cutoff.

```ts
if (nip75.isZapGoalOpen(goalEvent)) {
  console.log('Goal is still accepting contributions!')
}
```

## nip75.calculateZapGoalProgress

```ts
function calculateZapGoalProgress(zapReceipts: NostrEvent[]): number
```

Calculates the total amount received from an array of kind 9735 zap receipt events. Returns the sum in millisatoshis.

```ts
const progress = nip75.calculateZapGoalProgress(receipts)
const goal = nip75.parseZapGoal(goalEvent)
const percentage = (progress / goal.amount) * 100
console.log(`${percentage.toFixed(1)}% funded (${progress / 1000} / ${goal.amount / 1000} sats)`)
```

## nip75.buildGoalTag

```ts
function buildGoalTag(goalEventId: string, relay?: string): string[]
```

Builds a `goal` tag for addressable events that reference a zap goal.

```ts
const tag = nip75.buildGoalTag(goalEvent.id, 'wss://relay.damus.io')
// ['goal', '<event-id>', 'wss://relay.damus.io']
```

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip75, nip57, RelayPool } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)
const pool = new RelayPool()

// Step 1: Create a zap goal
const goal = nip75.createZapGoalEvent({
  content: 'Help us ship v2.0 of the relay software!',
  amount: 2100000000, // 2.1M sats
  relays: ['wss://relay.damus.io'],
  closedAt: Math.floor(Date.now() / 1000) + 86400 * 60, // 60 days
  image: 'https://example.com/goal-banner.png',
  beneficiaries: [
    { pubkey: pk, weight: '1' },
  ],
}, sk)
await pool.publish(['wss://relay.damus.io'], goal)

// Step 2: Check goal status
const parsed = nip75.parseZapGoal(goal)
console.log(`Goal: ${parsed.content}`)
console.log(`Target: ${parsed.amount / 1000} sats`)
console.log(`Open: ${nip75.isZapGoalOpen(goal)}`)

// Step 3: Track zap contributions
const receipts = await pool.querySync(
  ['wss://relay.damus.io'],
  { kinds: [9735], '#e': [goal.id] },
)

const progress = nip75.calculateZapGoalProgress(receipts)
const pct = ((progress / parsed.amount) * 100).toFixed(1)
console.log(`Progress: ${progress / 1000} sats (${pct}%)`)

pool.close()
```

## How It Works

- **Kind 9041** is a zap goal event containing a target `amount` in millisatoshis and a list of `relays` to track contributions
- The `content` field holds a human-readable description of the goal
- `closed_at` sets a Unix timestamp deadline after which the goal stops accepting zaps
- `zap` tags (per NIP-57) define multiple beneficiaries with relative weights for splitting incoming zaps
- Addressable events can reference a goal via a `goal` tag containing the event ID and optional relay hint
- Clients should include goal event relays in zap request relay parameters
- Progress is calculated by summing the `amount` tags from zap requests embedded in zap receipt `description` tags
