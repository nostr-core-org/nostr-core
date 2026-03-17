# NIP-58

Badges - defines badge definitions (kind 30009), badge awards (kind 8), and profile badge displays (kind 30008). Badge issuers create definitions, award them to users, and users curate which badges to display on their profile.

## Import

```ts
import { nip58 } from 'nostr-core'
// or import individual functions
import {
  createBadgeDefinitionTemplate,
  createBadgeDefinitionEvent,
  parseBadgeDefinition,
  createBadgeAwardTemplate,
  createBadgeAwardEvent,
  parseBadgeAward,
  createProfileBadgesTemplate,
  createProfileBadgesEvent,
  parseProfileBadges,
  createBadgeRequestTemplate,
  parseBadgeRequest,
  extractBadgeProof,
  validateBadgeAward,
  createBadgeAcceptanceTemplate,
  createBadgeAcceptanceEvent,
  createBadgeRejectionTemplate,
  createBadgeRejectionEvent,
  buildBadgeAddress,
  hasBeenAwarded,
} from 'nostr-core'
```

## BadgeDefinition Type

```ts
type BadgeDefinition = {
  identifier: string
  name?: string
  description?: string
  image?: string
  thumbs?: string[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `identifier` | `string` | Unique badge identifier (`d` tag value) |
| `name` | `string` (optional) | Human-readable badge name |
| `description` | `string` (optional) | Badge description |
| `image` | `string` (optional) | Badge image URL |
| `thumbs` | `string[]` (optional) | Thumbnail image URLs |

## BadgeAward Type

```ts
type BadgeAward = {
  badgeAddress: string
  recipients: string[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `badgeAddress` | `string` | Badge address in `30009:issuer-pubkey:identifier` format |
| `recipients` | `string[]` | Pubkeys of users receiving the badge |

## ProfileBadge Type

```ts
type ProfileBadge = {
  badgeAddress: string
  awardEventId: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `badgeAddress` | `string` | Badge definition address (`30009:pubkey:identifier`) |
| `awardEventId` | `string` | ID of the kind 8 award event proving the badge |

## BadgeProof Type

```ts
type BadgeProof =
  | { type: 'pow'; difficulty: number; nonce: string }
  | { type: 'payment'; preimage: string; invoice: string }
  | { type: 'membership'; groupId: string; membershipEventId: string }
```

| Variant | Fields | Description |
|---------|--------|-------------|
| `'pow'` | `difficulty`, `nonce` | Proof-of-work badge proof |
| `'payment'` | `preimage`, `invoice` | Lightning payment proof |
| `'membership'` | `groupId`, `membershipEventId` | Group membership proof |

## BadgeRequest Type

```ts
type BadgeRequest = {
  badgeAddress: string
  proof?: BadgeProof
  content?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `badgeAddress` | `string` | Badge being requested |
| `proof` | `BadgeProof` (optional) | Proof to include with the request |
| `content` | `string` (optional) | Human-readable request message |

## BadgeAcceptance Type

```ts
type BadgeAcceptance = {
  requestEventId: string
  badgeAddress: string
  recipientPubkey: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `requestEventId` | `string` | ID of the kind 8433 badge request event |
| `badgeAddress` | `string` | Badge being accepted |
| `recipientPubkey` | `string` | Pubkey of the requester to award |

## BadgeRejection Type

```ts
type BadgeRejection = {
  requestEventId: string
  badgeAddress: string
  reason?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `requestEventId` | `string` | ID of the kind 8433 badge request event |
| `badgeAddress` | `string` | Badge being rejected |
| `reason` | `string` (optional) | Reason for rejection |

## nip58.createBadgeDefinitionTemplate

```ts
function createBadgeDefinitionTemplate(badge: BadgeDefinition): EventTemplate
```

Creates an unsigned kind 30009 badge definition event template. Use with `finalizeEvent()` or pass to a `Signer`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `badge` | `BadgeDefinition` | Badge definition data |

**Returns:** `EventTemplate` - Unsigned kind 30009 event with `d`, `name`, `description`, `image`, and `thumb` tags.

```ts
const template = nip58.createBadgeDefinitionTemplate({
  identifier: 'early-adopter',
  name: 'Early Adopter',
  description: 'Awarded to early community members',
  image: 'https://example.com/badges/early-adopter.png',
  thumbs: ['https://example.com/badges/early-adopter-thumb.png'],
})
```

## nip58.createBadgeDefinitionEvent

```ts
function createBadgeDefinitionEvent(badge: BadgeDefinition, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 30009 badge definition event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `badge` | `BadgeDefinition` | Badge definition data |
| `secretKey` | `Uint8Array` | Issuer's secret key (32 bytes) |

**Returns:** `NostrEvent` - Signed kind 30009 badge definition event.

```ts
const badgeDef = nip58.createBadgeDefinitionEvent(
  {
    identifier: 'early-adopter',
    name: 'Early Adopter',
    description: 'Awarded to early community members',
    image: 'https://example.com/badges/early-adopter.png',
  },
  issuerSecretKey,
)
await pool.publish(['wss://relay.example.com'], badgeDef)
```

## nip58.parseBadgeDefinition

```ts
function parseBadgeDefinition(event: NostrEvent): BadgeDefinition
```

Parses a kind 30009 badge definition event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | A kind 30009 event |

**Returns:** `BadgeDefinition` - Parsed badge definition.

```ts
const def = nip58.parseBadgeDefinition(badgeDefEvent)
console.log(def)
// { identifier: 'early-adopter', name: 'Early Adopter', ... }
```

## nip58.createBadgeAwardTemplate

```ts
function createBadgeAwardTemplate(award: BadgeAward): EventTemplate
```

Creates an unsigned kind 8 badge award event template.

| Parameter | Type | Description |
|-----------|------|-------------|
| `award` | `BadgeAward` | Badge address and recipient pubkeys |

**Returns:** `EventTemplate` - Unsigned kind 8 event with `a` and `p` tags.

```ts
const template = nip58.createBadgeAwardTemplate({
  badgeAddress: '30009:issuer-pubkey:early-adopter',
  recipients: ['user1-pubkey', 'user2-pubkey'],
})
```

## nip58.createBadgeAwardEvent

```ts
function createBadgeAwardEvent(award: BadgeAward, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 8 badge award event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `award` | `BadgeAward` | Badge address and recipients |
| `secretKey` | `Uint8Array` | Issuer's secret key (32 bytes) |

**Returns:** `NostrEvent` - Signed kind 8 badge award event.

```ts
const award = nip58.createBadgeAwardEvent(
  {
    badgeAddress: `30009:${issuerPubkey}:early-adopter`,
    recipients: ['user1-pubkey', 'user2-pubkey', 'user3-pubkey'],
  },
  issuerSecretKey,
)
await pool.publish(['wss://relay.example.com'], award)
```

## nip58.parseBadgeAward

```ts
function parseBadgeAward(event: NostrEvent): BadgeAward
```

Parses a kind 8 badge award event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | A kind 8 event |

**Returns:** `BadgeAward` - Parsed badge address and recipient list.

```ts
const award = nip58.parseBadgeAward(awardEvent)
console.log(award.badgeAddress)  // '30009:issuer:early-adopter'
console.log(award.recipients)    // ['user1', 'user2']
```

## nip58.createProfileBadgesTemplate

```ts
function createProfileBadgesTemplate(badges: ProfileBadge[]): EventTemplate
```

Creates an unsigned kind 30008 profile badges event template with `d` tag `'profile_badges'`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `badges` | `ProfileBadge[]` | Badges to display on profile |

**Returns:** `EventTemplate` - Unsigned kind 30008 event with paired `a` and `e` tags.

```ts
const template = nip58.createProfileBadgesTemplate([
  { badgeAddress: '30009:issuer:early-adopter', awardEventId: 'award-event-id-1' },
  { badgeAddress: '30009:issuer:contributor', awardEventId: 'award-event-id-2' },
])
```

## nip58.createProfileBadgesEvent

```ts
function createProfileBadgesEvent(badges: ProfileBadge[], secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 30008 profile badges event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `badges` | `ProfileBadge[]` | Badges to display |
| `secretKey` | `Uint8Array` | User's secret key (32 bytes) |

**Returns:** `NostrEvent` - Signed kind 30008 event.

```ts
const profileBadges = nip58.createProfileBadgesEvent(
  [
    { badgeAddress: '30009:issuer:early-adopter', awardEventId: 'award-id' },
  ],
  userSecretKey,
)
await pool.publish(['wss://relay.example.com'], profileBadges)
```

## nip58.parseProfileBadges

```ts
function parseProfileBadges(event: NostrEvent): ProfileBadge[]
```

Parses a kind 30008 profile badges event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | A kind 30008 event |

**Returns:** `ProfileBadge[]` - Array of badge references with award event IDs.

```ts
const badges = nip58.parseProfileBadges(profileBadgesEvent)
// [
//   { badgeAddress: '30009:issuer:early-adopter', awardEventId: 'award-id-1' },
//   { badgeAddress: '30009:issuer:contributor', awardEventId: 'award-id-2' },
// ]
```

## nip58.createBadgeRequestTemplate

```ts
function createBadgeRequestTemplate(request: BadgeRequest): EventTemplate
```

Creates a badge request event template with optional proof.

| Parameter | Type | Description |
|-----------|------|-------------|
| `request` | `BadgeRequest` | Badge address and optional proof |

**Returns:** `EventTemplate` - Unsigned kind 8433 event with `a` and optional `proof` tags.

```ts
const template = nip58.createBadgeRequestTemplate({
  badgeAddress: '30009:issuer:verified',
  proof: { type: 'payment', preimage: 'abc123...', invoice: 'lnbc...' },
  content: 'Requesting verified badge after payment',
})
```

## nip58.parseBadgeRequest

```ts
function parseBadgeRequest(event: NostrEvent): BadgeRequest
```

Parses a kind 8433 badge request event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | A kind 8433 event |

**Returns:** `BadgeRequest` - Parsed badge address, proof, and content.

## nip58.extractBadgeProof

```ts
function extractBadgeProof(event: NostrEvent): BadgeProof | undefined
```

Extracts and parses a badge proof from an event's `proof` tag.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | Event with a `proof` tag |

**Returns:** `BadgeProof | undefined` - Parsed proof, or `undefined` if no valid proof tag exists.

```ts
const proof = nip58.extractBadgeProof(requestEvent)
if (proof?.type === 'payment') {
  console.log(`Payment proof: ${proof.preimage}`)
}
```

## nip58.createBadgeAcceptanceTemplate / createBadgeAcceptanceEvent

```ts
function createBadgeAcceptanceTemplate(acceptance: BadgeAcceptance): EventTemplate
function createBadgeAcceptanceEvent(acceptance: BadgeAcceptance, secretKey: Uint8Array): NostrEvent
```

Creates a kind 8434 badge acceptance event, published by the badge issuer to accept a badge request.

```ts
const acceptance = nip58.createBadgeAcceptanceEvent({
  requestEventId: requestEvent.id,
  badgeAddress: '30009:issuer:verified',
  recipientPubkey: requesterPk,
}, issuerSecretKey)
```

## nip58.createBadgeRejectionTemplate / createBadgeRejectionEvent

```ts
function createBadgeRejectionTemplate(rejection: BadgeRejection): EventTemplate
function createBadgeRejectionEvent(rejection: BadgeRejection, secretKey: Uint8Array): NostrEvent
```

Creates a kind 8435 badge rejection event, published by the badge issuer to reject a badge request.

```ts
const rejection = nip58.createBadgeRejectionEvent({
  requestEventId: requestEvent.id,
  badgeAddress: '30009:issuer:verified',
  reason: 'Payment proof could not be verified',
}, issuerSecretKey)
```

## nip58.buildBadgeAddress

```ts
function buildBadgeAddress(definition: NostrEvent): string
```

Builds a badge address string (`30009:pubkey:identifier`) from a badge definition event.

```ts
const address = nip58.buildBadgeAddress(badgeDefEvent)
// '30009:abc123...:early-adopter'
```

## nip58.hasBeenAwarded

```ts
function hasBeenAwarded(pubkey: string, badgeAwards: NostrEvent[]): boolean
```

Checks if a user has been awarded a specific badge by inspecting an array of badge award events.

```ts
const awarded = nip58.hasBeenAwarded(userPk, badgeAwardEvents)
if (awarded) console.log('User has this badge!')
```

## nip58.validateBadgeAward

```ts
function validateBadgeAward(award: NostrEvent, definition: NostrEvent): boolean
```

Validates that a badge award event references the correct badge definition. Checks that the award is kind 8, the definition is kind 30009, and the award's `a` tag matches `30009:pubkey:identifier`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `award` | `NostrEvent` | A kind 8 badge award event |
| `definition` | `NostrEvent` | A kind 30009 badge definition event |

**Returns:** `boolean` - `true` if the award's `a` tag matches the definition's address.

```ts
const isValid = nip58.validateBadgeAward(awardEvent, definitionEvent)
if (isValid) {
  console.log('This badge award is legitimate')
}
```

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip58, RelayPool } from 'nostr-core'

const issuerSk = generateSecretKey()
const issuerPk = getPublicKey(issuerSk)
const userSk = generateSecretKey()
const userPk = getPublicKey(userSk)
const pool = new RelayPool()

// Step 1: Issuer creates a badge definition
const badgeDef = nip58.createBadgeDefinitionEvent(
  {
    identifier: 'early-adopter',
    name: 'Early Adopter',
    description: 'Joined before 1000 members',
    image: 'https://example.com/badges/early.png',
  },
  issuerSk,
)
await pool.publish(['wss://relay.example.com'], badgeDef)

// Step 2: Issuer awards the badge to users
const award = nip58.createBadgeAwardEvent(
  {
    badgeAddress: `30009:${issuerPk}:early-adopter`,
    recipients: [userPk],
  },
  issuerSk,
)
await pool.publish(['wss://relay.example.com'], award)

// Step 3: User adds the badge to their profile
const profileBadges = nip58.createProfileBadgesEvent(
  [{ badgeAddress: `30009:${issuerPk}:early-adopter`, awardEventId: award.id }],
  userSk,
)
await pool.publish(['wss://relay.example.com'], profileBadges)

// Step 4: Fetch and display a user's badges
const [profileEvent] = await pool.querySync(
  ['wss://relay.example.com'],
  { kinds: [30008], authors: [userPk], '#d': ['profile_badges'] },
)

if (profileEvent) {
  const badges = nip58.parseProfileBadges(profileEvent)

  for (const badge of badges) {
    // Fetch the badge definition
    const [kind, pubkey, identifier] = badge.badgeAddress.split(':')
    const [defEvent] = await pool.querySync(
      ['wss://relay.example.com'],
      { kinds: [30009], authors: [pubkey], '#d': [identifier] },
    )
    if (defEvent) {
      const def = nip58.parseBadgeDefinition(defEvent)
      console.log(`Badge: ${def.name} - ${def.description}`)
    }
  }
}

// Validate an award against its definition
const isValid = nip58.validateBadgeAward(award, badgeDef)
console.log(`Award valid: ${isValid}`) // true

pool.close()
```

## How It Works

- **Kind 30009** is a parameterized replaceable badge definition event created by the issuer
- **Kind 8** is a badge award event that references the badge and lists recipient pubkeys
- **Kind 30008** with `d` tag `'profile_badges'` is a user's curated list of badges to display
- Badge addresses follow the format `30009:issuer-pubkey:identifier`
- Profile badges are stored as alternating `a` (badge address) and `e` (award event ID) tag pairs
- `validateBadgeAward` verifies the award's `a` tag matches the expected `kind:pubkey:identifier` format
- Only the badge issuer can create valid award events (verified by checking the award event's pubkey)
- Users choose which badges to display by publishing their own kind 30008 event

### Badge Request Flow (Custom Extension)

The request flow extends NIP-58 with three additional event kinds for requesting, accepting, and rejecting badges:

- **Kind 8433** — Badge Request: a user requests a badge with optional proof (PoW, payment, or membership)
- **Kind 8434** — Badge Acceptance: the issuer accepts the request and implicitly awards the badge
- **Kind 8435** — Badge Rejection: the issuer rejects the request with an optional reason

**Badges as Identity Verifiers:**

Badges can serve as decentralized identity proofs:
- **Proof of Work** — the requester demonstrates computational effort (e.g., mining a nonce with target difficulty)
- **Proof of Payment** — the requester proves a Lightning payment via preimage and invoice
- **Proof of Membership** — the requester proves membership in a group via a group membership event reference
