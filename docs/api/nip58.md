# NIP-58

Badges - defines badge definitions (kind 30009), badge awards (kind 8), profile badge displays (kind 30008), badge requests (kind 30058), and badge denials (kind 30059).

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
  createBadgeRequestEvent,
  parseBadgeRequest,
  createBadgeDenialTemplate,
  createBadgeDenialEvent,
  parseBadgeDenial,
  resolveBadgeRequestState,
  validateBadgeAward,
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

## BadgeRequest Type

```ts
type BadgeRequest = {
  badgeAddress: string
  issuerPubkey: string
  proofs?: string[]
  content?: string
  relayUrl?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `badgeAddress` | `string` | Badge address (`30009:issuer:identifier`) — also used as `d` tag |
| `issuerPubkey` | `string` | Pubkey of the badge issuer |
| `proofs` | `string[]` (optional) | Evidence supporting the request (URLs, text, or event IDs) |
| `content` | `string` (optional) | Message to the issuer |
| `relayUrl` | `string` (optional) | Relay hint for the badge definition |

## BadgeDenial Type

```ts
type BadgeDenial = {
  requestEventId: string
  badgeAddress: string
  requesterPubkey: string
  reason?: string
  relayUrl?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `requestEventId` | `string` | ID of the kind 30058 request event — also used as `d` tag |
| `badgeAddress` | `string` | Badge being denied |
| `requesterPubkey` | `string` | Pubkey of the requester |
| `reason` | `string` (optional) | Reason for denial (stored in `content`) |
| `relayUrl` | `string` (optional) | Relay hint |

## BadgeRequestState Type

```ts
type BadgeRequestState = 'fulfilled' | 'denied' | 'pending'
```

| State | Priority | Condition |
|-------|----------|-----------|
| `'fulfilled'` | 1 (highest) | Badge Award (kind 8) exists for this badge+user |
| `'denied'` | 2 | Badge Denial (kind 30059) exists for this request |
| `'pending'` | 3 (lowest) | Request exists, none of the above |

## nip58.createBadgeDefinitionTemplate

```ts
function createBadgeDefinitionTemplate(badge: BadgeDefinition): EventTemplate
```

Creates an unsigned kind 30009 badge definition event template.

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

```ts
const badgeDef = nip58.createBadgeDefinitionEvent(
  { identifier: 'early-adopter', name: 'Early Adopter' },
  issuerSecretKey,
)
```

## nip58.parseBadgeDefinition

```ts
function parseBadgeDefinition(event: NostrEvent): BadgeDefinition
```

Parses a kind 30009 badge definition event.

## nip58.createBadgeAwardTemplate / createBadgeAwardEvent

```ts
function createBadgeAwardTemplate(award: BadgeAward): EventTemplate
function createBadgeAwardEvent(award: BadgeAward, secretKey: Uint8Array): NostrEvent
```

Creates a kind 8 badge award event. This is also how an issuer "accepts" a badge request — by awarding the badge directly.

```ts
const award = nip58.createBadgeAwardEvent(
  { badgeAddress: `30009:${issuerPk}:early-adopter`, recipients: [userPk] },
  issuerSecretKey,
)
```

## nip58.parseBadgeAward

```ts
function parseBadgeAward(event: NostrEvent): BadgeAward
```

Parses a kind 8 badge award event.

## nip58.createProfileBadgesTemplate / createProfileBadgesEvent

```ts
function createProfileBadgesTemplate(badges: ProfileBadge[]): EventTemplate
function createProfileBadgesEvent(badges: ProfileBadge[], secretKey: Uint8Array): NostrEvent
```

Creates a kind 30008 profile badges event with `d` tag `'profile_badges'`.

```ts
const profileBadges = nip58.createProfileBadgesEvent(
  [{ badgeAddress: '30009:issuer:early-adopter', awardEventId: award.id }],
  userSecretKey,
)
```

## nip58.parseProfileBadges

```ts
function parseProfileBadges(event: NostrEvent): ProfileBadge[]
```

Parses a kind 30008 profile badges event.

## Badge Request & Denial (Draft Extension)

> **Note:** Kinds 30058 and 30059 are a [draft extension to NIP-58](https://github.com/nostr-protocol/nips/pull/2204), already implemented and working in [BadgeBox](https://badgebox.rinbal.de). Wider adoption across the network is needed to get this merged into the official spec.

## nip58.createBadgeRequestTemplate / createBadgeRequestEvent

```ts
function createBadgeRequestTemplate(request: BadgeRequest): EventTemplate
function createBadgeRequestEvent(request: BadgeRequest, secretKey: Uint8Array): NostrEvent
```

Creates a kind 30058 badge request event (addressable). The `d` tag is set to the badge address, ensuring one active request per badge per user. To withdraw, delete with NIP-09.

```ts
const request = nip58.createBadgeRequestEvent(
  {
    badgeAddress: '30009:alice:bravery',
    issuerPubkey: 'alice-pubkey',
    proofs: ['https://github.com/project/repo/pull/42'],
    content: 'I contributed the auth module!',
    relayUrl: 'wss://relay.damus.io',
  },
  userSecretKey,
)
```

## nip58.parseBadgeRequest

```ts
function parseBadgeRequest(event: NostrEvent): BadgeRequest
```

Parses a kind 30058 badge request event.

## nip58.createBadgeDenialTemplate / createBadgeDenialEvent

```ts
function createBadgeDenialTemplate(denial: BadgeDenial): EventTemplate
function createBadgeDenialEvent(denial: BadgeDenial, secretKey: Uint8Array): NostrEvent
```

Creates a kind 30059 badge denial event (addressable). The `d` tag is the request event id. Denials are soft — the user can re-request with better proof. To revoke, delete with NIP-09.

```ts
const denial = nip58.createBadgeDenialEvent(
  {
    requestEventId: requestEvent.id,
    badgeAddress: '30009:alice:bravery',
    requesterPubkey: 'bob-pubkey',
    reason: 'Please provide photo evidence.',
    relayUrl: 'wss://relay.damus.io',
  },
  issuerSecretKey,
)
```

## nip58.parseBadgeDenial

```ts
function parseBadgeDenial(event: NostrEvent): BadgeDenial
```

Parses a kind 30059 badge denial event.

## nip58.resolveBadgeRequestState

```ts
function resolveBadgeRequestState(
  request: NostrEvent,
  awards: NostrEvent[],
  denials: NostrEvent[],
): BadgeRequestState
```

Resolves the state of a badge request. Checks in priority order: fulfilled (award exists) > denied (denial exists) > pending.

```ts
const state = nip58.resolveBadgeRequestState(requestEvent, awards, denials)
// 'fulfilled' | 'denied' | 'pending'
```

## nip58.validateBadgeAward

```ts
function validateBadgeAward(award: NostrEvent, definition: NostrEvent): boolean
```

Validates that a badge award's `a` tag matches the expected `30009:pubkey:identifier` from the definition.

## nip58.buildBadgeAddress

```ts
function buildBadgeAddress(definition: NostrEvent): string
```

Builds a badge address string (`30009:pubkey:identifier`) from a badge definition event.

## nip58.hasBeenAwarded

```ts
function hasBeenAwarded(pubkey: string, badgeAwards: NostrEvent[]): boolean
```

Checks if a user has been awarded a specific badge.

## How It Works

- **Kind 30009** — Addressable badge definition created by the issuer
- **Kind 8** — Badge award referencing the badge and listing recipient pubkeys
- **Kind 30008** — User's curated profile badge list (`d` tag: `profile_badges`)
- **Kind 30058** — Badge request from user to issuer (`d` tag: badge address). Addressable, so one active request per badge per user. Withdrawal via NIP-09 deletion
- **Kind 30059** — Badge denial from issuer (`d` tag: request event id). Soft denial — user can re-request. Revocation via NIP-09 deletion
- Acceptance = issuer publishes a standard kind 8 Badge Award (no separate acceptance kind needed)
- Badge addresses follow the format `30009:issuer-pubkey:identifier`
- Request states resolve in priority: Fulfilled > Denied > Pending

### Querying

```ts
// Issuer finds incoming requests
{ kinds: [30058], '#p': ['<issuer-pubkey>'] }

// User finds own outgoing requests
{ kinds: [30058], authors: ['<user-pubkey>'] }

// User finds denials
{ kinds: [30059], '#p': ['<user-pubkey>'] }
```
